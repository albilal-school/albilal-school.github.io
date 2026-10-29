/* Albilal School System – Timetable (v11)
   Owner: step-by-step wizard → auto-generated, conflict-free timetable → edit (substitute teacher, move a period, move the break) → save / rename / delete / print.
   Teachers & students: read-only (teacher: "My periods", student: own class).
   HARD RULE: a teacher is never in two classes in the same period. The generator uses bipartite edge colouring (always succeeds when every
   teacher's and every class's periods fit in the day) and every edit is checked before it is applied. */
import {db, $, $$, esc, uid, toast, save, render, app, STATE, sessionUser, isOwner, allClassKeys, subjectsForClass, fmtD, go} from './app.js';

/* ------------------------------------------------------------------ time helpers */
const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : NaN; };
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const t12 = m => { const h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, '0'); return `${(h % 12) || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`; };
const key = n => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
export function periodsFit(start, end, periodMin, breakMin) { const tot = toMin(end) - toMin(start) - (Number(breakMin) || 0); return periodMin > 0 && tot > 0 ? Math.floor(tot / periodMin) : 0; }
/** rows of the day: [{kind:'p', p:1, from, to}, …, {kind:'b', from, to}, …] */
export function dayRows(tt) {
  const out = []; let t = toMin(tt.start);
  for (let p = 1; p <= tt.nPeriods; p++) { out.push({kind: 'p', p, from: t, to: t + tt.periodMin}); t += tt.periodMin;
    if (p === tt.breakAfter && tt.breakMin > 0) { out.push({kind: 'b', from: t, to: t + tt.breakMin}); t += tt.breakMin; } }
  return out;
}
const pTime = (tt, p) => { const r = dayRows(tt).find(x => x.kind === 'p' && x.p === p); return r ? `${t12(r.from)}–${t12(r.to)}` : ''; };

/* ------------------------------------------------------------------ generator (no teacher clash) */
/** lessons from tt.assign → grid {cls: [ {s, t} | null ] }. Returns {ok, grid} or {ok:false, errors:[…]} */
export function generate(tt, shuffle = false) {
  const n = tt.nPeriods, errors = [], edges = [];
  if (!(n > 0)) return {ok: false, errors: ['The day has no periods – check school hours, period length and break.']};
  const tLoad = {}, tName = {};
  for (const cls of tt.classes) { let c = 0;
    for (const a of tt.assign[cls] || []) { const k = Number(a.periods) || 0; if (!a.subject || !k) continue; if (!a.teacher) { errors.push(`${cls}: choose a teacher for ${a.subject}.`); continue; }
      c += k; tLoad[key(a.teacher)] = (tLoad[key(a.teacher)] || 0) + k; tName[key(a.teacher)] = a.teacher;
      for (let i = 0; i < k; i++) edges.push({cls, t: key(a.teacher), s: a.subject, tn: a.teacher}); }
    if (c > n) errors.push(`${cls} has ${c} periods but the day has only ${n}. Remove ${c - n} period(s).`); }
  for (const k in tLoad) if (tLoad[k] > n) errors.push(`${tName[k]} has ${tLoad[k]} periods in total but the day has only ${n} – a teacher cannot be in two classes at the same time. Give ${tLoad[k] - n} of these periods to another teacher.`);
  if (!edges.length) errors.push('Add at least one subject with a teacher and periods (step 6).');
  if (errors.length) return {ok: false, errors};
  // order: busiest teachers first, subjects interleaved; optional shuffle for "Regenerate"
  const rnd = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (shuffle) rnd(edges); else edges.sort((x, y) => tLoad[y.t] - tLoad[x.t]);
  const cAt = {}, tAt = {}, col = new Array(edges.length).fill(-1);
  const slot = (m, k) => m[k] = m[k] || new Array(n).fill(-1);
  const put = (e, c) => { col[e] = c; slot(cAt, edges[e].cls)[c] = e; slot(tAt, edges[e].t)[c] = e; };
  const take = e => { const c = col[e]; if (c < 0) return; cAt[edges[e].cls][c] = -1; tAt[edges[e].t][c] = -1; col[e] = -1; };
  for (let e = 0; e < edges.length; e++) {
    const C = slot(cAt, edges[e].cls), T = slot(tAt, edges[e].t);
    let common = -1; for (let c = 0; c < n; c++) if (C[c] < 0 && T[c] < 0) { common = c; break; }
    if (common >= 0) { put(e, common); continue; }
    const a = C.findIndex(x => x < 0), b = T.findIndex(x => x < 0);
    if (a < 0 || b < 0) return {ok: false, errors: ['Internal: no free period (check loads).']};
    // Kempe chain: flip the a/b alternating path that starts at this teacher – it never reaches this class (bipartite)
    const path = []; let side = 't', node = edges[e].t, c = a;
    for (;;) { const x = (side === 't' ? tAt[node] : cAt[node])[c]; if (x < 0) break; path.push(x);
      node = side === 't' ? edges[x].cls : edges[x].t; side = side === 't' ? 'c' : 't'; c = c === a ? b : a; }
    const old = path.map(x => col[x]); path.forEach(take); path.forEach((x, i) => put(x, old[i] === a ? b : a));
    put(e, a);
  }
  let perm = [...Array(n).keys()]; if (shuffle) perm = rnd(perm); // permuting whole periods keeps it clash-free
  const grid = {}; tt.classes.forEach(cls => grid[cls] = new Array(n).fill(null));
  edges.forEach((ed, e) => { grid[ed.cls][perm[col[e]]] = {s: ed.s, t: ed.tn}; });
  return {ok: true, grid};
}
/** every clash in a timetable: [{p, teacher, classes:[…]}] */
export function conflicts(tt) {
  const out = [];
  for (let p = 0; p < tt.nPeriods; p++) { const m = {};
    for (const cls of tt.classes) { const c = (tt.grid[cls] || [])[p]; if (c && c.t) (m[key(c.t)] = m[key(c.t)] || {teacher: c.t, classes: []}).classes.push(cls); }
    Object.values(m).forEach(x => { if (x.classes.length > 1) out.push({p: p + 1, ...x}); }); }
  return out;
}
/** would putting `cell` in cls/period p clash? → message or '' */
export function clashFor(tt, cls, p, cell) {
  if (!cell || !cell.t) return '';
  for (const o of tt.classes) { if (o === cls) continue; const c = (tt.grid[o] || [])[p];
    if (c && key(c.t) === key(cell.t)) return `⛔ Clash: ${cell.t} already teaches ${o} (${c.s}) in Period ${p + 1} (${pTime(tt, p + 1)}). One teacher cannot be in two classes at the same time.`; }
  return '';
}
/** apply a cell edit with optional move (swap with another period of the same class). Returns '' or error text. */
export function applyEdit(tt, cls, p, cell, toP = p) {
  const g = tt.grid[cls]; if (!g) return 'Unknown class';
  if (toP === p) { const e = clashFor(tt, cls, p, cell); if (e) return e; g[p] = cell && (cell.s || cell.t) ? cell : null; return ''; }
  const other = g[toP];
  const e1 = clashFor(tt, cls, toP, cell), e2 = clashFor(tt, cls, p, other);
  if (e1) return e1; if (e2) return e2.replace('⛔ Clash:', `⛔ Clash (moving Period ${toP + 1} to Period ${p + 1}):`);
  g[toP] = cell && (cell.s || cell.t) ? cell : null; g[p] = other || null; return '';
}

/* ------------------------------------------------------------------ storage */
function saveTT(tt) {
  tt.updatedAt = new Date().toISOString(); tt.by = (sessionUser() || {}).name || ''; tt.dirty = true;
  const i = db.timetables.findIndex(x => x.id === tt.id); if (i >= 0) db.timetables[i] = tt; else db.timetables.push(tt);
  save(); if (window.syncNow) window.syncNow(false);
}
const syncNote = () => db.settings.ttServer === 'old' ? '<p class="muted tt-warn">⚠️ Saved on this phone only. To share timetables with teachers and students, the owner must update the Google Apps Script (Version 11) – see SETUP.md.</p>' : '';

/* ------------------------------------------------------------------ wizard */
const STEPS = ['School hours', 'Period length', 'Teachers', 'Break', 'Classes', 'Subjects & periods', 'Create'];
function teachersFromUsers() {
  return db.users.filter(u => u.role === 'teacher' && u.status === 'approved').map(u => ({name: u.name, username: u.username, subjects: [...(u.subjects || [])], classes: [...(u.classes || [])]}));
}
function newDraft() {
  return {step: 1, name: 'Timetable ' + fmtD(new Date().toISOString().slice(0, 10)), start: '08:00', end: '13:30', periodMin: 40, breakMin: 30, breakAfter: 4,
    teachers: teachersFromUsers(), classes: allClassKeys().filter(c => /^(9th|10th) /.test(c)), assign: {}};
}
const draft = () => db.ttDraft || (db.ttDraft = newDraft());
const dN = d => periodsFit(d.start, d.end, d.periodMin, d.breakMin);
const allSubs = d => [...new Set([...d.teachers.flatMap(t => t.subjects), ...d.classes.flatMap(c => subjectsForClass(c))])].filter(Boolean);
function autoFill(d, cls) { // suggest subjects for a class + a teacher who teaches it (prefers teachers assigned to this class), spread the day evenly
  const n = dN(d), subs = subjectsForClass(cls).filter(Boolean); if (!subs.length || !n) return;
  const per = Math.floor(n / subs.length); let left = n - per * subs.length; // more subjects than periods → the last ones get 0 (owner adjusts)
  d.assign[cls] = subs.map(s => { const cand = d.teachers.filter(t => t.name && t.subjects.some(x => key(x) === key(s)));
    const best = cand.find(t => t.classes && t.classes.includes(cls)) || cand.find(t => !t.classes || !t.classes.length) || cand[0];
    const k = per + (left-- > 0 ? 1 : 0); return {subject: s, teacher: best ? best.name : '', periods: k}; });
}
function loads(d) { const L = {}; d.classes.forEach(c => (d.assign[c] || []).forEach(a => { if (a.teacher && a.subject) L[a.teacher] = (L[a.teacher] || 0) + (Number(a.periods) || 0); })); return L; }
function previewRows(d) { const n = dN(d); return dayRows({start: d.start, periodMin: Number(d.periodMin), breakMin: Number(d.breakMin), breakAfter: Math.min(Number(d.breakAfter), n), nPeriods: n}); }
function rowsTable(rows) { return `<div class="tbl-wrap"><table class="tt-mini"><tr><th>Period</th><th>Time</th></tr>${rows.map(r => r.kind === 'b' ? `<tr class="tt-brk"><td>☕ Break</td><td>${t12(r.from)} – ${t12(r.to)}</td></tr>` : `<tr><td>Period ${r.p}</td><td>${t12(r.from)} – ${t12(r.to)}</td></tr>`).join('')}</table></div>`; }

function wizardHTML() {
  const d = draft(), s = d.step, n = dN(d);
  const bar = `<ol class="tt-steps">${STEPS.map((x, i) => `<li class="${i + 1 === s ? 'on' : i + 1 < s ? 'done' : ''}"><button data-wstep="${i + 1}"><span>${i + 1}</span><small>${x}</small></button></li>`).join('')}</ol>`;
  let body = '';
  const total = toMin(d.end) - toMin(d.start);
  if (s === 1) body = `<h3>1 · School hours <span class="ur">اسکول کے اوقات</span></h3>
    <div class="row"><div><label>School starts</label><input type="time" id="wStart" value="${esc(d.start)}"></div><div><label>School ends</label><input type="time" id="wEnd" value="${esc(d.end)}"></div></div>
    <p class="muted">Total: <b>${total > 0 ? `${Math.floor(total / 60)} h ${total % 60} min` : '–'}</b> (${total > 0 ? `${t12(toMin(d.start))} to ${t12(toMin(d.end))}` : 'end must be after start'})</p>
    <label>Timetable name</label><input id="wName" maxlength="60" value="${esc(d.name)}">`;
  if (s === 2) body = `<h3>2 · Period (lecture) length <span class="ur">ایک پیریڈ کتنے منٹ کا</span></h3>
    <label>Minutes per period</label><input type="number" id="wPer" min="10" max="120" value="${esc(d.periodMin)}">
    <div class="chips">${[30, 35, 40, 45, 50].map(m => `<button class="chip ${+d.periodMin === m ? 'on' : ''}" data-permin="${m}">${m} min</button>`).join('')}</div>
    <p class="muted">With a ${d.breakMin}-minute break this gives <b>${n}</b> periods a day${n ? ` (school ends ${t12(toMin(d.start) + n * d.periodMin + Number(d.breakMin))}${toMin(d.end) - (toMin(d.start) + n * d.periodMin + Number(d.breakMin)) > 0 ? `, ${toMin(d.end) - (toMin(d.start) + n * d.periodMin + Number(d.breakMin))} min left over` : ''})` : ''}.</p>`;
  if (s === 3) body = `<h3>3 · Teachers & their subjects <span class="ur">اساتذہ اور مضامین</span></h3>
    <p class="muted">Filled from approved teachers. Add more by hand. Separate subjects with commas.</p>
    <div id="wTeach">${d.teachers.map((t, i) => `<div class="tt-trow"><input class="wtName" data-i="${i}" placeholder="Teacher name" value="${esc(t.name)}"><input class="wtSubs" data-i="${i}" placeholder="Subjects, e.g. Mathematics, Physics" value="${esc(t.subjects.join(', '))}" list="wSubList"><button class="btn sm red" data-wtdel="${i}" aria-label="Remove">✕</button></div>`).join('') || '<div class="muted">No teachers yet.</div>'}</div>
    <datalist id="wSubList">${allSubs(d).concat(db.subjects).filter((x, i, a) => a.indexOf(x) === i).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <button class="btn sec sm" id="wtAdd">＋ Add teacher</button> <button class="btn sec sm" id="wtLoad">⟳ Reload approved teachers</button>`;
  if (s === 4) body = `<h3>4 · Break <span class="ur">وقفہ</span></h3>
    <div class="row"><div><label>Break comes after period</label><select id="wBrkAfter">${Array.from({length: Math.max(1, n - 1)}, (_, i) => `<option value="${i + 1}" ${+d.breakAfter === i + 1 ? 'selected' : ''}>After Period ${i + 1}</option>`).join('')}</select></div>
      <div><label>Break length (minutes)</label><input type="number" id="wBrkMin" min="0" max="90" value="${esc(d.breakMin)}"></div></div>
    <p class="muted"><b>${n}</b> periods a day.</p>${rowsTable(previewRows(d))}`;
  if (s === 5) { const all = [...new Set([...allClassKeys(), ...d.classes])];
    body = `<h3>5 · Classes <span class="ur">کلاسیں</span></h3><p class="muted">Tick every class (Boys / Girls sections are separate classes). Matric = 9th &amp; 10th; 8th is allowed.</p>
    <div class="chips" id="wCls">${all.map(c => `<label class="chip ${d.classes.includes(c) ? 'on' : ''}"><input type="checkbox" value="${esc(c)}" ${d.classes.includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div>
    <div class="row"><div><label>Add another class</label><input id="wClsNew" placeholder="e.g. 9th Blue or 10th Girls-B"></div><div><label>&nbsp;</label><button class="btn sec" id="wClsAdd">＋ Add class</button></div></div>
    <p class="muted"><b>${d.classes.length}</b> classes selected.</p>`; }
  if (s === 6) { const L = loads(d), subs = allSubs(d), tn = d.teachers.filter(t => t.name).map(t => t.name);
    body = `<h3>6 · Subjects, teachers & periods per class <span class="ur">مضمون، استاد، پیریڈ</span></h3>
    <p class="muted">Each class has <b>${n}</b> periods a day. A teacher can have at most <b>${n}</b> periods in total (never two classes at once). “Auto-fill” suggests subjects and teachers – change anything.</p>
    <button class="btn sec sm" id="wAutoAll">✨ Auto-fill all classes</button>
    <datalist id="wSubList2">${subs.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${d.classes.map(c => { const A = d.assign[c] || [], used = A.reduce((x, a) => x + (Number(a.periods) || 0), 0);
      return `<div class="tt-cls"><div class="tt-cls-h"><b>${esc(c)}</b><span class="badge ${used > n ? 'bad' : used === n ? '' : 'warn'}">${used} / ${n} periods</span><button class="btn sm sec" data-wauto="${esc(c)}">✨ Auto-fill</button></div>
        ${A.map((a, i) => { const cand = tn.filter(t => (d.teachers.find(x => x.name === t) || {subjects: []}).subjects.some(x => key(x) === key(a.subject)));
          const others = tn.filter(t => !cand.includes(t)); const sel = v => v === a.teacher ? 'selected' : '';
          return `<div class="tt-arow" data-c="${esc(c)}" data-i="${i}"><input class="waSub" list="wSubList2" placeholder="Subject" value="${esc(a.subject)}">
          <select class="waTch"><option value="">— teacher —</option>${cand.length ? `<optgroup label="Teaches ${esc(a.subject)}">${cand.map(t => `<option ${sel(t)}>${esc(t)}</option>`).join('')}</optgroup>` : ''}<optgroup label="${cand.length ? 'Other teachers' : 'Teachers'}">${others.map(t => `<option ${sel(t)}>${esc(t)}</option>`).join('')}</optgroup>${a.teacher && !tn.includes(a.teacher) ? `<option selected>${esc(a.teacher)}</option>` : ''}</select>
          <input class="waPer" type="number" min="0" max="${n}" value="${esc(a.periods)}" aria-label="Periods per day"><button class="btn sm red" data-wadel="1" aria-label="Remove">✕</button></div>`; }).join('')}
        <button class="btn sm sec" data-waadd="${esc(c)}">＋ Add subject</button></div>`; }).join('')}
    <h3>Teacher load (periods a day)</h3><div class="chips">${Object.entries(L).map(([t, k]) => `<span class="chip ${k > n ? 'bad' : 'on'}">${esc(t)}: <b>${k}</b> / ${n}</span>`).join('') || '<span class="muted">No periods yet.</span>'}</div>`; }
  if (s === 7) { const L = loads(d), over = Object.entries(L).filter(([, k]) => k > n);
    body = `<h3>7 · Create timetable <span class="ur">ٹائم ٹیبل بنائیں</span></h3>
    <ul class="tt-sum"><li>⏰ ${t12(toMin(d.start))} – ${t12(toMin(d.end))} · ${d.periodMin} min periods · <b>${n}</b> periods</li><li>☕ Break after Period ${d.breakAfter}, ${d.breakMin} min</li>
      <li>👩‍🏫 ${d.teachers.filter(t => t.name).length} teachers · 🏫 ${d.classes.length} classes (${esc(d.classes.join(', '))})</li></ul>
    ${over.length ? `<div class="tt-err">${over.map(([t, k]) => `⛔ ${esc(t)} has ${k} periods but the day has ${n}.`).join('<br>')}</div>` : ''}
    <div id="wErr"></div><button class="btn big" id="wCreate">✅ Create timetable</button>`; }
  return `<div class="card tt-wiz"><div class="card-h"><h2>🕒 New timetable <span class="ur">نیا ٹائم ٹیبل</span></h2><button class="btn sm sec" id="wCancel">✕ Close</button></div>${bar}<div class="tt-body">${body}</div>
    <div class="tt-nav">${s > 1 ? '<button class="btn sec" id="wBack">← Back</button>' : '<span></span>'}${s < 7 ? '<button class="btn" id="wNext">Next →</button>' : ''}</div></div>`;
}
function readStep(d) { // copy inputs into the draft
  const v = id => $(id) ? $(id).value : undefined;
  if (d.step === 1) { d.start = v('#wStart') || d.start; d.end = v('#wEnd') || d.end; d.name = (v('#wName') || '').trim() || d.name; }
  if (d.step === 2) d.periodMin = Math.max(10, Math.min(120, parseInt(v('#wPer')) || d.periodMin));
  if (d.step === 3) d.teachers = $$('.wtName').map(i => ({...(d.teachers[+i.dataset.i] || {}), name: i.value.trim().replace(/\s+/g, ' '), subjects: $(`.wtSubs[data-i="${i.dataset.i}"]`).value.split(',').map(x => x.trim()).filter(Boolean)}));
  if (d.step === 4) { d.breakAfter = parseInt(v('#wBrkAfter')) || 1; d.breakMin = Math.max(0, Math.min(90, parseInt(v('#wBrkMin')) || 0)); }
  if (d.step === 5) d.classes = $$('#wCls input:checked').map(i => i.value);
  if (d.step === 6) { const A = {}; $$('.tt-arow').forEach(r => { (A[r.dataset.c] = A[r.dataset.c] || []).push({subject: $('.waSub', r).value.trim(), teacher: $('.waTch', r).value, periods: Math.max(0, parseInt($('.waPer', r).value) || 0)}); });
    d.classes.forEach(c => d.assign[c] = A[c] || []); }
}
function checkStep(d) {
  const n = dN(d);
  if (d.step === 1 && !(toMin(d.end) > toMin(d.start))) return 'School end time must be after the start time.';
  if (d.step === 2 && !n) return 'Periods do not fit – make the period shorter or the school day longer.';
  if (d.step === 3) { if (!d.teachers.some(t => t.name)) return 'Add at least one teacher.'; const k = d.teachers.filter(t => t.name).map(t => key(t.name)); const dup = k.find((x, i) => k.indexOf(x) !== i); if (dup) return `Teacher "${dup}" is written twice – use one row per teacher.`; }
  if (d.step === 4 && !n) return 'With this break no period fits – make the break shorter.';
  if (d.step === 5 && !d.classes.length) return 'Select at least one class.';
  return '';
}
function bindWizard() {
  const d = draft(), rer = () => { save(); render(); };
  const move = to => { readStep(d); if (to > d.step) { const e = checkStep(d); if (e) return toast(e); }
    if (to === 6) { d.breakAfter = Math.min(d.breakAfter, Math.max(1, dN(d) - 1)); d.classes.forEach(c => { if (!(d.assign[c] || []).length) autoFill(d, c); }); }
    d.step = to; rer(); };
  $('#wCancel').onclick = () => { STATE.ttMode = 'list'; render(); };
  if ($('#wNext')) $('#wNext').onclick = () => move(d.step + 1);
  if ($('#wBack')) $('#wBack').onclick = () => move(d.step - 1);
  $$('[data-wstep]').forEach(b => b.onclick = () => { const to = +b.dataset.wstep; if (to <= d.step) return move(to);
    readStep(d); for (let s = d.step; s < to; s++) { d.step = s; const e = checkStep(d); if (e) { rer(); return toast(e); } } move(to); });
  $$('[data-permin]').forEach(b => b.onclick = () => { d.periodMin = +b.dataset.permin; rer(); });
  if ($('#wPer')) $('#wPer').onchange = () => { readStep(d); rer(); };
  ['#wStart', '#wEnd'].forEach(id => { if ($(id)) $(id).onchange = () => { readStep(d); rer(); }; });
  if ($('#wBrkAfter')) $('#wBrkAfter').onchange = $('#wBrkMin').onchange = () => { readStep(d); rer(); };
  if ($('#wtAdd')) $('#wtAdd').onclick = () => { readStep(d); d.teachers.push({name: '', subjects: [], classes: []}); rer(); setTimeout(() => { const l = $$('.wtName'); if (l.length) l[l.length - 1].focus(); }, 30); };
  if ($('#wtLoad')) $('#wtLoad').onclick = () => { readStep(d); const have = new Set(d.teachers.map(t => key(t.name))); teachersFromUsers().forEach(t => { if (!have.has(key(t.name))) d.teachers.push(t); }); rer(); };
  $$('[data-wtdel]').forEach(b => b.onclick = () => { readStep(d); d.teachers.splice(+b.dataset.wtdel, 1); rer(); });
  $$('#wCls input').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
  if ($('#wClsAdd')) $('#wClsAdd').onclick = () => { readStep(d); const c = $('#wClsNew').value.trim().replace(/\s+/g, ' '); if (!c || c.length > 30) return toast('Write a class name, e.g. 9th Blue');
    if (!d.classes.includes(c)) d.classes.push(c); rer(); };
  if ($('#wAutoAll')) $('#wAutoAll').onclick = () => { readStep(d); d.classes.forEach(c => autoFill(d, c)); rer(); };
  $$('[data-wauto]').forEach(b => b.onclick = () => { readStep(d); autoFill(d, b.dataset.wauto); rer(); });
  $$('[data-waadd]').forEach(b => b.onclick = () => { readStep(d); (d.assign[b.dataset.waadd] = d.assign[b.dataset.waadd] || []).push({subject: '', teacher: '', periods: 1}); rer(); });
  $$('[data-wadel]').forEach(b => b.onclick = () => { const r = b.closest('.tt-arow'); readStep(d); d.assign[r.dataset.c].splice(+r.dataset.i, 1); rer(); });
  $$('.waSub, .waTch, .waPer').forEach(el => el.onchange = () => { readStep(d); rer(); });
  if ($('#wCreate')) $('#wCreate').onclick = () => {
    const n = dN(d), tt = {id: 'tt' + uid().replace(/[^A-Za-z0-9]/g, '').slice(0, 20), name: d.name, start: d.start, end: d.end, periodMin: +d.periodMin, breakMin: +d.breakMin,
      breakAfter: Math.min(+d.breakAfter, Math.max(1, n - 1)), nPeriods: n, teachers: d.teachers.filter(t => t.name), classes: d.classes.slice(),
      assign: JSON.parse(JSON.stringify(d.assign)), createdAt: new Date().toISOString()};
    const r = generate(tt);
    if (!r.ok) { $('#wErr').innerHTML = `<div class="tt-err"><b>Cannot create the timetable:</b><br>${r.errors.map(esc).join('<br>')}</div>`; return; }
    tt.grid = r.grid; saveTT(tt); db.ttDraft = null; save(); Object.assign(STATE, {ttMode: 'view', ttId: tt.id, ttEdit: false}); toast('Timetable created ✓ – no teacher clashes'); render(); };
}

/* ------------------------------------------------------------------ view / edit */
function cellTxt(c) { return c ? `<b>${esc(c.s || '–')}</b><small>${esc(c.t || '')}</small>` : '<span class="muted">Free</span>'; }
function classCard(tt, cls, edit) {
  const g = tt.grid[cls] || [], ed = STATE.ttCell && STATE.ttCell.c === cls ? STATE.ttCell : null;
  return `<div class="card tt-card"><h3>${esc(cls)}</h3><div class="tbl-wrap"><table class="tt-tbl"><tr><th>Period</th><th>Time</th><th>Subject</th><th>Teacher</th>${edit ? '<th></th>' : ''}</tr>
    ${dayRows(tt).map(r => r.kind === 'b' ? `<tr class="tt-brk"><td>☕</td><td>${t12(r.from)} – ${t12(r.to)}</td><td colspan="${edit ? 3 : 2}"><b>Break</b> <span class="ur">وقفہ</span></td></tr>`
      : (() => { const c = g[r.p - 1]; return `<tr><td>${r.p}</td><td class="tt-time">${t12(r.from)} – ${t12(r.to)}</td><td>${c ? esc(c.s) : '<span class="muted">Free</span>'}</td><td>${c ? esc(c.t) : ''}</td>${edit ? `<td><button class="btn sm sec" data-ttcell="${esc(cls)}|${r.p - 1}">✏️</button></td>` : ''}</tr>
        ${ed && ed.p === r.p - 1 ? `<tr class="tt-edrow"><td colspan="5">${cellEditorHTML(tt, cls, r.p - 1)}</td></tr>` : ''}`; })()).join('')}</table></div></div>`;
}
function cellEditorHTML(tt, cls, p) {
  const c = (tt.grid[cls] || [])[p] || {s: '', t: ''}, tn = [...new Set([...tt.teachers.map(t => t.name), ...Object.values(tt.grid).flat().filter(Boolean).map(x => x.t)])].filter(Boolean);
  const busy = new Set(tt.classes.filter(o => o !== cls).map(o => (tt.grid[o] || [])[p]).filter(Boolean).map(x => key(x.t)));
  const subs = [...new Set([...tt.teachers.flatMap(t => t.subjects), ...Object.values(tt.grid).flat().filter(Boolean).map(x => x.s), ...subjectsForClass(cls)])].filter(Boolean);
  return `<div class="tt-ed"><b>Edit ${esc(cls)} · Period ${p + 1} (${pTime(tt, p + 1)})</b>
    <div class="row"><div><label>Subject</label><input id="ceSub" list="ceSubs" value="${esc(c.s)}"><datalist id="ceSubs">${subs.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div><label>Teacher (substitute)</label><select id="ceTch"><option value="">— Free period —</option>${tn.map(t => `<option ${key(t) === key(c.t) ? 'selected' : ''} value="${esc(t)}">${esc(t)}${busy.has(key(t)) ? ' – busy in this period' : ''}</option>`).join('')}</select>
        <input id="ceTchNew" placeholder="…or type a new teacher name"></div></div>
    <label>Move this period to</label><select id="ceMove">${Array.from({length: tt.nPeriods}, (_, i) => `<option value="${i}" ${i === p ? 'selected' : ''}>${i === p ? 'Keep in ' : 'Swap with '}Period ${i + 1} (${pTime(tt, i + 1)})${i !== p && (tt.grid[cls] || [])[i] ? ' – ' + esc(tt.grid[cls][i].s) : ''}</option>`).join('')}</select>
    <div id="ceErr"></div><div class="tt-acts"><button class="btn" id="ceSave">💾 Apply</button><button class="btn sec" id="ceCancel">Cancel</button></div></div>`;
}
function gridHTML(tt) {
  return `<div class="card tt-card"><h3>All classes</h3><div class="tbl-wrap"><table class="tt-grid"><tr><th>Time</th>${tt.classes.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
    ${dayRows(tt).map(r => r.kind === 'b' ? `<tr class="tt-brk"><td>${t12(r.from)} – ${t12(r.to)}</td><td colspan="${tt.classes.length}"><b>☕ Break</b></td></tr>`
      : `<tr><td class="tt-time"><b>P${r.p}</b><br>${t12(r.from)} – ${t12(r.to)}</td>${tt.classes.map(c => `<td>${cellTxt((tt.grid[c] || [])[r.p - 1])}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
}
function teacherCard(tt, name) {
  return `<div class="card tt-card"><h3>👩‍🏫 ${esc(name)}</h3><div class="tbl-wrap"><table class="tt-tbl"><tr><th>Period</th><th>Time</th><th>Class</th><th>Subject</th></tr>
    ${dayRows(tt).map(r => { if (r.kind === 'b') return `<tr class="tt-brk"><td>☕</td><td>${t12(r.from)} – ${t12(r.to)}</td><td colspan="2"><b>Break</b></td></tr>`;
      const hits = tt.classes.filter(c => { const x = (tt.grid[c] || [])[r.p - 1]; return x && key(x.t) === key(name); });
      return `<tr><td>${r.p}</td><td class="tt-time">${t12(r.from)} – ${t12(r.to)}</td><td>${hits.length ? hits.map(esc).join(', ') : '<span class="muted">Free</span>'}</td><td>${hits.map(c => esc(tt.grid[c][r.p - 1].s)).join(', ')}</td></tr>`; }).join('')}</table></div></div>`;
}
const ttTeachers = tt => [...new Set(Object.values(tt.grid).flat().filter(Boolean).map(x => x.t).filter(Boolean))].sort();
function myTeacherName(tt) { const u = sessionUser(); if (!u) return ''; const t = tt.teachers.find(x => x.username && x.username === u.username); return t ? t.name : u.name; }

function viewHTML(tt) {
  const own = isOwner(), u = sessionUser(), stu = u && u.role === 'student', edit = own && STATE.ttEdit;
  const mode = STATE.ttView || (stu ? 'class' : own ? 'class' : 'mine');
  const cf = conflicts(tt);
  const tabs = stu ? '' : `<div class="seg tt-noprint">${[['class', 'By class'], ['grid', 'All classes'], ['teacher', 'By teacher']].concat(own ? [] : [['mine', 'My periods']]).map(([v, l]) => `<button class="${mode === v ? 'on' : ''}" data-ttv="${v}">${l}</button>`).join('')}</div>`;
  let main;
  if (stu) main = tt.classes.includes(u.cls) ? classCard(tt, u.cls, false) : `<div class="card empty">Your class (${esc(u.cls)}) is not in this timetable.</div>`;
  else if (mode === 'grid') main = gridHTML(tt);
  else if (mode === 'teacher') main = ttTeachers(tt).map(t => teacherCard(tt, t)).join('');
  else if (mode === 'mine') { const nm = myTeacherName(tt); main = ttTeachers(tt).some(t => key(t) === key(nm)) ? teacherCard(tt, nm) : `<div class="card empty">You (${esc(nm)}) have no periods in this timetable.</div>`; }
  else main = (STATE.ttCls && tt.classes.includes(STATE.ttCls) ? [STATE.ttCls] : tt.classes).map(c => classCard(tt, c, edit)).join('');
  const clsFilter = !stu && mode === 'class' ? `<select id="ttClsF" class="tt-noprint"><option value="">All classes</option>${tt.classes.map(c => `<option ${STATE.ttCls === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : '';
  return `<div class="card tt-head"><div class="card-h"><h2>🕒 ${esc(tt.name)}</h2><span class="badge ${tt.dirty ? 'warn' : ''}">${tt.dirty ? 'not synced' : 'saved'}</span></div>
    <p class="muted">${t12(toMin(tt.start))} – ${t12(toMin(tt.end))} · ${tt.nPeriods} periods of ${tt.periodMin} min · Break after Period ${tt.breakAfter} (${tt.breakMin} min)${tt.updatedAt ? ` · updated ${fmtD(String(tt.updatedAt).slice(0, 10))}${tt.by ? ' by ' + esc(tt.by) : ''}` : ''}</p>
    ${cf.length ? `<div class="tt-err">${cf.map(x => `⛔ Clash in Period ${x.p}: ${esc(x.teacher)} is in ${esc(x.classes.join(' and '))}`).join('<br>')}</div>` : `<div class="okmsg tt-noprint">✓ No clashes – no teacher is in two classes at the same time.</div>`}
    <div class="tt-acts tt-noprint"><button class="btn sec sm" id="ttBack">← All timetables</button><button class="btn sec sm" id="ttPrint">🖨️ Print</button>
      ${own ? `<button class="btn sm ${edit ? '' : 'sec'}" id="ttEditBtn">${edit ? '✓ Done editing' : '✏️ Edit'}</button><button class="btn sec sm" id="ttRegen">🔀 Re-create</button>` : ''}</div>
    ${edit ? `<div class="tt-ed tt-noprint"><b>☕ Move the break</b><div class="row"><div><label>Break after period</label><select id="ttBrkAfter">${Array.from({length: Math.max(1, tt.nPeriods - 1)}, (_, i) => `<option value="${i + 1}" ${tt.breakAfter === i + 1 ? 'selected' : ''}>After Period ${i + 1}</option>`).join('')}</select></div>
      <div><label>Break minutes</label><input type="number" id="ttBrkMin" min="0" max="90" value="${tt.breakMin}"></div></div><p class="muted">Tap ✏️ on a period to change the subject, put a substitute teacher, or swap two periods. Every change is checked for teacher clashes.</p></div>` : ''}
    ${syncNote()}${tabs}${clsFilter}</div>${main}`;
}
function bindView(tt) {
  $('#ttBack').onclick = () => { Object.assign(STATE, {ttMode: 'list', ttEdit: false, ttCell: null}); render(); };
  $('#ttPrint').onclick = () => window.print();
  $$('[data-ttv]').forEach(b => b.onclick = () => { STATE.ttView = b.dataset.ttv; render(); });
  if ($('#ttClsF')) $('#ttClsF').onchange = e => { STATE.ttCls = e.target.value; render(); };
  if ($('#ttEditBtn')) $('#ttEditBtn').onclick = () => { STATE.ttEdit = !STATE.ttEdit; STATE.ttCell = null; STATE.ttView = 'class'; render(); };
  if ($('#ttRegen')) $('#ttRegen').onclick = () => { if (!confirm('Re-create this timetable? All periods are shuffled again (still with no clashes). Your manual edits are lost.')) return;
    const r = generate(tt, true); if (!r.ok) return toast(r.errors[0]); tt.grid = r.grid; saveTT(tt); toast('Re-created ✓ – no clashes'); render(); };
  if ($('#ttBrkAfter')) $('#ttBrkAfter').onchange = $('#ttBrkMin').onchange = () => { tt.breakAfter = parseInt($('#ttBrkAfter').value) || 1; tt.breakMin = Math.max(0, Math.min(90, parseInt($('#ttBrkMin').value) || 0)); saveTT(tt); toast('Break moved ✓'); render(); };
  $$('[data-ttcell]').forEach(b => b.onclick = () => { const v = b.dataset.ttcell, i = v.lastIndexOf('|'); STATE.ttCell = {c: v.slice(0, i), p: +v.slice(i + 1)}; render(); });
  if ($('#ceCancel')) $('#ceCancel').onclick = () => { STATE.ttCell = null; render(); };
  if ($('#ceSave')) $('#ceSave').onclick = () => { const {c, p} = STATE.ttCell, t = $('#ceTchNew').value.trim().replace(/\s+/g, ' ') || $('#ceTch').value, s = $('#ceSub').value.trim();
    if (t && !s) { $('#ceErr').innerHTML = '<div class="tt-err">Write the subject.</div>'; return; }
    const err = applyEdit(tt, c, p, s || t ? {s, t} : null, +$('#ceMove').value);
    if (err) { $('#ceErr').innerHTML = `<div class="tt-err">${esc(err)}</div>`; toast('Not saved – teacher clash'); return; }
    if (t && !tt.teachers.some(x => key(x.name) === key(t))) tt.teachers.push({name: t, subjects: s ? [s] : []});
    STATE.ttCell = null; saveTT(tt); toast('Saved ✓ – no clashes'); render(); };
}

/* ------------------------------------------------------------------ list */
function listHTML() {
  const own = isOwner(), L = [...db.timetables].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return `<div class="card"><div class="card-h"><h2>🕒 Timetables <span class="ur">ٹائم ٹیبل</span></h2>${own ? '<button class="btn" id="ttNew">＋ Create timetable</button>' : ''}</div>
    ${own ? `<p class="muted">Step by step: school hours → period length → teachers → break → classes → subjects → Create. A teacher is never put in two classes at the same time.</p>${db.ttDraft ? '<button class="btn sec sm" id="ttResume">↩️ Continue unfinished timetable</button>' : ''}` : '<p class="muted">Read-only. Tap a timetable to see your periods.</p>'}
    ${syncNote()}
    ${L.length ? `<div class="tt-list">${L.map(t => `<div class="tt-item"><button class="tt-open" data-ttopen="${esc(t.id)}"><b>${esc(t.name)}</b><small>${esc((t.classes || []).join(', '))}</small><small>${t.nPeriods} periods · ${t12(toMin(t.start))}–${t12(toMin(t.end))}${t.updatedAt ? ' · ' + fmtD(String(t.updatedAt).slice(0, 10)) : ''}${t.dirty ? ' · ⟳ not synced' : ''}</small></button>
      ${own ? `<div class="tt-acts"><button class="btn sm sec" data-ttren="${esc(t.id)}">✏️ Rename</button><button class="btn sm red" data-ttdel="${esc(t.id)}">🗑 Delete</button></div>` : ''}</div>`).join('')}</div>`
      : `<div class="empty">${own ? 'No timetable yet – tap “Create timetable”.' : 'The school has not shared a timetable yet.'}</div>`}</div>`;
}
function bindList() {
  if ($('#ttNew')) $('#ttNew').onclick = () => { if (db.ttDraft && !confirm('Start a new timetable? The unfinished one is discarded.')) return; db.ttDraft = newDraft(); save(); STATE.ttMode = 'wizard'; render(); };
  if ($('#ttResume')) $('#ttResume').onclick = () => { STATE.ttMode = 'wizard'; render(); };
  $$('[data-ttopen]').forEach(b => b.onclick = () => { Object.assign(STATE, {ttMode: 'view', ttId: b.dataset.ttopen, ttEdit: false, ttCell: null}); render(); });
  $$('[data-ttren]').forEach(b => b.onclick = () => { const t = db.timetables.find(x => x.id === b.dataset.ttren); const nm = prompt('New name', t.name); if (!nm || !nm.trim()) return; t.name = nm.trim().slice(0, 60); saveTT(t); render(); });
  $$('[data-ttdel]').forEach(b => b.onclick = () => { const t = db.timetables.find(x => x.id === b.dataset.ttdel); if (!confirm(`Delete timetable "${t.name}"? This cannot be undone.`)) return;
    db.timetables = db.timetables.filter(x => x.id !== t.id); if (t.synced || db.settings.ttServer !== 'old') db.deletedTT.push(t.id); save(); if (window.syncNow) window.syncNow(false); toast('Deleted'); render(); });
}

export function viewTimetable() {
  const own = isOwner();
  if (!own && STATE.ttMode === 'wizard') STATE.ttMode = 'list';
  if (STATE.ttMode === 'wizard' && own) { app().innerHTML = wizardHTML(); bindWizard(); return; }
  let tt = STATE.ttMode === 'view' && db.timetables.find(x => x.id === STATE.ttId);
  if (!tt && !own && db.timetables.length === 1 && STATE.ttMode !== 'list') tt = db.timetables[0]; // only one: open it directly
  if (tt) { app().innerHTML = viewHTML(tt); bindView(tt); return; }
  STATE.ttMode = 'list'; app().innerHTML = listHTML(); bindList();
}
