// Node setup for the no-browser tests: fills ART from defense/data/art_index.json and builds the card catalog.
import { readFileSync } from 'fs';
import { ART } from '../src/core/assets.js';
import { buildCatalog } from '../src/data/cards.js';

const a = JSON.parse(readFileSync(new URL('../data/art_index.json', import.meta.url), 'utf8'));
Object.assign(ART, a);
ART.byId = Object.fromEntries(a.monsters.map((m) => [m.id, m]));
buildCatalog();
export { ART };
