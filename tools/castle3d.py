#!/usr/bin/env python3
"""
The 3D castle's bake inputs and outputs (docs/CASTLE_3D.md).

    python tools/castle3d.py textures        # masonry from the Castle Keep pack, the variants' roofs -> assets/source/castle3d/tex/
    node tools/castle3d_bake.js [ids|all]    # three.js bake -> assets/source/castle3d/out/[<dir>/] (PNG pages + index)
    python tools/castle3d.py pack [ids|all]  # out/ -> assets/tiles/castle3d/[<dir>/] (lossless WebP + index.json), then repack
    python tools/castle3d.py repack [ids|all]  # re-cut the published pages into 2048 px pages grouped by place (see repack)

textures: the Castle Keep pack's wall materials are horizontally tileable strips; they are also made to tile
vertically (the strip's top and bottom cross-faded over a band of courses), so a wall of any height wraps them.
A slate texture for the roofs is drawn here (rows of overlapping slates with a little colour noise).
"""
import io
import re
import json
import os
import sys
import zipfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source", "castle3d")
OUT = os.path.join(ROOT, "assets", "tiles", "castle3d")
GREY = {"ashlar": 0.55, "chapel": 0.35}
MATERIALS = {"ashlar": "royal_ashlar", "brick": "underkeep_brick", "iron": "armory_ironstone", "chapel": "chapel_carving",
             "panel": "great_hall_paneling"}
# The pack's source sheet holds ten wall materials in a 5 x 2 grid (about 396 px a cell); five of them became the
# materials above (each a crop one horizontal period wide, full height). The other five are cut here the same way for
# the castle variants (src/data/castles.js): [cell column, cell row].
SHEET = "source_art/generated/castle_keep_wall_materials_10.png"
EXTRA = {"slatestone": (1, 0), "basalt": (2, 0), "rubble": (1, 1), "mossy": (2, 1), "soot": (4, 1)}
# The variants' roofs: [pattern, base colour, overlay] (see roof() below).
ROOFS = {"roof_blue": ("slate", (58, 92, 172), None), "roof_terracotta": ("pantile", (178, 86, 54), None),
         "roof_moss": ("slate", (72, 80, 66), "moss"), "roof_snow": ("slate", (66, 72, 88), "snow"),
         "roof_char": ("slate", (44, 40, 38), "soot"), "roof_copper": ("seam", (86, 156, 136), None),
         "roof_gold": ("scale", (214, 166, 58), None), "roof_black": ("scale", (40, 36, 44), None),
         "roof_violet": ("slate", (92, 62, 128), None)}


def tile_vertically(a, band=48):
    """Cross-fade the strip's last `band` rows into its first, so it repeats top to bottom."""
    a = a.astype(np.float32)
    h = a.shape[0] - band
    out = a[:h].copy()
    t = np.linspace(0, 1, band)[:, None, None]
    out[:band] = a[h:h + band] * (1 - t) + a[:band] * t
    return out.clip(0, 255).astype(np.uint8)


def slate(w=256, h=256, seed=7):
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 3), np.float32)
    row, sw = 16, 28
    for r in range(h // row):
        off = (r % 2) * sw // 2
        for c in range(-1, w // sw + 1):
            x0 = c * sw + off
            base = np.array([84, 88, 100]) * rng.uniform(0.82, 1.12) + rng.normal(0, 3, 3)
            for y in range(row):
                k = 1.0 - 0.35 * (y / row)          # each slate darker toward its foot (the overlap)
                xs = slice(max(0, x0 + 1), max(0, min(w, x0 + sw - 1)))
                img[r * row + y, xs] = base * k
            img[r * row:(r + 1) * row, max(0, min(w - 1, x0))] *= 0.55
        img[r * row + row - 1] *= 0.5
    img += rng.normal(0, 4, img.shape)
    return img.clip(0, 255).astype(np.uint8)


def wood(w=128, h=256, seed=3):
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 3), np.float32)
    pw = 16
    for c in range(w // pw):
        base = np.array([92, 62, 38]) * rng.uniform(0.8, 1.15)
        y = np.arange(h)[:, None]; x = np.arange(pw)[None, :]
        grain = np.sin((x * 0.9 + y * 0.05 + rng.uniform(0, 6)) * 1.7 + np.sin(y * 0.07 + c) * 2.0) * 0.08
        img[:, c * pw:(c + 1) * pw] = base * (1 + grain)[..., None]
        img[:, c * pw] *= 0.45; img[:, c * pw + 1] *= 0.8
    img += rng.normal(0, 3, img.shape)
    return img.clip(0, 255).astype(np.uint8)


def cut_material(sheet, col, row, cell=396.6):
    """One material from the source sheet: the cell's best horizontal period, full height, its seam cross-faded."""
    a = sheet.astype(np.float32)
    x0, y0 = int(round(col * cell)) + 6, int(round(row * cell)) + 5
    c = a[y0:y0 + 386, x0:x0 + int(cell) - 14]
    best = min(range(120, 260), key=lambda p: np.abs(c[:, :c.shape[1] - p] - c[:, p:]).mean())
    out = c[:, :best].copy()
    band = 10                                   # blend the last columns toward the ones after the period's start
    t = np.linspace(0, 1, band)[None, :, None]
    out[:, best - band:] = c[:, best - band:best] * (1 - t) + c[:, :band] * t
    return out.clip(0, 255).astype(np.uint8), best


def roof(pattern, base, overlay, w=256, h=256, seed=11):
    """A roof texture: slates in offset rows, clay pantiles, fish-scale shingles or a standing-seam metal sheet, in
    the base colour; then moss, snow or soot laid over it."""
    rng = np.random.default_rng(seed)
    base = np.array(base, np.float32)
    img = np.zeros((h, w, 3), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    if pattern == "slate":
        row, sw = 16, 28
        for r in range(h // row):
            off = (r % 2) * sw // 2
            for c in range(-1, w // sw + 1):
                x0 = c * sw + off
                tone = base * rng.uniform(0.82, 1.14) + rng.normal(0, 3, 3)
                for y in range(row):
                    xs = slice(max(0, x0 + 1), max(0, min(w, x0 + sw - 1)))
                    img[r * row + y, xs] = tone * (1.0 - 0.35 * (y / row))
                img[r * row:(r + 1) * row, max(0, min(w - 1, x0))] *= 0.55
            img[r * row + row - 1] *= 0.5
    elif pattern == "pantile":   # barrel tiles: a lit crown down each column, dark troughs, the row's lower lip shadowed
        row, tw = 16, 16
        for r in range(h // row):
            for c in range(w // tw):
                tone = base * rng.uniform(0.86, 1.12) + rng.normal(0, 4, 3)
                for x in range(tw):
                    k = 0.62 + 0.5 * np.sin(np.pi * (x + 0.5) / tw) ** 0.8
                    for y in range(row):
                        img[r * row + y, c * tw + x] = tone * k * (1.0 - 0.3 * (y / row) ** 2)
            img[r * row + row - 2:r * row + row] *= 0.55
    elif pattern == "scale":     # fish-scale shingles: rows of rounded tongues, each lit at its crown (tiles: w, h / 16)
        row, sw = 16, 16
        for r in range(h // row + 1):
            off = (r % 2) * sw // 2
            for c in range(-1, w // sw + 2):
                cx, cy = c * sw + off + sw / 2, r * row
                tone = base * rng.uniform(0.85, 1.15) + rng.normal(0, 4, 3)
                for wy in (0, h):          # wrap vertically
                    d = np.hypot(((xx - cx + w / 2) % w - w / 2) / (sw / 2), (yy - cy + wy) / row)
                    m = (d < 1) & (yy + wy >= cy)
                    img[m] = tone * (1.15 - 0.55 * d[m, None])
                    img[m & (d > 0.88)] *= 0.5
    else:                        # standing seam: sheets between raised seams, streaked by weather
        sw = 16
        img[:] = base
        img *= (1 + 0.06 * np.sin(yy * 2 * np.pi / h * 3 + rng.uniform(0, 6)))[..., None]
        for c in range(w // sw):
            x = c * sw
            img[:, x:x + 2] = base * 1.35
            img[:, x + 2:x + 4] *= 0.55
            img[:, x + 4:x + sw] *= rng.uniform(0.9, 1.08)
        img *= (1 + 0.05 * rng.normal(0, 1, (1, w)))[..., None]
    img += rng.normal(0, 4, img.shape)
    if overlay:
        n = np.zeros((h, w), np.float32)
        for s in (32, 16, 8):      # tileable value noise from a few octaves of wrapped random grids
            g = rng.random((h // s + 1, w // s + 1)); g[-1] = g[0]; g[:, -1] = g[:, 0]
            fy, fx = (yy % s) / s, (xx % s) / s; iy, ix = yy // s, xx // s
            v = g[iy, ix] * (1 - fx) * (1 - fy) + g[iy, ix + 1] * fx * (1 - fy) + g[iy + 1, ix] * (1 - fx) * fy + g[iy + 1, ix + 1] * fx * fy
            n += v * s
        n = (n - n.min()) / (n.max() - n.min())
        col, cut = {"moss": ((78, 100, 52), 0.62), "snow": ((236, 240, 248), 0.4), "soot": ((18, 16, 15), 0.5)}[overlay]
        a = np.clip((n - cut) / 0.12, 0, 1)[..., None]
        img = img * (1 - a) + np.array(col, np.float32) * a * (1 + rng.normal(0, 0.03, (h, w, 1)))
        if overlay == "soot":       # embers glowing in the char
            e = (rng.random((h, w)) < 0.004) & (n > 0.6)
            img[e] = (190, 80, 30)
    return img.clip(0, 255).astype(np.uint8)


def textures():
    os.makedirs(os.path.join(SRC, "tex"), exist_ok=True)
    z = zipfile.ZipFile(os.path.join(ROOT, "assets", "source", "biomes", "Castle_Keep_Biome_Pack.zip"))
    for k, name in MATERIALS.items():
        a = np.array(Image.open(io.BytesIO(z.read("materials/%s.png" % name))).convert("RGB"))
        if k in GREY:   # the castle pack's limestone is greyer than the keep pack's ashlar
            g = a.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
            a = (a * (1 - GREY[k]) + g[..., None] * GREY[k]).clip(0, 255).astype(np.uint8)
        Image.fromarray(tile_vertically(a)).save(os.path.join(SRC, "tex", k + ".png"))
    sheet = np.array(Image.open(io.BytesIO(z.read(SHEET))).convert("RGB"))
    for k, (col, row) in EXTRA.items():
        a, p = cut_material(sheet, col, row)
        print("  %s: period %d px" % (k, p))
        Image.fromarray(tile_vertically(a)).save(os.path.join(SRC, "tex", k + ".png"))
    for k, (pattern, base, overlay) in ROOFS.items():
        Image.fromarray(roof(pattern, base, overlay)).save(os.path.join(SRC, "tex", k + ".png"))
    Image.fromarray(slate()).save(os.path.join(SRC, "tex", "slate.png"))
    Image.fromarray(wood()).save(os.path.join(SRC, "tex", "wood.png"))
    print("textures:", sorted(os.listdir(os.path.join(SRC, "tex"))))


def variant_dirs():
    """The castle variants' bake folders (src/data/castles.js look.dir; '' for the first castle), by id."""
    src = open(os.path.join(ROOT, "src", "data", "castles.js"), encoding="utf8").read()
    ids = re.findall(r"(?m)^\s*id: '([a-z_]+)', name:", src)
    dirs = re.findall(r"look: [{] dir: '([a-z_]*)'", src)
    return dict(zip(ids, dirs))


def pack(ids=None):
    dirs = variant_dirs()
    for vid in (ids or [next(iter(dirs))]):
        sub = dirs[vid]
        src, out = os.path.join(SRC, "out", sub), os.path.join(OUT, sub)
        os.makedirs(out, exist_ok=True)
        idx = json.load(open(os.path.join(src, "index.json")))
        for p in idx["pages"]:
            Image.open(os.path.join(src, p + ".png")).save(os.path.join(out, p + ".webp"), lossless=True, quality=100, method=6)
        for f in os.listdir(out):   # pages of an older, bigger bake
            if f.startswith("pieces_") and f[:-5] not in idx["pages"]:
                os.remove(os.path.join(out, f))
        idx["pages"] = [p + ".webp" for p in idx["pages"]]
        json.dump(idx, open(os.path.join(out, "index.json"), "w"), separators=(",", ":"))
        print("castle3d %s: %d pages, %d pieces, %d tiles, %.1f MB" % (vid, len(idx["pages"]), len(idx["pieces"]), len(idx["tiles"]) // 3,
              sum(os.path.getsize(os.path.join(out, p)) for p in idx["pages"]) / 1e6))
    repack(ids)


def _save_page(args):
    img, path = args
    img.save(path, "WEBP", lossless=True, quality=100, method=6)


def repack(ids=None, page=2048):
    """Re-cut a castle's published pages into smaller ones grouped by where their pieces stand on the map, so a view
    draws from a few pages instead of all of them. A phone's GPU keeps some 128-256 MB of textures: the bake's 4096 px
    pages (64 MB each) all drawn in one frame swapped in and out every frame (Goldspire's five: ~0.7 s a frame on a 4x
    slowed CPU). The pieces are the same pixels; each page is cropped to the rows it uses."""
    from multiprocessing import Pool
    dirs, W = variant_dirs(), 336
    for vid in (ids or [next(iter(dirs))]):
        out = os.path.join(OUT, dirs[vid])
        idx = json.load(open(os.path.join(out, "index.json")))
        S, P = idx["S"], idx["pieces"]
        old = []
        for p in idx["pages"]:
            with Image.open(os.path.join(out, p)) as im:
                old.append(im.convert("RGBA"))
        # where each piece is drawn (world px, screen space): a tile's at its ground corner, a roof strip's absolute, a
        # moving part's at its anchor; a piece several tiles share goes with the first of them
        ground = [None] * len(P)
        t = idx["tiles"]
        for k in range(0, len(t), 3):
            if ground[t[k + 2]] is None:
                x, y = t[k] % W, t[k] // W
                ground[t[k + 2]] = ((x - y) * 32, (x + y) * 16)
        mv = idx.get("moving") or {}
        for m in [mv[k] for k in ("drawbridge", "portcullis") if k in mv] + list(mv.get("doors", [])):
            ax, ay = m["anchor"]
            for i in m["frames"]:
                if ground[i] is None:
                    ground[i] = ((ax - ay) * 32, (ax + ay) * 16)
        centre = [((ground[i] or (0, 0))[0] + p[5] + p[3] / S / 2, (ground[i] or (0, 0))[1] + p[6] + p[4] / S / 2) for i, p in enumerate(P)]
        gut = 1

        def shelves(items):   # {piece: (x, y)} on one page (skyline, lowest spot first; tallest first), or None
            sky = [[0, 0, page]]   # segments [x, y, w] of the skyline, left to right
            place = {}
            for i in sorted(items, key=lambda i: (-P[i][4], -P[i][3])):
                w, h = P[i][3] + gut, P[i][4] + gut
                best = None
                for k in range(len(sky)):
                    x, top, room, j = sky[k][0], 0, 0, k
                    if x + w > page:
                        break
                    while room < w:
                        top, room, j = max(top, sky[j][1]), room + sky[j][2], j + 1
                    if top + h <= page + gut and (best is None or top < best[1]):
                        best = (x, top, k, j)
                if best is None:
                    return None
                x, top, k, j = best
                place[i] = (x, top)
                end = sky[j - 1][0] + sky[j - 1][2]
                rest = [[x + w, sky[j - 1][1], end - x - w]] if end > x + w else []
                sky[k:j] = [[x, top + h, w]] + rest
                merged = [sky[0]]
                for s in sky[1:]:
                    if s[1] == merged[-1][1]:
                        merged[-1][2] += s[2]
                    else:
                        merged.append(s)
                sky = merged
            return place

        groups = []

        def split(items):   # halve along the longer side (by area) until a half fits a page
            area = sum((P[i][3] + gut) * (P[i][4] + gut) for i in items)
            if area <= page * page * 0.9:
                place = shelves(items)
                if place is not None:
                    groups.append(place)
                    return
            xs, ys = [centre[i][0] for i in items], [centre[i][1] for i in items]
            axis = 0 if max(xs) - min(xs) >= max(ys) - min(ys) else 1
            items = sorted(items, key=lambda i: centre[i][axis])
            run, half, cut = 0, area / 2, 1
            for k, i in enumerate(items):
                run += (P[i][3] + gut) * (P[i][4] + gut)
                if run >= half:
                    cut = max(1, min(len(items) - 1, k + 1))
                    break
            split(items[:cut])
            split(items[cut:])

        split(list(range(len(P))))
        pieces, jobs, names = [None] * len(P), [], []
        for g, place in enumerate(groups):
            h = max(y + P[i][4] for i, (x, y) in place.items())
            img = Image.new("RGBA", (page, h), (0, 0, 0, 0))
            for i, (x, y) in place.items():
                pg, sx, sy, w, hh, ox, oy = P[i]
                img.paste(old[pg].crop((sx, sy, sx + w, sy + hh)), (x, y))
                pieces[i] = [g, x, y, w, hh, ox, oy]
            name = "pieces_%d.webp" % g
            names.append(name)
            jobs.append((img, os.path.join(out, name + ".tmp")))
        # every piece cut from its new page is the same pixels as from its old one
        for i, (g, x, y, w, h, _, _) in enumerate(pieces):
            pg, sx, sy = P[i][:3]
            if old[pg].crop((sx, sy, sx + w, sy + h)).tobytes() != jobs[g][0].crop((x, y, x + w, y + h)).tobytes():
                sys.exit("repack %s: piece %d changed" % (vid, i))
        with Pool() as pool:
            pool.map(_save_page, jobs)
        for f in os.listdir(out):
            if f.startswith("pieces_") and f.endswith(".webp"):
                os.remove(os.path.join(out, f))
        for name in names:
            os.replace(os.path.join(out, name + ".tmp"), os.path.join(out, name))
        idx["pages"], idx["pieces"] = names, pieces
        json.dump(idx, open(os.path.join(out, "index.json"), "w"), separators=(",", ":"))
        mpx = sum(page * max(y + P[i][4] for i, (x, y) in pl.items()) for pl in groups) / 1e6
        print("castle3d %s: repacked into %d pages of %d px by place, %.1f Mpx decoded, %.1f MB" % (vid, len(names), page, mpx,
              sum(os.path.getsize(os.path.join(out, n)) for n in names) / 1e6))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "pack":
        arg = sys.argv[2] if len(sys.argv) > 2 else ""
        pack(list(variant_dirs()) if arg == "all" else arg.split(",") if arg else None)
    elif cmd == "repack":
        arg = sys.argv[2] if len(sys.argv) > 2 else ""
        repack(list(variant_dirs()) if arg == "all" else arg.split(",") if arg else None)
    elif cmd == "textures":
        textures()
    else:
        sys.exit(__doc__)
