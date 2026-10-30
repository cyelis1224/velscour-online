// The 320 campaign dialogs (docs/STORY.md), each with its stage, when it plays and who leads (docs/dialog_schedule.json).
import p1 from './part1.js';
import p2 from './part2.js';
import p3 from './part3.js';
import p4 from './part4.js';
import p5 from './part5.js';
import p6 from './part6.js';
import p7 from './part7.js';
import p8 from './part8.js';
import p9 from './part9.js';
import p10 from './part10.js';
import p11 from './part11.js';
import p12 from './part12.js';

// ids: L01b1 (Act I, stage 1, beginning, first) or L081b1 (Acts II-III)
export const DIALOGS = [...p1, ...p2, ...p3, ...p4, ...p5, ...p6, ...p7, ...p8, ...p9, ...p10, ...p11, ...p12].map((d) => { const m = /^L(\d+)([be])\d$/.exec(d.id); return { ...d, level: +m[1], at: m[2] === 'b' ? 'begin' : 'end' }; });
