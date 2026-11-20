'use strict';
const KEY = 'ft.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

let db = { routines: [], sessions: [], active: null, unit: 'kg', step: 2.5 };
try { db = Object.assign(db, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { alert('Could not save data (storage full or blocked).'); } };

let view = { name: 'home' };
let draft = null; // routine being edited
const go = (name, extra = {}) => { view = Object.assign({ name }, extra); render(); window.scrollTo(0, 0); };

// ---------- helpers ----------
const norm = s => s.trim().toLowerCase();
function lastSets(exName) {
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const ex = db.sessions[i].exercises.find(e => norm(e.name) === norm(exName));
    if (ex && ex.sets.length) return { date: db.sessions[i].date, sets: ex.sets };
  }
  return null;
}
const fmtSet = s => `${s.w === '' ? '–' : s.w}${db.unit} × ${s.r}` + (s.rpe !== '' ? ` @${s.rpe}` : '');
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const elapsed = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

// ---------- views ----------
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on',
    b.dataset.go === view.name || (b.dataset.go === 'home' && ['routine', 'workout'].includes(view.name)) ||
    (b.dataset.go === 'history' && view.name === 'exercise')));
  const fn = { home: vHome, routine: vRoutine, workout: vWorkout, history: vHistory, exercise: vExercise, settings: vSettings }[view.name];
  $('#title').textContent = { home: 'Train', routine: 'Edit routine', workout: db.active ? db.active.name : 'Workout', history: 'History', exercise: view.ex || 'Exercise', settings: 'Settings' }[view.name];
  $('#app').innerHTML = fn();
  tick();
}

function vHome() {
  let h = '';
  if (db.active) h += `<div class="card banner"><div class="row sp"><div><b>${esc(db.active.name)}</b><div class="dim">Workout in progress</div></div><button class="b" data-a="resume">Resume</button></div></div>`;
  if (!db.routines.length) h += `<div class="empty">No routines yet.<br>Create your first plan below.</div>`;
  db.routines.forEach(r => {
    h += `<div class="card"><div class="row sp"><div><b>${esc(r.name)}</b><div class="dim">${r.exercises.map(e => esc(e.name) + ` ${e.sets}${e.reps ? '×' + esc(e.reps) : ' sets'}`).join(' · ') || 'No exercises'}</div></div>
      <button class="ic" data-a="edit" data-id="${r.id}">✎</button></div>
      <div class="gap"><button class="b wide" data-a="start" data-id="${r.id}">Start workout</button></div></div>`;
  });
  return h + `<button class="b alt wide" data-a="new">+ New routine</button>`;
}

function vRoutine() {
  const d = draft;
  let h = `<div class="card"><label class="dim">Routine name</label><input type="text" id="rname" value="${esc(d.name)}" placeholder="e.g. Push A"></div>`;
  d.exercises.forEach((e, i) => {
    h += `<div class="card"><div class="row"><input type="text" data-k="exname" data-i="${i}" value="${esc(e.name)}" placeholder="Exercise name">
      <button class="ic" data-a="up" data-i="${i}">↑</button><button class="ic" data-a="down" data-i="${i}">↓</button><button class="ic" data-a="rmex" data-i="${i}">✕</button></div>
      <div class="row gap"><div style="width:90px"><label class="dim">Sets</label><input type="number" inputmode="numeric" min="1" data-k="exsets" data-i="${i}" value="${e.sets}"></div>
      <div style="flex:1"><label class="dim">Target reps</label><input type="text" data-k="exreps" data-i="${i}" value="${esc(e.reps || '')}" placeholder="e.g. 6-8"></div></div></div>`;
  });
  h += `<button class="b alt wide" data-a="addex">+ Add exercise</button><div class="gap row"><button class="b wide" data-a="saveroutine">Save</button><button class="b alt wide" data-a="home">Cancel</button></div>`;
  if (db.routines.some(r => r.id === d.id)) h += `<div class="gap"><button class="b red wide" data-a="delroutine">Delete routine</button></div>`;
  return h;
}

// Suggest the next step based on last session and the target rep range (e.g. "6-8").
function progressHint(e, last) {
  const m = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(e.reps || '');
  if (!m || !last) return '';
  const top = +(m[2] || m[1]);
  const sets = last.sets.filter(s => s.r !== '');
  if (!sets.length) return '';
  const minW = Math.min(...sets.map(s => +s.w || 0));
  const allHit = sets.length >= (e.target || 1) && sets.every(s => +s.r >= top);
  if (allHit) {
    if (minW > 0) return `Hit ${top} reps on every set last time. Try ${+(minW + (+db.step || 2.5)).toFixed(2)}${db.unit}.`;
    return `Hit ${top} reps on every set last time. Time to add reps or weight.`;
  }
  return minW > 0 ? `Goal: ${top} reps on every set at ${minW}${db.unit}.` : `Goal: ${top} reps on every set.`;
}

function vWorkout() {
  const w = db.active;
  if (!w) return `<div class="empty">No workout in progress.</div>`;
  let h = '';
  w.exercises.forEach((e, i) => {
    const last = lastSets(e.name);
    const tgt = e.target ? `${e.target} set${e.target > 1 ? 's' : ''}${e.reps ? ' × ' + esc(e.reps) + ' reps' : ''}` : '';
    const extra = last && last.sets.length > e.sets.length ? ` · also: ${last.sets.slice(e.sets.length).map(fmtSet).join(' · ')}` : '';
    const hint = progressHint(e, last);
    h += `<div class="card"><div class="row sp"><b>${esc(e.name)}</b><span class="dim">${tgt ? 'Target: ' + tgt : ''}</span></div>
      <div class="last">${last ? `Last time: ${fmtDate(last.date)}${esc(extra)}` : 'No previous data'}</div>
      ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
      <div class="sets"><span></span><span class="h">LAST</span><span class="h">WEIGHT (${db.unit})</span><span class="h">REPS</span><span class="h">RPE</span>`;
    e.sets.forEach((s, j) => {
      const p = last && last.sets[j];
      h += `<span class="n">${j + 1}</span><span class="prev">${p ? esc(p.w === '' ? '–' : p.w) + '×' + esc(p.r) : '–'}</span>
        <span class="${s.r !== '' ? 'done' : ''}"><input type="number" inputmode="decimal" step="any" data-k="w" data-i="${i}" data-j="${j}" value="${esc(s.w)}"></span>
        <span class="${s.r !== '' ? 'done' : ''}"><input type="number" inputmode="numeric" data-k="r" data-i="${i}" data-j="${j}" value="${esc(s.r)}"></span>
        <span><input type="number" inputmode="decimal" step="0.5" min="1" max="10" data-k="rpe" data-i="${i}" data-j="${j}" value="${esc(s.rpe)}"></span>`;
    });
    h += `</div><div class="row sp gap"><button class="b alt" data-a="addset" data-i="${i}">+ Set</button><button class="ic" data-a="rmset" data-i="${i}">Remove last set</button></div></div>`;
  });
  return h + `<button class="b wide" data-a="finish">Finish workout</button><div class="gap"><button class="b alt wide" data-a="cancel">Discard workout</button></div>`;
}

function exerciseNames() {
  const m = new Map();
  db.sessions.forEach(s => s.exercises.forEach(e => { if (e.sets.length && !m.has(norm(e.name))) m.set(norm(e.name), e.name); }));
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}

function vHistory() {
  if (!db.sessions.length) return `<div class="empty">No finished workouts yet.</div>`;
  let h = `<div class="card"><b>Exercise progress</b><div class="gap">${exerciseNames().map(n => `<button class="b alt" style="margin:0 6px 6px 0" data-a="ex" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>`;
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const s = db.sessions[i];
    h += `<div class="card"><details><summary><b>${esc(s.name)}</b> <span class="dim">${fmtDate(s.date)}${s.duration ? ' · ' + Math.round(s.duration / 60000) + ' min' : ''}</span></summary>
      ${s.exercises.filter(e => e.sets.length).map(e => `<div class="gap"><b>${esc(e.name)}</b><div class="dim">${e.sets.map(fmtSet).join(' · ')}</div></div>`).join('')}
      <div class="gap"><button class="ic" data-a="delsession" data-i="${i}">Delete this workout</button></div></details></div>`;
  }
  return h;
}

function vExercise() {
  const pts = [];
  db.sessions.forEach(s => {
    const e = s.exercises.find(x => norm(x.name) === norm(view.ex));
    if (!e || !e.sets.length) return;
    const top = e.sets.reduce((a, b) => (+b.w > +a.w || (+b.w === +a.w && +b.r > +a.r)) ? b : a);
    pts.push({ date: s.date, top, sets: e.sets });
  });
  if (!pts.length) return `<div class="empty">No data.</div>`;
  const ws = pts.map(p => +p.top.w || 0), min = Math.min(...ws), max = Math.max(...ws), rng = max - min || 1;
  const W = 320, H = 140, P = 20;
  const x = i => pts.length === 1 ? W / 2 : P + i * (W - 2 * P) / (pts.length - 1);
  const flat = max === min;
  const y = v => flat ? H / 2 : H - P - (v - min) / rng * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(+p.top.w || 0).toFixed(1)}`).join(' ');
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Top set weight over time">
    <path d="${line}" fill="none" stroke="#4cc38a" stroke-width="2"/>
    ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(+p.top.w || 0).toFixed(1)}" r="3.5" fill="#4cc38a"/>`).join('')}
    <text x="4" y="12" fill="#8b96a5" font-size="7">${max}${db.unit}</text>${flat ? '' : `<text x="4" y="${H - 4}" fill="#8b96a5" font-size="7">${min}${db.unit}</text>`}</svg>`;
  let h = `<div class="card"><div class="dim">Top set weight per session</div>${svg}</div>
    <div class="card"><table><tr><th>Date</th><th>Sets</th></tr>`;
  for (let i = pts.length - 1; i >= 0; i--) h += `<tr><td>${fmtDate(pts[i].date)}</td><td>${pts[i].sets.map(fmtSet).join(' · ')}</td></tr>`;
  return h + `</table></div><button class="b alt wide" data-a="history">Back</button>`;
}

function vSettings() {
  return `<div class="card"><b>Units</b><div class="gap row">
      <button class="b ${db.unit === 'kg' ? '' : 'alt'}" data-a="unit" data-u="kg">kg</button>
      <button class="b ${db.unit === 'lb' ? '' : 'alt'}" data-a="unit" data-u="lb">lb</button></div>
      <div class="dim gap">Changing units only changes the label. Existing numbers are not converted.</div></div>
    <div class="card"><b>Weight step</b><div class="dim">Used by the progress hint ("Try 82.5kg") when you hit the top of your rep range.</div>
      <div class="gap"><input type="number" inputmode="decimal" step="any" min="0" id="step" value="${esc(db.step || 2.5)}" style="width:120px"> ${db.unit}</div></div>
    <div class="card"><b>Backup</b><div class="dim">Your data lives only on this phone. Export a backup regularly, especially before clearing browser data or changing phones.</div>
      <div class="gap row"><button class="b" data-a="export">Export</button><button class="b alt" data-a="import">Import</button></div>
      <input type="file" id="file" accept="application/json" hidden></div>
    <div class="card"><b>Danger zone</b><div class="gap"><button class="b red" data-a="wipe">Delete all data</button></div></div>`;
}

// ---------- actions ----------
function startWorkout(r) {
  db.active = {
    routineId: r.id, name: r.name, start: Date.now(),
    exercises: r.exercises.filter(e => e.name.trim()).map(e => ({
      name: e.name, target: Math.max(1, +e.sets || 1), reps: (e.reps || '').trim(), sets: Array.from({ length: Math.max(1, +e.sets || 1) }, () => ({ w: '', r: '', rpe: '' }))
    }))
  };
  save(); go('workout');
}

function finishWorkout() {
  const w = db.active;
  const exercises = w.exercises.map(e => ({ name: e.name, sets: e.sets.filter(s => s.r !== '') }));
  const any = exercises.some(e => e.sets.length);
  if (!any && !confirm('No sets with reps were logged. Finish and save an empty workout?')) return;
  db.sessions.push({ id: uid(), name: w.name, date: w.start, duration: Date.now() - w.start, exercises });
  db.active = null; save(); go('history');
}

const actions = {
  home: () => go('home'), history: () => go('history'),
  new: () => { draft = { id: uid(), name: '', exercises: [{ name: '', sets: 3 }] }; go('routine'); },
  edit: el => { draft = JSON.parse(JSON.stringify(db.routines.find(r => r.id === el.dataset.id))); go('routine'); },
  addex: () => { draft.exercises.push({ name: '', sets: 3 }); render(); },
  rmex: el => { draft.exercises.splice(+el.dataset.i, 1); render(); },
  up: el => { const i = +el.dataset.i; if (i > 0) { [draft.exercises[i - 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i - 1]]; render(); } },
  down: el => { const i = +el.dataset.i; if (i < draft.exercises.length - 1) { [draft.exercises[i + 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i + 1]]; render(); } },
  saveroutine: () => {
    draft.name = draft.name.trim() || 'Untitled routine';
    draft.exercises = draft.exercises.filter(e => e.name.trim());
    const i = db.routines.findIndex(r => r.id === draft.id);
    if (i >= 0) db.routines[i] = draft; else db.routines.push(draft);
    save(); go('home');
  },
  delroutine: () => { if (confirm('Delete this routine? Your logged history is kept.')) { db.routines = db.routines.filter(r => r.id !== draft.id); save(); go('home'); } },
  start: el => {
    const r = db.routines.find(x => x.id === el.dataset.id);
    if (db.active && !confirm('A workout is already in progress. Discard it and start a new one?')) return;
    startWorkout(r);
  },
  resume: () => go('workout'),
  addset: el => { db.active.exercises[+el.dataset.i].sets.push({ w: '', r: '', rpe: '' }); save(); render(); },
  rmset: el => { const s = db.active.exercises[+el.dataset.i].sets; if (s.length > 1) { s.pop(); save(); render(); } },
  finish: () => { if (confirm('Finish and save this workout?')) finishWorkout(); },
  cancel: () => { if (confirm('Discard this workout? Nothing will be saved.')) { db.active = null; save(); go('home'); } },
  ex: el => go('exercise', { ex: el.dataset.n }),
  delsession: el => { if (confirm('Delete this workout from history?')) { db.sessions.splice(+el.dataset.i, 1); save(); render(); } },
  unit: el => { db.unit = el.dataset.u; save(); render(); },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    a.download = `liftlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  import: () => $('#file').click(),
  wipe: () => { if (confirm('Delete ALL routines and history? This cannot be undone.') && confirm('Really delete everything?')) { db = { routines: [], sessions: [], active: null, unit: db.unit }; save(); go('home'); } }
};

document.addEventListener('click', e => {
  const nav = e.target.closest('#nav button');
  if (nav) return go(nav.dataset.go);
  const el = e.target.closest('[data-a]');
  if (el && actions[el.dataset.a]) actions[el.dataset.a](el);
});

// typing: update state without re-rendering (keeps keyboard open)
document.addEventListener('input', e => {
  const t = e.target, k = t.dataset.k;
  if (t.id === 'rname' && draft) { draft.name = t.value; return; }
  if (t.id === 'step') { const v = parseFloat(t.value); if (v > 0) { db.step = v; save(); } return; }
  if (!k) return;
  if (view.name === 'routine') {
    const ex = draft.exercises[+t.dataset.i];
    if (k === 'exname') ex.name = t.value;
    if (k === 'exsets') ex.sets = Math.max(1, parseInt(t.value) || 1);
    if (k === 'exreps') ex.reps = t.value;
  } else if (view.name === 'workout' && db.active) {
    const s = db.active.exercises[+t.dataset.i].sets[+t.dataset.j];
    s[k] = t.value;
    if (k === 'w' || k === 'r') {
      const cells = t.closest('.sets').querySelectorAll(`[data-i="${t.dataset.i}"][data-j="${t.dataset.j}"]`);
      cells.forEach(c => { if (c.dataset.k !== 'rpe') c.parentElement.classList.toggle('done', s.r !== ''); });
    }
    save();
  }
});

document.addEventListener('change', e => {
  if (e.target.id !== 'file') return;
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!Array.isArray(d.routines) || !Array.isArray(d.sessions)) throw new Error('bad');
      if (!confirm(`Replace current data with this backup (${d.routines.length} routines, ${d.sessions.length} workouts)?`)) return;
      db = Object.assign({ routines: [], sessions: [], active: null, unit: 'kg' }, d); save(); go('home');
    } catch (err) { alert('That file is not a valid Lift Log backup.'); }
  };
  rd.readAsText(f);
});

function tick() { $('#clock').textContent = db.active ? elapsed(Date.now() - db.active.start) : ''; }
setInterval(tick, 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
