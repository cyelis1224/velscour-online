# VELSCOUR DEFENSE: story bible

The cast, the eight regions and the 80 stages are data: `defense/src/data/cast.js` (the Bastion Sixteen, with voice
notes), `defense/src/data/campaign.js` (`REGIONS`, `LEVELS`: names and one-line situations). Who leads each of the
320 dialogs is `defense/docs/dialog_schedule.json`, made by `node defense/tools/dialog_schedule.mjs`. The dialogs
themselves are `defense/src/data/dialogs/part1.js` .. `part4.js` (stages 1-20, 21-40, 41-60, 61-80).

## Premise
Velscour, the Demon Lord who waits at Depth 500 beneath Herrington Hollow (the main game), has torn a **Riftgate**
open on the surface: a huge blue-black wound in the air at the edge of the Hollow. His horde pours out of it in
waves. Sixteen heroes, **the Bastion Sixteen**, answer the call of **the Commander** (the player: never named, never
speaks, addressed as "Commander"). The Commander fights from **the Bastion**, a field fortress around a glowing
**Bastion Heart**. Every monster that reaches the Heart cracks it; if it breaks, the stage is lost. The heroes are
deployed onto **posts** beside and on the roads the horde must walk: fighters hold the road and block, shooters and
casters take the high posts.

**Rift cards.** The Riftgate leaks *Rift Cards*: echoes of heroes, weapons, armour and relics from every timeline
Velscour has touched. The Commander draws them at the **Summoning Altar** (the game's packs; there is no money in this,
only Soul Shards won in battle). The Sixteen know about this and have opinions ("There is a card of me with a better
helmet. I want it destroyed.").

**Rule of the world:** the battle levels-ups the Commander buys during a stage (Valor) fade when the stage ends; what is
learned and forged at the Bastion between stages stays. Heroes may mention this ("the rift's strength never lasts past
the fight").

## Arc by region (keep continuity with it)
1. **Herrington Outskirts (1-10).** The company assembles. Corwin is uneasy that Varric is here at all; Brakka and Gloop
   are a comedy act; Jasper starts *The Ballad of the Bastion* and keeps revising it; Wren keeps a kill tally. Boss: the
   Horned Warlord, Velscour's vanguard champion. Afterwards they find the rift's roots run under the Hollow.
2. **The Catacomb Breach (11-20).** Mortimer guides them through the catacombs and greets the dead politely; Maudlin
   gossips and haggles; Flint worries his bombs will bring the roof down, Ismene wants to set things on fire anyway.
   Stage 19: the tomb of Mortimer's old teacher, **Master Ebon Sallow**, has been broken open from below. Boss: the King
   Below the Floor, a vast worm. They learn the Candle King is gathering the dead at the Ashen Cathedral.
3. **The Ashen Cathedral (21-30).** The Dawn Order's burned cathedral, where Corwin and Varric took their vows together
   at the font. Varric admits the Runeblade still whispers to him in Velscour's voice. Selene's code of honour; Jasper vs.
   the dead choir. Boss: the Candle King. Afterwards Varric says he fell to the whisper at Frostfang Pass.
4. **Frostfang Pass (31-40).** Halvard's Hanging Monastery (stage 36: he says one full, long sentence, the most he says
   in the whole campaign); Kestrel learns patience from him; Cassius reads dark omens; stage 38, the Knight's Cairn: Varric
   faces where he fell; the blade whispers "Velscour waits." Boss: the Frost Leviathan. From the summit they see a
   sandstorm in the south: more of the horde, coming out of the Sea of Sand.
5. **The Sea of Sand (41-50).** Flint's old salvage rig, the Rusted Dredge, and his lost crew (stage 46); Selene and Flint
   talk trajectories; Brakka hates sand; over the Tomb of the Sun Kings Cassius finds the stars wrong, and they point
   to the Dark Forest. Boss: the Grave-Star Colossus.
6. **The Dark Forest (51-60).** Wren's home woods, rotting; Nkemi's spirits are frightened; stage 56, Maudlin's old hut (she
   is embarrassed by the decor); Gloop finds the damp delightful. Boss: the Sleeper in the Roots, the fungal thing
   poisoning the forest. Then a messenger crow: Ironcrown Castle is besieged.
7. **The Siege of Ironcrown (61-70).** Ysolde and her dragon spirit Cinder; the Kestrel/Ysolde rivalry turns into respect;
   stage 68, an embassy from Gloop's lost slime kingdom (led by his cousin, **Duke Wobblesworth**) asks him to come home
   and be king again; he chooses the company. Halvard holds the throne stair. Boss: the Black Throne Engine. The company
   decides to go through the Riftgate itself.
8. **Beyond the Riftgate (71-80).** Through the gate; Mortimer frees souls from the chains; Nkemi speaks to the spirits of the
   Abyss; stage 76, the Mirror of Varric: Varric faces what he was and Corwin calls him brother again; stage 78 they
   build the Last Bastion inside the Abyss. Final boss: the Wound Without End, the Avatar of Velscour that holds the rift
   open. Epilogue (stage 80's end dialogs): the Avatar breaks, but Velscour laughs from below: he still waits at Depth
   500. The Riftgate shrinks to a blue-black portal at the edge of Herrington Hollow, and the Sixteen agree to keep
   watching it.

## Writing rules for the dialogs
- 320 dialogs; each stage has 2 at its **beginning** (what lies ahead: the place, the horde, worries, plans) and 2 at its
  **end** (what just happened, aftermath, banter, what comes next). Boss stages are dramatic.
- The schedule fixes each dialog's `lead` (speaks first) and `with` (must speak at least once). A third hero may chime in
  with at most one line.
- 2 to 5 lines a dialog, each line at most 180 characters. Speaker ids are the cast ids (`corwin`, `wren`, ...).
- Each hero sounds like their voice note. Halvard says very little (often one short line). Gloop says "We". Ysolde
  argues with Cinder. Jasper rhymes sometimes. Maudlin talks to her crows. Mortimer thanks his skeletons.
- Mention the Commander now and then. Mention concrete things from the stage's situation line. No modern slang, no
  profanity worse than "damn". Humour and drama both; don't repeat a joke.
- Optional third element per line: a mood, one of `angry`, `laugh`, `sad`, `shout`, `fear`, `smug`, `think`.

## Acts II and III (stages 81-200)
The Avatar is broken, but Velscour answers by tearing **Scars** (lesser rifts) across the land. The Riftgate stays open
as a blue-black portal in the Hollow; the Commander's Bastion goes wherever a Scar opens. Each region has a lieutenant
(stage 5), a **warlord** (a painted giant in the last wave of stage 8) and a boss (stage 10).

**Act II: The Six Scars (81-140).** The company closes Scars one by one and realises they are not random.
9. **The Drowned Sewers (81-90).** The first Scar opens under the Hollow's own market. Mortimer knows the bone drain;
   Flint hates the damp; Gloop loves it. Boss: the Deepwell Angler.
10. **The Glasswind Dunes (91-100).** Dunes fused to glass. Cassius fixes a ruined observatory and sees the Scars form a
    pattern (stage 96). Boss: the Sandstone Scarab Emperor.
11. **The Bone Orchard (101-110).** Trees fruiting bones over an old war's graves; Varric recognises names (stage 106).
    Boss: the Gallows Oak Hangman.
12. **The Hoarfrost Citadel (111-120).** A frozen garrison still at its posts. Halvard and Varric, quiet together.
    Boss: the Glacier Crown Titan.
13. **The Sunken Temple (121-130).** A sea gods' temple raised by the tide. Selene and Jasper; the drowned choir.
    Boss: the Coral Throne Leviathan.
14. **Emberfall Caldera (131-140).** A volcano woken by a Scar. Cinder knew this mountain; stage 134 is his old lair and
    Ysolde learns why he died. Boss: the Obsidian Volcano Beast. At the end of Act II, Cassius's map is complete: all
    the Scars bleed from one wound, the Eternal Breach, and the way there runs through the Veilscar.

**Act III: The Breach (141-200).** The company goes down to the wound itself.
15. **The Veilscar March (141-150).** Heath where the veil between the living and the Abyss is worn through; Nkemi hears
    both sides. Boss: the Antlered Moon Eater.
16. **The Weeping Abbey (151-160).** Monks who once sang a Scar shut now sing it open. Corwin and Jasper. Boss: the Wax
    Cathedral Saint.
17. **The Mirefen Bogs (161-170).** Bogs that breathe. Gloop is almost home; Maudlin's sister once lived here (a rumour
    she will neither confirm nor deny). Boss: the Fen Trident Hydra.
18. **The Clockwork Foundry (171-180).** Velscour's foundry. Flint is horrified and fascinated and steals blueprints.
    Boss: the Clockwork Mantis Monarch.
19. **The Eternal Breach (181-190).** The wound every Scar bleeds from; candles of earlier defenders still lit; Corwin reads
    their names. Boss: the Void Shell Emperor.
20. **The Screaming Throne (191-200).** Velscour's own throne at the bottom of the Breach, alive, letting its master feel
    every blow. Final boss: the Throne That Screams. Epilogue (stage 200's end): the throne breaks and every Scar
    closes at once; from Depth 500 Velscour stops laughing for the first time. He still waits, but now he is afraid of
    sixteen people and a Commander. The Riftgate in the Hollow dims to a quiet blue.

Acts II and III have one dialog at the beginning of every stage and one at the end of every lieutenant and boss stage
(144 in all, `defense/docs/dialog_schedule2.json`, `defense/src/data/dialogs/part5.js` .. `part8.js`: stages 81-110,
111-140, 141-170, 171-200). Same rules as Act I.

## Acts IV and V (stages 201-300)
Stage 200's epilogue is no longer the end: when the Screaming Throne breaks, a road of ash opens beneath it, going down
toward Depth 500. Velscour has stopped laughing; now he sends everything. The Sixteen go down after him.

**Act IV: The Descent (201-250).**
21. **The Ashen Road (201-210).** Under the broken throne, a road of ash. Brakka and Ysolde lead; Ismene finds ash she
    cannot burn. Boss: the Ashen Phoenix Horror.
22. **The Hollow Deeps (211-220).** Caverns where the dark has weight; a camp of dwarves who dug too deep (Flint trades
    for powder, stage 217); Nkemi's spirits fall silent down here. Boss: the World-Eater Below.
23. **The Crystal Galleries (221-230).** Living crystal that sings back every sound; Jasper tunes it (223); the mirror pools
    show Kestrel who he was (226). Boss: the Stormshell Tortoise.
24. **The Drowned Kingdom (231-240).** A kingdom Velscour drowned a thousand years ago, still lit, its people still walking
    the streets; Gloop sits on the drowned king's throne (237) and nobody stops him; the king's last order is "hold"
    (239). Boss: the Brine Testament.
25. **The Bonefields of Morrow (241-250).** Every army that ever marched on Velscour lies here; knights of the Dawn Order
    who came before Corwin (243); a stone with Varric's name on it, though he has never been here (247). Boss: the
    Depth That Remembers. Act IV ends at a plain, unlocked door: Depth 500.

**Act V: The Demon Lord (251-300).**
26. **The Gate of Teeth (251-260).** Velscour's domain begins at a gate that is a mouth, and it is open. Boss: the Flayed Titan.
27. **The Burning Archive (261-270).** Velscour's library of every world he has eaten, burning forever; Cassius finds the
    Hollow on a map (264); a half-written book about the Sixteen (267). Boss: the Furnace Colossus.
28. **The Garden of Hooks (271-280).** Everything has hooks; spiders tend it; Maudlin borrows a trowel (274). Boss: the
    Hundred-Handed Widow.
29. **The Last Rampart (281-290).** Velscour's last wall, built from the gates of every city he broke; Halvard approves of
    the masonry (289). Boss: the Iron Choir Absolute.
30. **Velscour's Hall (291-300).** The hall at Depth 500. A banquet table set for sixteen (296); Velscour's trophy gallery
    with an empty space for each of them (293). Final boss: **Velscour's Shadow**, the darkest part of the Demon Lord
    (art: the Cathedral Devourer). Epilogue (stage 300's end): the Shadow breaks; Velscour himself, wounded for the first
    time, withdraws so deep even Depth 500 is above him. The Sixteen walk home up the deep roads; the Riftgate in the
    Hollow closes to a single blue spark, which Jasper insists is a star and everyone lets him.

Acts IV and V follow the Act II-III pattern: one dialog at the beginning of every stage and one at the end of every
lieutenant and boss stage (`dialog_schedule2.json`; `part9.js`..`part12.js`: stages 201-225, 226-250, 251-275, 276-300).
Continuity from Acts II-III to keep: the old war of Thornmarch (Varric's men, the Bone Orchard), Cinder died on a Scar
300 years ago at the Caldera, Maudlin's sister Mirabel (unconfirmed), Mortimer's skeletons Ellery, Pim, Gaunt Agnes and
Bartholomew, Maudlin's crows (Beakworth, Mildred, Mabel), Wren's running tally, Jasper's Ballad of the Bastion (stage
200 gave its last word: "home"; Act IV starts a second ballad).
