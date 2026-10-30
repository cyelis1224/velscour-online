// The Bastion Sixteen: one named hero per Velscour class, the cast of the campaign's dialogs.
// cls is the Velscour class id (its art); voice is for the dialog writers (docs/STORY.md).
export const CAST = [
  { id: 'corwin', cls: 'paladin', name: 'Ser Corwin Dawnmantle', short: 'Corwin', title: 'The Sunward Wall', color: '#ffd860',
    voice: 'Steady, warm, paternal; dry humour; keeps his oaths and expects others to. Calls the player "Commander".' },
  { id: 'wren', cls: 'ranger', name: 'Wren Ashgrove', short: 'Wren', title: 'The Last Arrow of Ashgrove', color: '#7ccf5a',
    voice: 'Quick, sharp-tongued, keeps a running kill tally; hates walls and waiting; fierce about the Dark Forest, her home.' },
  { id: 'ismene', cls: 'wizard', name: 'Ismene Starquill', short: 'Ismene', title: 'Archmage of the Ember Chair', color: '#ff8a30',
    voice: 'Brilliant, pedantic, vain about her fire; lectures; feuds with Cassius over whether fire or stars are the true art.' },
  { id: 'mortimer', cls: 'necromancer', name: 'Mortimer Vael', short: 'Mortimer', title: 'The Courteous Undertaker', color: '#a070ff',
    voice: 'Impeccably polite, morbid, oddly kind; names and thanks his skeletons; knows the catacombs; trades gossip with Maudlin.' },
  { id: 'brakka', cls: 'barbarian', name: 'Brakka Ironhide', short: 'Brakka', title: 'Breaker of the Northern Gate', color: '#d8853a',
    voice: 'LOUD, cheerful, hungry; wants the biggest monster; bad at plans, good at hope; best friends with King Gloop (once tried to eat him).' },
  { id: 'kestrel', cls: 'dragoon', name: 'Kestrel Varn', short: 'Kestrel', title: 'The Skyhook', color: '#6aa8ff',
    voice: 'Cocky young show-off who wants to touch the sky; teases the silent Halvard; competes with Ysolde over heights and dives.' },
  { id: 'nkemi', cls: 'totem_master', name: 'Nkemi Rootsong', short: 'Nkemi', title: 'Speaker for the Old Spirits', color: '#5ac8a0',
    voice: 'Calm, wise, wry; hears the spirits of every place and passes on what they say; the company\'s mediator.' },
  { id: 'varric', cls: 'death_knight', name: 'Lord Varric Hollowcrest', short: 'Varric', title: 'The Oathless', color: '#7ad0ff',
    voice: 'Grim, laconic, haunted. Once Corwin\'s brother-in-arms in the Dawn Order; fell to Velscour\'s whisper through his Runeblade and came back. The blade still whispers. Seeks redemption.' },
  { id: 'cassius', cls: 'arcane_sorcerer', name: 'Cassius Orrery', short: 'Cassius', title: 'Astronomer Royal of Nowhere', color: '#4aa8ff',
    voice: 'Dramatic, prophetic, reads omens in the stars; grand speeches; bickers with Ismene and secretly admires her.' },
  { id: 'maudlin', cls: 'carrion_witch', name: 'Grandmother Maudlin Crowe', short: 'Maudlin', title: 'Mother of a Thousand Crows', color: '#9ac84a',
    voice: 'Creepy, cackling crone; speaks in riddles and recipes; talks to her crows; darkly funny; fond of Mortimer.' },
  { id: 'jasper', cls: 'bard', name: 'Jasper Quillwind', short: 'Jasper', title: 'Chronicler of the Bastion', color: '#ff6a8a',
    voice: 'Flamboyant showman and flirt; composes ballads about every battle mid-battle; sweet on Selene; narrates to an imagined audience.' },
  { id: 'gloop', cls: 'slime_lord', name: 'King Gloop the Ninth', short: 'Gloop', title: 'Sovereign of the Gelatinous Throne', color: '#4aa8ff',
    voice: 'A deposed slime king. Pompous, uses the royal "We", mangles grand words, wobbles when moved; deeply loyal; Brakka\'s best friend.' },
  { id: 'selene', cls: 'boomerang_knight', name: 'Dame Selene Arcwright', short: 'Selene', title: 'Knight of the Returning Moon', color: '#3ac8a8',
    voice: 'Precise, honour-bound, patient; believes everything thrown returns, deeds included; trades ballistics notes with Flint; tolerates Jasper.' },
  { id: 'halvard', cls: 'lancer', name: 'Brother Halvard Stonewall', short: 'Halvard', title: 'The Silent Bulwark', color: '#c0c0d0',
    voice: 'A monk-soldier under a vow of near-silence. Speaks rarely, in very short sentences, and every word lands. Mentors Kestrel without seeming to.' },
  { id: 'ysolde', cls: 'dragon_knight', name: 'Ysolde Emberscale', short: 'Ysolde', title: 'Bonded of the Red Wyrm', color: '#ff5a2a',
    voice: 'Hot-headed and fearless; bonded to the spirit of a red dragon, Cinder, whom she argues with out loud ("Cinder says..."); rivals Kestrel.' },
  { id: 'flint', cls: 'gunner', name: 'Captain Barnaby Flint', short: 'Flint', title: 'Master of Powder and Brass', color: '#d0a060',
    voice: 'Gruff engineer with a pipe; grumbles about magic; loves gadgets and bombs; ran a desert salvage rig in the Sea of Sand.' },
];

export const CAST_BY_ID = Object.fromEntries(CAST.map((c) => [c.id, c]));
export const CAST_BY_CLASS = Object.fromEntries(CAST.map((c) => [c.cls, c]));
