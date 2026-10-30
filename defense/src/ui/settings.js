// Settings: sound, story scenes, damage numbers, the save, and the way back to Herrington Hollow.
import { D, save, resetSave } from '../state.js';
import { el } from '../core/util.js';
import { applyVolumes } from '../core/audio.js';
import { modal, show, switchEl } from './app.js';

export function render(root) {
  const s = D.save.settings;
  root.innerHTML = `<div class="panel" style="max-width:560px">
    <div class="toggle"><span>Sound effects</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></div>
    <div class="toggle"><span>Music & ambience</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></div>
    <div class="toggle"><span>Skip story scenes</span><span data-k="skip"></span></div>
    <div class="toggle"><span>Damage numbers</span><span data-k="nums"></span></div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" data-k="home">⟲ Return to Herrington Hollow</button><button class="btn red" data-k="reset">Reset Defense save</button></div>
    <p class="dim" style="font-size:12px">VELSCOUR DEFENSE keeps its own save (it never touches your VELSCOUR heroes). No purchases exist in this game.</p></div>`;
  for (const k of ['sfx', 'music']) root.querySelector(`[data-k=${k}]`).oninput = (e) => { s[k] = +e.target.value; applyVolumes(); save(); };
  root.querySelector('[data-k=skip]').appendChild(switchEl(s.skipDialogs, (v) => { s.skipDialogs = v; save(); }));
  root.querySelector('[data-k=nums]').appendChild(switchEl(s.numbers !== false, (v) => { s.numbers = v; save(); }));
  root.querySelector('[data-k=home]').onclick = () => { save(true); location.href = '../index.html'; };
  root.querySelector('[data-k=reset]').onclick = () => modal('<h2>Reset VELSCOUR DEFENSE?</h2><p>Every card, stage and reward here starts over. Your main VELSCOUR heroes are not touched.</p>',
    [{ label: 'Cancel', cls: 'ghost' }, { label: 'Reset', cls: 'red', fn: () => { resetSave(); show('hub'); } }]);
}
