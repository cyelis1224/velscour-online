const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');

if (fs.existsSync(out)) {
  fs.rmSync(out, { recursive: true, force: true });
}
fs.mkdirSync(out, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

const items = ['index.html', 'manifest.webmanifest', 'assets', 'css', 'src', 'vendor', 'defense'];
for (const item of items) {
  const src = path.join(root, item);
  const dest = path.join(out, item);
  if (fs.existsSync(src)) {
    console.log(`Copying ${item} -> www/${item}`);
    copyRecursive(src, dest);
  }
}

console.log('Mobile web assets prepared in www/');
