/* Albilal School System – lazy-loaded analytics, reports & result cards.
   Loaded only when a dashboard/report screen is opened. Chart.js (vendored, MIT) is loaded on demand too. */
import {db, $, $$, esc, ymd, parseD, addDays, today, fmtD, pct, p1, r1, grade, gradeBadge, toast, weekRange, monthRange, daysBetween,
  save, ck, splitCk, testCk, me, isAdmin, myClasses, allClassKeys, allSubjects, applyBranding, testsIn, classAvg, go, STATE,
  render, app, opts, download, DEFAULT_NAME, setUserStatus, backupHTML, bindBackup, online, getJSON, sessionUser, isOwner, adminResetPassword, adminSetEmail, fullName, SEC_QS, newPin, rememberRoster, meStudent, annFor, tilesHTML, addSubject, renameSubjectLocal, addRosterStudent, passMark, isPass, passBadge, splitName, postJSON, pullNow, honorMiniHTML} from './app.js';

let chartP = null;
function ensureChart() {
  if (window.Chart) return Promise.resolve();
  return chartP = chartP || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/chart.umd.js'; s.onload = res; s.onerror = () => { chartP = null; rej(new Error('Chart library not cached')); }; document.head.appendChild(s); })
    .then(() => { Chart.defaults.font.family = 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif'; Chart.defaults.color = '#55645e'; });
}
/* ------------------------------------------------------------------ analytics engine */
// per-student aggregate for a list of tests (all from one class)
export function aggregate(tests) {
  const st = {};
  tests.forEach(t => t.rows.forEach(r => {
    const s = st[r.roll] = st[r.roll] || {roll: r.roll, name: r.name, obt: 0, total: 0, tests: 0, leave: 0, subj: {}};
    s.name = r.name || s.name;
    const sj = s.subj[t.subject] = s.subj[t.subject] || {obt: 0, total: 0, tests: 0, leave: 0};
    s.tests++; sj.tests++; // leave tests are counted …
    if (r.obt == null) { s.leave++; sj.leave++; return; } // … but excluded from %
    s.obt += r.obt; s.total += t.total; sj.obt += r.obt; sj.total += t.total;
  }));
  const list = Object.values(st).map(s => { s.pct = pct(s.obt, s.total); for (const k in s.subj) s.subj[k].pct = pct(s.subj[k].obt, s.subj[k].total); return s; });
  list.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  let rank = 0, prev = null; list.forEach((s, i) => { if (s.pct !== prev) rank = i + 1; s.rank = s.pct == null ? '–' : rank; prev = s.pct; });
  return list.sort((a, b) => (parseFloat(a.roll) || 0) - (parseFloat(b.roll) || 0));
}
function studentSeries(tests, roll) { // per date % for one student
  const by = {}; tests.forEach(t => { const r = t.rows.find(x => x.roll === roll); if (!r || r.obt == null) return; const d = by[t.date] = by[t.date] || {o: 0, t: 0}; d.o += r.obt; d.t += t.total; });
  return Object.keys(by).sort().map(d => ({date: d, pct: pct(by[d].o, by[d].t)}));
}
function classSeries(tests) {
  const by = {}; tests.forEach(t => t.rows.forEach(r => { if (r.obt == null) return; const d = by[t.date] = by[t.date] || {o: 0, t: 0}; d.o += r.obt; d.t += t.total; }));
  return Object.keys(by).sort().map(d => ({date: d, pct: pct(by[d].o, by[d].t)}));
}

/* ------------------------------------------------------------------ charts */
const charts = {};
function chart(id, cfg) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  cfg.options = Object.assign({responsive: true, maintainAspectRatio: false, animation: {duration: 400},
    plugins: {legend: {display: cfg.data.datasets.length > 1, labels: {boxWidth: 12}}}}, cfg.options || {});
  charts[id] = new Chart(el, cfg);
}
export function destroyCharts() { for (const k in charts) { charts[k].destroy(); delete charts[k]; } }
const G = '#0f6b4f', G2 = 'rgba(15,107,79,.15)', O = '#e08a1e', BLUE = '#2f6fb3';
const pctAxis = {y: {min: 0, max: 100, ticks: {callback: v => v + '%'}}};

/* ------------------------------------------------------------------ date range picker */
const RANGE = {preset: '30d', from: '', to: ''};
function rangeDates() {
  const t = today();
  if (RANGE.preset === '7d') return [addDays(t, -6), t];
  if (RANGE.preset === '30d') return [addDays(t, -29), t];
  if (RANGE.preset === 'month') return [monthRange(t)[0], t];
  if (RANGE.preset === 'all') { const ds = db.tests.map(x => x.date).sort(); return [ds[0] || t, ds[ds.length - 1] || t]; }
  return [RANGE.from || addDays(t, -29), RANGE.to || t];
}
function rangeHTML() {
  const [f, t] = rangeDates(); const b = (k, l) => `<button data-preset="${k}" class="${RANGE.preset === k ? 'on' : ''}">${l}</button>`;
  return `<div class="range"><div class="seg">${b('7d', '7 days')}${b('30d', '30 days')}${b('month', 'This month')}${b('all', 'All')}${b('custom', 'Custom')}</div>
    <div class="cust"><input type="date" id="rgFrom" value="${f}"><input type="date" id="rgTo" value="${t}"></div></div>
    <div class="muted" style="margin-top:6px">Showing ${fmtD(f)} → ${fmtD(t)} · <span class="ur">تاریخ کی حد</span></div>`;
}
function bindRange(rerender) {
  $$('.range [data-preset]').forEach(b => b.onclick = () => { RANGE.preset = b.dataset.preset; if (RANGE.preset === 'custom') { [RANGE.from, RANGE.to] = [$('#rgFrom').value, $('#rgTo').value]; } rerender(); });
  ['#rgFrom', '#rgTo'].forEach(s => $(s).onchange = () => { RANGE.preset = 'custom'; RANGE.from = $('#rgFrom').value; RANGE.to = $('#rgTo').value; rerender(); });
}
function prevRange(f, t) { const n = daysBetween(f, t) + 1; return [addDays(f, -n), addDays(f, -1)]; }

/* ------------------------------------------------------------------ helpers */
function rosterOf(cls) { // known students of a class (from saved roster + any test rows)
  const m = new Map(); (db.students[cls] || []).forEach(s => m.set(s.roll, s.name));
  db.tests.filter(t => testCk(t) === cls).forEach(t => t.rows.forEach(r => { if (!m.has(r.roll)) m.set(r.roll, r.name); }));
  return [...m].map(([roll, name]) => ({roll, name})).sort((a, b) => (parseFloat(a.roll) || 0) - (parseFloat(b.roll) || 0));
}
const kpi = (l, v, s = '', cls = '') => `<div class="kpi"><div class="l">${l}</div><div class="v ${cls}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
function delta(cur, prev) {
  if (cur == null || prev == null) return {txt: 'no earlier data', cls: ''};
  const d = r1(cur - prev); return {txt: (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(1) + ' pts vs previous period', cls: d >= 0 ? 'up' : 'down', d};
}
const school = () => db.settings.schoolName || DEFAULT_NAME;
const logo = () => db.settings.logo || 'icons/icon-192.png';
function pickClass() { const all = isAdmin() ? allClassKeys() : [...new Set([...myClasses(), ...allClassKeys()])]; return {all, cls: STATE.dCls && all.includes(STATE.dCls) ? STATE.dCls : all[0]}; }

/* ------------------------------------------------------------------ teacher / class dashboard */
/* ------------------------------------------------------------------ student home dashboard (#/shome) */
function failingHTML(list, sub) {
  const f = list.filter(x => x.pct != null).map(x => ({...x, fs: sub ? (x.subj[sub] && x.subj[sub].pct != null && !isPass(x.subj[sub].pct, sub) ? [[sub, x.subj[sub]]] : [])
    : Object.entries(x.subj).filter(([k, v]) => v.pct != null && !isPass(v.pct, k))})).filter(x => x.fs.length || (!sub && !isPass(x.pct))).sort((a, b) => a.pct - b.pct);
  if (!f.length) return '<div class="muted">✅ No failing students in this period.</div>';
  return `<div class="tbl-wrap"><table class="failtbl"><tr><th>Class</th><th>Roll</th><th>Name</th><th class="num">Overall</th><th>Failing in</th></tr>${f.slice(0, 50).map(x => `<tr><td>${esc(x.cls || '')}</td><td>${esc(x.roll)}</td><td>${esc(x.name)}</td><td class="num">${p1(x.pct)} ${passBadge(x.pct)}</td>
    <td>${x.fs.map(([k, v]) => `<span class="badge pf fail">${esc(k)} ${p1(v.pct)}</span>`).join(' ') || '–'}</td></tr>`).join('')}</table></div>`;
}
export function viewStudentHome() {
  const u = meStudent(); if (!u) return go('home');
  const cls = u.cls, roll = u.roll;
  const mineT = testsIn({cls}).filter(t => t.rows.some(r => r.roll === roll)).sort((a, b) => b.date.localeCompare(a.date));
  const from = addDays(today(), -30), recentT = mineT.filter(t => t.date >= from);
  const me1 = aggregate(mineT).find(s => s.roll === roll), m30 = aggregate(recentT).find(s => s.roll === roll);
  const ranked = aggregate(testsIn({cls, from, to: today()})).filter(s => s.pct != null).sort((a, b) => b.pct - a.pct);
  const ms = db.myStats || {}; const rank = ms.rank30 || 0; ranked.length = 0; for (let i = 0; i < (ms.of30 || 0); i++) ranked.push(i); // privacy: rank comes from the server, never other students' rows
  const subs = me1 ? Object.entries(me1.subj).filter(([, v]) => v.pct != null).sort((a, b) => b[1].pct - a[1].pct) : [];
  const anns = annFor(u).slice(0, 2);
  app().innerHTML = `<div class="card welcome"><div class="card-h"><h2>Assalam-o-Alaikum, ${esc(u.name)} 👋</h2><span class="ur">خوش آمدید</span></div>
      <div class="muted">Class <b>${esc(cls)}</b> · Roll # <b>${esc(roll)}</b> · Father: ${esc(u.father || '–')}</div></div>
    ${tilesHTML([['mine', '📈', 'My Results', 'Charts & all marks'], ['notes', '📚', 'Notes', 'From your teachers'], ['chat', '💬', 'Chat', 'Class chat'],
      ['ann', '📢', 'Announcements', 'School news'], ['card', '🖨️', 'Result Card', 'Print / share'], ['account', '👤', 'Profile & Settings', 'Password, email']], 'sTiles')}
    <div class="kpis" id="sKpis">${kpi('Overall', me1 ? p1(me1.pct) : '–', me1 ? `${me1.tests} tests` : 'no tests yet')}${kpi('Last 30 days', m30 ? p1(m30.pct) : '–', m30 ? `${m30.tests} tests · ${m30.leave} leave` : '')}
      ${kpi('Class rank (30 days)', rank ? `#${rank}` : '–', rank ? `of ${ranked.length}` : '')}${kpi('Best subject', subs.length ? esc(subs[0][0]) : '–', subs.length ? p1(subs[0][1].pct) : '')}</div>
    <div class="grid2"><div class="card" id="sRecent"><div class="card-h"><h2>🆕 Latest results <span class="ur">تازہ نتائج</span></h2><button class="btn sm sec" onclick="go('mine')">All results →</button></div>
      ${mineT.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Subject</th><th>Marks</th><th>%</th></tr></thead><tbody>${mineT.slice(0, 8).map(t => { const r = t.rows.find(x => x.roll === roll);
        return `<tr><td>${fmtD(t.date)}</td><td>${esc(t.subject)}</td><td>${r.obt == null ? '<span class="badge warn">Leave</span>' : `${r.obt}/${t.total}`}</td><td>${r.obt == null ? '–' : gradeBadge(pct(r.obt, t.total), t.subject)}</td></tr>`; }).join('')}</tbody></table></div>`
        : '<div class="empty">No marks yet. Your results appear here as soon as your teachers enter them.</div>'}</div>
    <div class="card" id="sSubjects"><h2>📚 My subjects <span class="ur">مضامین</span></h2>${subs.length ? subs.map(([s, v]) => `<div class="sbar"><span>${esc(s)}</span><div class="bar"><i style="width:${Math.max(2, Math.min(100, v.pct))}%"></i></div><b>${p1(v.pct)} ${passBadge(v.pct, s)}</b></div>`).join('')
      : '<div class="muted">Subject averages appear after your first tests.</div>'}
      ${anns.length ? `<h3 style="margin-top:14px">📢 Latest announcements</h3>${anns.map(a => `<div class="ann"><b>${esc(a.title)}</b><div class="muted">${fmtD(a.createdAt.slice(0, 10))}</div></div>`).join('')}` : ''}</div></div>`;
}
/* teacher's own subjects + add a new one (also on Enter Marks) */
function mySubjectsCardHTML() {
  const m = me(); if (!m) return '';
  const subs = m.subjects && m.subjects.length ? m.subjects : null;
  return `<div class="card" id="mySubCard"><div class="card-h"><h2>📘 My subjects <span class="ur">میرے مضامین</span></h2></div>
    <div class="chips">${(subs || ['All subjects']).map(s => `<span class="chip on">${esc(s)}${db.subjectMeta[s] && db.subjectMeta[s].username === m.username ? ' <small>(added by you)</small>' : ''}${db.pendingSubjects.includes(s) ? ' <small>⟳</small>' : ''}</span>`).join('')}</div>
    <div class="addsub"><input id="tSubNew" placeholder="New subject, e.g. Computer Science" maxlength="40"><button class="btn sm" id="tSubAdd">➕ Add subject</button></div>
    <p class="muted">A new subject is shared with the whole school, added to your subjects and ready for marks at once (works offline too). Only the admin can rename or delete it.</p></div>`;
}
function bindMySubjects() {
  const b = $('#tSubAdd'); if (!b) return;
  $('#tSubNew').onkeydown = e => { if (e.key === 'Enter') b.click(); };
  b.onclick = () => { try { const r = addSubject($('#tSubNew').value); toast(r.existed ? `"${r.name}" already exists – added to your subjects` : `Subject "${r.name}" added ✓`); render(); } catch (e) { toast(e.message); } };
}
/* teacher adds students to their own classes (owner edits/deletes in Admin → Students) */
function myStudentsCardHTML() {
  const m = me(); if (!m) return ''; const cls = myClasses(); if (!cls.length) return '';
  const c = cls.includes(STATE.myStuCls) ? STATE.myStuCls : cls[0]; STATE.myStuCls = c;
  const list = (db.students[c] || []).slice().sort((a, b) => (+a.roll || 0) - (+b.roll || 0) || String(a.roll).localeCompare(String(b.roll)));
  const acct = r => db.users.find(u => u.role === 'student' && u.cls === c && u.roll === r);
  const ed = STATE.msEdit ? list.find(x => x.roll === STATE.msEdit) : null; if (!ed) STATE.msEdit = '';
  return `<div class="card" id="myStuCard"><div class="card-h"><h2>🎓 My students <span class="ur">میرے طلبہ</span></h2><span class="badge">${list.length} in ${esc(c)}</span></div>
    <div class="row"><div><label>Class</label><select id="msCls">${opts(cls, c)}</select></div><div><label>Search</label><input id="msQ" type="search" placeholder="🔍 Name, roll or father's name"></div></div>
    <div class="card" style="background:#f6faf8" id="msForm"><h3>${ed ? `✏️ Edit roll ${esc(ed.roll)} – ${esc(c)}` : '➕ Add a student'}</h3>
      <div class="row"><div><label>Roll Number *</label><input id="msRoll" inputmode="numeric" value="${ed ? esc(ed.roll) : ''}" ${ed ? 'disabled' : ''}></div><div><label>Class &amp; section *</label><select id="msCls2" ${ed ? 'disabled' : ''}>${opts(cls, c)}</select></div></div>
      <div class="row"><div><label>First Name *</label><input id="msFirst" value="${ed ? esc(ed.first || splitName(ed).first) : ''}"></div><div><label>Last Name *</label><input id="msLast" value="${ed ? esc(ed.last ?? splitName(ed).last) : ''}"></div></div>
      <label>Father's Name *</label><input id="msFather" value="${ed ? esc(ed.father || '') : ''}">
      ${ed ? '<button class="btn" id="msSave">💾 Save changes</button> <button class="btn sec" id="msCancel">Cancel</button>' : '<button class="btn" id="msAdd">➕ Add student</button>'}
      <p class="muted">The student is ready for marks entry at once. To log in, the student registers on the Student page with the same class + roll number (or the admin approves) – the account links to this entry. Deleting hides the student but keeps all their marks; the admin can restore.</p></div>
    ${list.length ? `<div class="tbl-wrap"><table id="msTbl"><tr><th>Roll</th><th>Name</th><th>Father's name</th><th>Login account</th><th></th></tr>${list.map(x => { const a = acct(x.roll);
      return `<tr data-q="${esc([x.roll, fullName(x), x.father].join(' ').toLowerCase())}"><td>${esc(x.roll)}</td><td>${esc(fullName(x))}${x.addedBy ? ` <small class="muted">· added by ${esc(x.addedBy)}</small>` : ''}${x.isNew || x.dirty ? ' <span class="badge warn">queued</span>' : ''}</td><td>${esc(x.father || '–')}</td><td>${a ? `<span class="badge ${a.status === 'approved' ? '' : 'warn'}">${esc(a.status)}</span>` : '<span class="muted">not registered</span>'}</td>
        <td class="acts"><button class="btn sm sec" data-msed="${esc(x.roll)}">Edit</button><button class="btn sm red" data-msdel="${esc(x.roll)}">Delete</button></td></tr>`; }).join('')}</table></div>`
      : '<div class="muted">No students in this class yet.</div>'}</div>`;
}
function bindMyStudents() {
  if (!$('#myStuCard')) return; const c = STATE.myStuCls;
  $('#msCls').onchange = e => { STATE.myStuCls = e.target.value; STATE.msEdit = ''; render(); };
  const qf = () => { const q = ($('#msQ').value || '').trim().toLowerCase(); $$('#msTbl tr[data-q]').forEach(r => r.classList.toggle('hidden', !!q && !q.split(/\s+/).every(w => r.dataset.q.includes(w)))); };
  $('#msQ').oninput = qf;
  if ($('#msAdd')) $('#msAdd').onclick = () => { try { const r = addRosterStudent({roll: $('#msRoll').value, first: $('#msFirst').value, last: $('#msLast').value, father: $('#msFather').value, cls: $('#msCls2').value});
      toast(`Roll ${r.roll} added to ${r.cls} ✓`); STATE.myStuCls = r.cls; STATE.scrollTo = 'myStuCard'; render(); } catch (e) { toast(e.message); } };
  if ($('#msSave')) $('#msSave').onclick = () => { const rec = (db.students[c] || []).find(x => x.roll === STATE.msEdit); if (!rec) return;
    const first = $('#msFirst').value.trim(), last = $('#msLast').value.trim(), father = $('#msFather').value.trim();
    if (!first || !last || !father) return toast('First, last and father\'s name are required');
    Object.assign(rec, {first, last, father, name: `${first} ${last}`, dirty: true}); db.settings.rosterDirty = true; STATE.msEdit = ''; save(); toast('Student updated ✓'); window.syncNow(false); STATE.scrollTo = 'myStuCard'; render(); };
  if ($('#msCancel')) $('#msCancel').onclick = () => { STATE.msEdit = ''; render(); };
  $$('[data-msed]').forEach(b => b.onclick = () => { STATE.msEdit = b.dataset.msed; STATE.scrollTo = 'msForm'; render(); });
  $$('[data-msdel]').forEach(b => b.onclick = () => { const r = b.dataset.msdel, rec = (db.students[c] || []).find(x => x.roll === r); if (!rec) return;
    if (!confirm(`Delete ${fullName(rec)} (roll ${r}, ${c})?\n\nThe student is hidden from lists, but all old marks are kept. The admin can restore.`)) return;
    db.students[c] = db.students[c].filter(x => x !== rec); const {grade: g, section} = splitCk(c); db.deletedStudents.push(`${g}|${section}|${r}`);
    save(); toast('Student deleted'); window.syncNow(false); STATE.scrollTo = 'myStuCard'; render(); });
  if (STATE.scrollTo) { const id = STATE.scrollTo; STATE.scrollTo = ''; setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({block: 'start'}); }, 60); }
}
export function viewMyStudents() {
  app().innerHTML = myStudentsCardHTML() || '<div class="card"><h2>🎓 My students</h2><p class="muted">No classes yet – the admin adds classes in Settings.</p></div>';
  bindMyStudents();
}
export async function viewTeacherDash() {
  await ensureChart().catch(e => toast(e.message));
  const {all, cls} = pickClass(); const sub = STATE.dSub || '';
  const [from, to] = rangeDates(); const [pf, pt] = prevRange(from, to);
  const tests = testsIn({cls, subject: sub || undefined, from, to}); const prevT = testsIn({cls, subject: sub || undefined, from: pf, to: pt});
  const agg = aggregate(tests); const avg = classAvg(tests); const dl = delta(avg, classAvg(prevT));
  const present = agg.filter(s => s.pct != null); const ranked = [...present].sort((a, b) => b.pct - a.pct);
  const absTotal = agg.reduce((n, s) => n + s.leave, 0); const passRate = present.length ? present.filter(s => isPass(s.pct, sub || undefined)).length / present.length * 100 : null;
  app().innerHTML = `${mySubjectsCardHTML()}<div class="card"><div class="card-h"><h2>My classes – insights <span class="ur">کلاس کی کارکردگی</span></h2></div>
    <div class="filters"><div><label>Class</label><select id="dCls">${opts(all, cls)}</select></div><div><label>Subject</label><select id="dSub">${opts(allSubjects(), sub, 'All subjects')}</select></div></div>
    ${rangeHTML()}</div>
  ${!tests.length ? '<div class="card empty">No tests for this class in the selected dates. Try “All” or another class.</div>' : `
  <div class="kpis">${kpi('Class average', p1(avg), dl.txt, '')}${kpi('Tests', tests.length, `${new Set(tests.map(t => t.subject)).size} subject(s)`)}
    ${kpi('Students', agg.length)}${kpi(`Pass rate (≥${passMark(sub || undefined)}%)`, p1(passRate), `${present.filter(s => !isPass(s.pct, sub || undefined)).length} failing`)}${kpi('Leaves', absTotal, 'student-tests on leave')}</div>
  <div class="grid2"><div class="card"><h3>Average trend <span class="ur">رجحان</span></h3><div class="chartbox"><canvas id="cTrend"></canvas></div></div>
    <div class="card"><h3>Score distribution <span class="ur">تقسیم</span></h3><div class="chartbox"><canvas id="cHist"></canvas></div></div></div>
  ${!sub ? `<div class="card"><h3>Average by subject</h3><div class="chartbox"><canvas id="cSubj"></canvas></div></div>` : ''}
  <div class="grid2"><div class="card"><h3>🏆 Top 5</h3>${miniList(ranked.slice(0, 5))}</div><div class="card"><h3>⚠️ Needs attention (bottom 5)</h3>${miniList(ranked.slice(-5).reverse())}</div></div>
  <div class="card" id="failCard"><h3>❌ Failing students <span class="ur">فیل طلبہ</span></h3>${failingHTML(agg.map(x => ({...x, cls})), sub)}</div>
  <div class="card"><h3>Most leaves <span class="ur">سب سے زیادہ چھٹیاں</span></h3>${absTable(tests)}</div>
  <div class="card"><div class="card-h"><h3>All students</h3><span class="muted">Tap a name for the student dashboard</span></div><div class="tbl-wrap"><table>
    <tr><th>Roll</th><th>Name</th><th class="num">Tests</th><th class="num">Leave</th><th class="num">Obtained</th><th class="num">%</th><th>Grade</th><th class="num">Rank</th></tr>
    ${agg.map(s => `<tr data-q="${esc([s.roll, s.name, ((db.students[cls] || []).find(x => x.roll === s.roll) || {}).father || ''].join(' ').toLowerCase())}" data-pf="${s.pct == null ? '' : isPass(s.pct, sub || undefined) ? 'pass' : 'fail'}"><td>${esc(s.roll)}</td><td><button class="link" data-stu="${esc(s.roll)}">${esc(s.name)}</button></td><td class="num">${s.tests}</td><td class="num">${s.leave}</td><td class="num">${r1(s.obt)}/${s.total}</td><td class="num">${p1(s.pct)}</td><td>${gradeBadge(s.pct, sub || undefined)}</td><td class="num">${s.rank}</td></tr>`).join('')}
  </table></div></div>`}`;
  $('#dCls').onchange = () => { STATE.dCls = $('#dCls').value; render(); }; $('#dSub').onchange = () => { STATE.dSub = $('#dSub').value; render(); };
  bindMySubjects(); bindMyStudents(); bindRange(render); $$('[data-stu]').forEach(b => b.onclick = () => go('sdash', {sCls: cls, sRoll: b.dataset.stu}));
  if (!tests.length) return;
  const cs = classSeries(tests);
  chart('cTrend', {type: 'line', data: {labels: cs.map(x => fmtD(x.date)), datasets: [{label: 'Class avg %', data: cs.map(x => r1(x.pct)), borderColor: G, backgroundColor: G2, fill: true, tension: .3}]}, options: {scales: pctAxis}});
  const bins = [[0, 33, 'F <33'], [33, 40, 'E 33-39'], [40, 50, 'D 40-49'], [50, 60, 'C 50-59'], [60, 70, 'B 60-69'], [70, 80, 'A 70-79'], [80, 101, 'A+ 80+']];
  chart('cHist', {type: 'bar', data: {labels: bins.map(b => b[2]), datasets: [{label: 'Students', data: bins.map(b => present.filter(s => s.pct >= b[0] && s.pct < b[1]).length), backgroundColor: bins.map((b, i) => i === 0 ? '#d9534f' : i < 3 ? O : G)}]}, options: {scales: {y: {beginAtZero: true, ticks: {precision: 0}}}}});
  if (!sub) { const subs = [...new Set(tests.map(t => t.subject))]; chart('cSubj', {type: 'bar', data: {labels: subs, datasets: [{label: 'Avg %', data: subs.map(s => r1(classAvg(tests.filter(t => t.subject === s)))), backgroundColor: BLUE}]}, options: {scales: pctAxis}}); }
}
function leaveBySub(s) { return Object.entries(s.subj).filter(([, v]) => v.leave).map(([k, v]) => `${k} ${v.leave}`).join(' · '); }
function miniList(list) { return list.length ? `<table>${list.map(s => `<tr><td>${esc(s.roll)}</td><td><button class="link" data-stu="${esc(s.roll)}">${esc(s.name)}</button></td><td class="num"><b>${p1(s.pct)}</b></td><td>${gradeBadge(s.pct)}</td></tr>`).join('')}</table>` : '<div class="empty">–</div>'; }
function absTable(tests) {
  const ab = []; tests.forEach(t => t.rows.forEach(r => { if (r.obt == null) ab.push({...r, date: t.date, subject: t.subject}); }));
  if (!ab.length) return '<div class="muted">No leaves in this period 🎉</div>';
  const by = {}; ab.forEach(a => (by[a.roll] = by[a.roll] || {name: a.name, list: []}).list.push(`${fmtD(a.date)} (${a.subject})`));
  return `<table><tr><th>Roll</th><th>Name</th><th class="num">Leaves</th><th>When</th></tr>${Object.entries(by).sort((a, b) => b[1].list.length - a[1].list.length).map(([roll, v]) => `<tr><td>${esc(roll)}</td><td>${esc(v.name)}</td><td class="num">${v.list.length}</td><td class="muted">${esc(v.list.join(', '))}</td></tr>`).join('')}</table>`;
}

/* ------------------------------------------------------------------ student dashboard */
export async function viewStudentDash() {
  await ensureChart().catch(e => toast(e.message));
  const all = allClassKeys(); const cls = STATE.sCls && all.includes(STATE.sCls) ? STATE.sCls : (STATE.dCls || all[0]);
  const roster = rosterOf(cls); const roll = roster.some(s => s.roll === STATE.sRoll) ? STATE.sRoll : (roster[0] || {}).roll;
  const stu = roster.find(s => s.roll === roll);
  const [from, to] = rangeDates(); const [pf, pt] = prevRange(from, to);
  const tests = testsIn({cls, from, to}).filter(t => t.rows.some(r => r.roll === roll));
  const classTests = testsIn({cls, from, to});
  const me1 = aggregate(tests).find(s => s.roll === roll); const prev = aggregate(testsIn({cls, from: pf, to: pt})).find(s => s.roll === roll);
  const dl = delta(me1 && me1.pct, prev && prev.pct);
  const subs = me1 ? Object.entries(me1.subj).filter(([, v]) => v.pct != null).sort((a, b) => b[1].pct - a[1].pct) : [];
  const priv = !!meStudent(), TA = (db.myStats || {}).test_avgs || {}; // a logged-in student only has their own rows: class figures come from server aggregates
  const tAvg = t => priv ? (TA[t.id] ?? null) : classAvg([t]);
  const allAgg = aggregate(classTests); const rk = priv ? ((db.myStats || {}).rank30 ? {rank: db.myStats.rank30} : null) : allAgg.find(s => s.roll === roll);
  const cavgL = tests.map(tAvg).filter(x => x != null); const cavg = priv ? (cavgL.length ? cavgL.reduce((a, b) => a + b, 0) / cavgL.length : null) : classAvg(classTests.filter(t => t.rows.some(r => r.roll === roll)));
  app().innerHTML = `<div class="card"><div class="card-h"><h2>Student insights <span class="ur">طالب علم کی کارکردگی</span></h2>${stu ? `<button class="btn sm sec" id="toCard">🖨️ Result card</button>` : ''}</div>
    <div class="filters"><div><label>Class</label><select id="sCls">${opts(all, cls)}</select></div><div><label>Student</label><select id="sStu">${roster.map(s => `<option value="${esc(s.roll)}" ${s.roll === roll ? 'selected' : ''}>${esc(s.roll)} – ${esc(s.name)}</option>`).join('')}</select></div></div>
    ${rangeHTML()}</div>
  ${!stu || !me1 ? '<div class="card empty">No results for this student in the selected dates.</div>' : `
  <div class="kpis">${kpi('Overall', p1(me1.pct), dl.txt)}${kpi('Tests', me1.tests, `${me1.tests - me1.leave} attended · ${me1.leave} leave`)}${kpi('Leaves', me1.leave, me1.leave ? leaveBySub(me1) : 'no leave', me1.leave ? 'down' : '')}
    ${kpi('Best subject', subs.length ? esc(subs[0][0]) : '–', subs.length ? p1(subs[0][1].pct) : '')}${kpi('Weakest subject', subs.length ? esc(subs[subs.length - 1][0]) : '–', subs.length ? p1(subs[subs.length - 1][1].pct) : '')}
    ${kpi('vs class average', cavg != null && me1.pct != null ? (me1.pct >= cavg ? '+' : '') + r1(me1.pct - cavg).toFixed(1) + ' pts' : '–', 'class avg ' + p1(cavg), me1.pct >= cavg ? 'up' : 'down')}
    ${kpi(priv ? 'Class rank (30 days)' : 'Class rank', rk ? `${rk.rank} / ${priv ? db.myStats.of30 : allAgg.filter(s => s.pct != null).length}` : '–', 'Grade ' + grade(me1.pct))}</div>
  <div class="card"><h3>Progress over time <span class="ur">وقت کے ساتھ کارکردگی</span></h3><div class="chartbox"><canvas id="sLine"></canvas></div></div>
  <div class="card"><h3>By subject – student vs class</h3><div class="chartbox"><canvas id="sBar"></canvas></div></div>
  <div class="card"><h3>Recent tests</h3><div class="tbl-wrap"><table><tr><th>Date</th><th>Subject</th><th class="num">Marks</th><th class="num">%</th><th class="num">Class avg</th><th>Grade</th></tr>
    ${[...tests].reverse().slice(0, 15).map(t => { const r = t.rows.find(x => x.roll === roll); const p = r.obt == null ? null : pct(r.obt, t.total);
      return `<tr><td>${fmtD(t.date)}</td><td>${esc(t.subject)}</td><td class="num">${r.obt == null ? '<span class="badge warn">Leave</span>' : `${r.obt}/${t.total}`}</td><td class="num">${p1(p)}</td><td class="num">${p1(tAvg(t))}</td><td>${r.obt == null ? '' : gradeBadge(p, t.subject)}</td></tr>`; }).join('')}
  </table></div></div>`}`;
  if (STATE.lockStudent) { $('#sCls').disabled = $('#sStu').disabled = true; if ($('#toCard')) $('#toCard').onclick = () => go('card'); }
  $('#sCls').onchange = () => { STATE.sCls = $('#sCls').value; STATE.sRoll = null; render(); };
  $('#sStu').onchange = () => { STATE.sCls = cls; STATE.sRoll = $('#sStu').value; render(); };
  bindRange(render); if ($('#toCard')) $('#toCard').onclick = () => go('card', {cCls: cls, cRoll: roll});
  if (!stu || !me1) return;
  const ss = studentSeries(tests, roll); const csm = priv ? (() => { const m = {}; tests.forEach(t => { const v = tAvg(t); if (v != null) (m[t.date] = m[t.date] || []).push(v); }); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.reduce((a, c) => a + c, 0) / v.length])); })() : Object.fromEntries(classSeries(tests).map(x => [x.date, x.pct]));
  chart('sLine', {type: 'line', data: {labels: ss.map(x => fmtD(x.date)), datasets: [
    {label: stu.name, data: ss.map(x => r1(x.pct)), borderColor: G, backgroundColor: G2, fill: true, tension: .3},
    {label: 'Class average', data: ss.map(x => r1(csm[x.date])), borderColor: O, borderDash: [5, 4], tension: .3}]}, options: {scales: pctAxis}});
  const sl = Object.keys(me1.subj);
  chart('sBar', {type: 'bar', data: {labels: sl, datasets: [
    {label: 'Student %', data: sl.map(s => me1.subj[s].pct == null ? null : r1(me1.subj[s].pct)), backgroundColor: G},
    {label: 'Class avg %', data: sl.map(s => { if (!priv) return r1(classAvg(tests.filter(t => t.subject === s))); const v = tests.filter(t => t.subject === s).map(tAvg).filter(x => x != null); return v.length ? r1(v.reduce((a, c) => a + c, 0) / v.length) : null; }), backgroundColor: '#f2b765'}]}, options: {scales: pctAxis}});
}

/* ------------------------------------------------------------------ admin: overview + management */
/* ------------------------------------------------------------------ Admin → Teachers / Students sections */
const optsKV = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const ago = iso => { if (!iso) return '–'; const m = (Date.now() - new Date(iso)) / 60000; return m < 2 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtD(String(iso).slice(0, 10)); };
const stBadge = st => `<span class="badge st-${esc(st || 'none')} ${st === 'approved' ? '' : st === 'pending' ? 'warn' : st ? 'bad' : ''}">${st ? esc(st) : 'no login'}</span>`;
function statusBtns(u) {
  const b = (st, l, c = '') => `<button class="btn sm ${c}" data-appr="${esc(u.username)}" data-st="${st}">${l}</button>`;
  return (u.status === 'pending' ? b('approved', '✓ Approve') + b('rejected', '✕ Reject', 'red') : u.status === 'approved' ? b('disabled', '⏸ Disable', 'red') : b('approved', u.status === 'rejected' ? '✓ Approve' : '▶ Enable'))
    + `<button class="btn sm sec" data-rpw="${esc(u.username)}">🔑 Reset password</button><button class="btn sm sec" data-em="${esc(u.username)}">✉️ Email</button>`;
}
/** full display name: name → first + last → username (never blank / cut) */
const dispName = u => String(u.name || '').trim() || [u.first, u.last].filter(Boolean).join(' ').trim() || u.username || '–';
/** Pending sign-up requests as cards (stack nicely on phones). Teachers: pick classes (incl. Class 8) & subjects, then approve. */
function pendingReqHTML(role) {
  const L = db.users.filter(u => u.role === role && u.status === 'pending').sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  if (!L.length) return '';
  const chips = (key, all, sel) => `<div class="chips" data-${key}>${all.map(v => `<label class="chip ${sel.includes(v) ? 'on' : ''}"><input type="checkbox" value="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</div>`;
  return `<div class="reqs" id="${role}Reqs"><h3>⏳ Pending requests <span class="badge warn">${L.length}</span></h3>${L.map(u => `<div class="req" data-req="${esc(u.username)}">
    <div class="req-h"><div class="req-name">${esc(dispName(u))}</div><span class="badge warn">pending</span></div>
    <div class="req-meta"><span>${role === 'teacher' ? '👩‍🏫 Teacher request' : '🎓 Student request'}</span><span>@${esc(u.username)}</span>
      ${role === 'student' ? `<span>🏫 ${esc(u.cls || '–')} · Roll ${esc(u.roll || '–')}</span>${u.father ? `<span>Father: ${esc(u.father)}</span>` : ''}` : ''}
      ${u.phone ? `<span>📞 ${esc(u.phone)}</span>` : ''}${u.email ? `<span>✉️ ${esc(u.email)}</span>` : ''}${u.createdAt ? `<span>🗓️ ${fmtD(String(u.createdAt).slice(0, 10))}</span>` : ''}</div>
    ${role === 'teacher' ? `<label>Classes this teacher may teach <small class="muted">(none = all)</small></label>${chips('rqcls', allClassKeys(), u.classes || [])}
      <label>Subjects <small class="muted">(none = all)</small></label>${chips('rqsub', allSubjects(), u.subjects || [])}` : ''}
    <div class="req-acts"><button class="btn" data-rqok="${esc(u.username)}">✓ Approve${role === 'teacher' ? ' as teacher' : ''}</button><button class="btn red" data-rqno="${esc(u.username)}">✕ Reject</button></div></div>`).join('')}</div>`;
}
function bindPendingReqs() {
  $$('.req .chips input').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
  $$('[data-rqno]').forEach(b => b.onclick = async () => { if (!confirm('Reject this request?')) return; b.disabled = true; await setUserStatus(b.dataset.rqno, 'rejected'); render(); });
  $$('[data-rqok]').forEach(b => b.onclick = async () => { const un = b.dataset.rqok, card = b.closest('.req'), u = db.users.find(x => x.username === un); if (!u) return;
    b.disabled = true;
    if (u.role === 'teacher') { const classes = $$('[data-rqcls] input:checked', card).map(i => i.value), subjects = $$('[data-rqsub] input:checked', card).map(i => i.value);
      if (classes.join(';') !== (u.classes || []).join(';') || subjects.join(';') !== (u.subjects || []).join(';')) {
        try { if (!online()) throw new Error('Connect to the internet to assign classes'); const r = await postJSON(db.settings.scriptUrl, {action: 'admin_user_update', username: un, name: dispName(u), subjects: subjects.join(';'), classes: classes.join(';')});
          if (!r.ok) throw new Error(r.error); Object.assign(u, {classes, subjects}); save(); } catch (e) { b.disabled = false; return toast(e.message); } } }
    await setUserStatus(un, 'approved'); render(); });
}
/** phones: every .ptbl row becomes a card – each cell gets its column name as a label */
function labelPtbls() { $$('table.ptbl').forEach(t => { const hs = [...t.querySelectorAll('tr:first-child th')].map(h => h.textContent.trim());
  t.querySelectorAll('tr:not(:first-child):not(.subrow)').forEach(tr => [...tr.children].forEach((td, i) => { if (hs[i]) td.dataset.l = hs[i]; })); }); }
function peopleBoxesHTML() {
  return `<div id="rpwBox" class="card hidden" style="background:#fffbea"><h3>🔑 Reset password for <span id="rpwWho"></span></h3>
      <div class="row"><div><label>Temporary password</label><input id="rpwPass" autocomplete="off"></div><div><label>&nbsp;</label><label class="chk"><input type="checkbox" id="rpwForce" checked> Must change it at next login</label></div></div>
      <button class="btn" id="rpwSave">Set temporary password</button><button class="btn sec" id="rpwCancel">Cancel</button><p class="muted">Tell the person the temporary password by phone/WhatsApp. They are signed out on all phones.</p></div>
    <div id="emBox" class="card hidden" style="background:#eef6ff"><h3>✉️ Recovery email for <span id="emWho"></span></h3>
      <label>Email (leave empty to remove)</label><input id="emVal" type="email" inputmode="email" autocapitalize="none">
      <button class="btn" id="emSave">Save email</button><button class="btn sec" id="emCancel">Cancel</button><p class="muted">Used to send a 6-digit code on “Forgot password”.</p></div>`;
}
function teachersSecHTML() {
  const T = db.users.filter(u => u.role === 'teacher'), f = STATE.tF || '';
  const cnt = st => T.filter(u => u.status === st).length;
  const list = T.filter(u => !f || u.status === f).sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.name.localeCompare(b.name));
  const open = STATE.tOpen || '';
  return `<div class="card" id="teachersSec"><div class="card-h"><h2>👩‍🏫 Teachers <span class="ur">اساتذہ</span></h2><span class="badge ${cnt('pending') ? 'warn' : ''}">${cnt('pending')} pending</span></div>
    <div class="kpis" id="tKpis">${kpi('Total teachers', T.length)}${kpi('Approved', cnt('approved'))}${kpi('Pending', cnt('pending'), cnt('pending') ? 'waiting for you' : '', cnt('pending') ? 'down' : '')}${kpi('Disabled', cnt('disabled') + cnt('rejected'), cnt('rejected') ? `${cnt('rejected')} rejected` : '')}</div>
    ${pendingReqHTML('teacher')}
    <div class="filters"><div><label>Search</label><input id="tSearch" placeholder="Name, username, phone, subject…" value="${esc(STATE.tQ || '')}"></div>
      <div><label>Status</label><select id="tStF">${optsKV([['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['disabled', 'Disabled'], ['rejected', 'Rejected']], f)}</select></div></div>
    ${list.length ? `<div class="tbl-wrap"><table id="tTbl" class="ptbl"><tr><th>Name</th><th>Username</th><th>Phone / email</th><th>Subjects</th><th>Classes</th><th>Status</th><th>Joined</th><th>Last sync</th><th class="num">Tests</th><th>Actions</th></tr>
      ${list.map(u => { const mine = db.tests.filter(t => t.teacherName === u.name || t.teacherId === u.id);
        const q = [u.name, u.username, u.phone, u.email, ...(u.subjects || []), ...(u.classes || [])].join(' ').toLowerCase();
        return `<tr data-q="${esc(q)}" data-user="${esc(u.username)}"><td class="pname"><b>${esc(dispName(u))}</b>${u.mustChange ? ' <span class="badge warn">must change pw</span>' : ''}</td><td>${esc(u.username)}</td>
          <td>${esc(u.phone || '–')}${u.email ? `<div class="muted" style="font-size:12px">✉️ ${esc(u.email)}</div>` : ''}</td><td>${esc((u.subjects || []).join(', ') || 'all')}</td><td>${esc((u.classes || []).join(', ') || 'all')}</td>
          <td>${stBadge(u.status)}</td><td>${u.createdAt ? fmtD(String(u.createdAt).slice(0, 10)) : '–'}</td><td>${ago(u.lastSeen)}</td><td class="num">${mine.length}</td>
          <td class="acts">${statusBtns(u)}<button class="btn sm sec" data-tedit="${esc(u.username)}">✏️ Edit</button><button class="btn sm sec" data-ttests="${esc(u.username)}">📋 Tests</button></td></tr>
          ${STATE.tEdit === u.username ? teacherEditHTML(u) : ''}
          ${open === u.username ? `<tr class="subrow"><td colspan="10">${mine.length ? `<b>Tests entered by ${esc(u.name)}</b><table class="mini"><tr><th>Date</th><th>Class</th><th>Subject</th><th class="num">Students</th><th class="num">Average</th></tr>${[...mine].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(t => `<tr><td>${fmtD(t.date)}</td><td>${esc(testCk(t))}</td><td>${esc(t.subject)}</td><td class="num">${t.rows.length}</td><td class="num">${p1(classAvg([t]))}</td></tr>`).join('')}</table>` : '<span class="muted">No tests entered yet.</span>'}</td></tr>` : ''}`; }).join('')}</table></div>`
      : '<div class="empty">No teachers yet. Teachers register on the “Teacher Login” page → “Register here”.</div>'}</div>`;
}
function teacherEditHTML(u) {
  const chips = (id, all, sel) => `<div class="chips" id="${id}">${all.map(v => `<label class="chip ${sel.includes(v) ? 'on' : ''}"><input type="checkbox" value="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</div>`;
  return `<tr class="subrow" id="teRow"><td colspan="10"><b>✏️ Edit ${esc(u.name)}</b>
    <div class="row"><div><label>Name</label><input id="teName" value="${esc(u.name)}"></div><div><label>Phone</label><input id="tePhone" value="${esc(u.phone || '')}"></div></div>
    <label>Subjects (none = all)</label>${chips('teSubs', allSubjects(), u.subjects || [])}<label>Classes (none = all) – a teacher can edit marks and students only in these classes</label>${chips('teCls', allClassKeys(), u.classes || [])}
    <button class="btn sm" id="teSave">💾 Save</button> <button class="btn sm sec" id="teCancel">Cancel</button></td></tr>`;
}
function deletedStudentsHTML() {
  const L = db.deletedRows || []; if (!L.length) return '';
  return `<div class="card" id="delStuCard"><div class="card-h"><h2>🗑️ Deleted students <span class="ur">حذف شدہ</span></h2><span class="badge">${L.length}</span></div>
    <p class="muted">Hidden from lists – their old marks are kept. Restore brings them back; “Delete forever” removes the roster row (marks stay in the Results sheet).</p>
    <div class="tbl-wrap"><table id="delStuTbl" class="ptbl"><tr><th>Class</th><th>Roll</th><th>Name</th><th>Father</th><th>Deleted by</th><th>When</th><th></th></tr>
    ${L.map(x => { const k = `${x.class}|${x.section}|${x.roll_no}`; return `<tr><td>${esc(x.class + ' ' + x.section)}</td><td>${esc(x.roll_no)}</td><td>${esc(x.student_name)}</td><td>${esc(x.father_name || '–')}</td><td>${esc(x.updated_by || '–')}</td><td>${ago(x.updated_at)}</td>
      <td class="acts"><button class="btn sm" data-srestore="${esc(k)}">↩️ Restore</button><button class="btn sm red" data-spurge="${esc(k)}">Delete forever</button></td></tr>`; }).join('')}</table></div></div>`;
}
function bindDeletedStudents() {
  const act = async (action, k) => { const [c, sc, r] = k.split('|');
    try { if (!online()) throw new Error('Connect to the internet'); const res = await postJSON(db.settings.scriptUrl, {action, class: c, section: sc, roll_no: r}); if (!res.ok) throw new Error(res.error);
      db.deletedRows = (db.deletedRows || []).filter(x => `${x.class}|${x.section}|${x.roll_no}` !== k); save(); toast(action === 'student_restore' ? 'Student restored ✓' : 'Student deleted forever'); await pullNow(false); render(); } catch (e) { toast(e.message); } };
  $$('[data-srestore]').forEach(b => b.onclick = () => act('student_restore', b.dataset.srestore));
  $$('[data-spurge]').forEach(b => b.onclick = () => { if (confirm('Delete this student FOREVER? This cannot be undone. (Old marks stay in the Results sheet.)')) act('student_purge', b.dataset.spurge); });
}
function historyHTML() {
  const L = db.audit || [], f = STATE.hF || {};
  const ents = [...new Set(L.map(x => x.entity))].sort(), acts = [...new Set(L.map(x => x.action))].sort();
  return `<div class="card" id="historySec"><div class="card-h"><h2>🕘 Change history <span class="ur">تبدیلیوں کی تاریخ</span></h2><button class="btn sm sec" id="hRefresh">⟳ Refresh</button></div>
    <p class="muted">Every create, edit and delete of marks, tests, students, users, subjects and settings – who did it and when (last 300). Also saved in the “Audit” tab of the Google Sheet.</p>
    <div class="filters"><div><label>Search</label><input id="hQ" type="search" placeholder="🔍 Who, class, roll, subject…" value="${esc(f.q || '')}"></div>
      <div><label>Type</label><select id="hEnt">${optsKV([['', 'All'], ...ents.map(e => [e, e])], f.ent || '')}</select></div>
      <div><label>Action</label><select id="hAct">${optsKV([['', 'All'], ...acts.map(e => [e, e])], f.act || '')}</select></div></div>
    ${L.length ? `<div class="tbl-wrap"><table id="hTbl" class="ptbl"><tr><th>When</th><th>Who</th><th>Action</th><th>Type</th><th>Item</th><th>Details</th></tr>
    ${L.filter(x => (!f.ent || x.entity === f.ent) && (!f.act || x.action === f.act)).map(x => `<tr data-q="${esc([x.by, x.username, x.action, x.entity, x.key, x.details].join(' ').toLowerCase())}"><td style="white-space:nowrap">${esc(String(x.at).slice(0, 16).replace('T', ' '))}</td><td>${esc(x.by)} <span class="rbadge r-${esc(x.role)}">${esc(x.role)}</span></td>
      <td><span class="badge ${/delete|purge|rejected/.test(x.action) ? 'bad' : /create|restore/.test(x.action) ? '' : 'warn'}">${esc(x.action)}</span></td><td>${esc(x.entity)}</td><td>${esc(x.key)}</td><td>${esc(x.details)}</td></tr>`).join('')}</table></div>`
      : '<div class="empty">No changes recorded yet (sync to download the history).</div>'}</div>`;
}
function bindHistory() {
  const f = () => { const q = $('#hQ').value.trim().toLowerCase(); (STATE.hF = STATE.hF || {}).q = q; $$('#hTbl tr[data-q]').forEach(r => r.classList.toggle('hidden', !!q && !q.split(/\s+/).every(w => r.dataset.q.includes(w)))); };
  $('#hQ').oninput = f; f();
  $('#hEnt').onchange = $('#hAct').onchange = () => { STATE.hF = {q: $('#hQ').value, ent: $('#hEnt').value, act: $('#hAct').value}; render(); };
  $('#hRefresh').onclick = async () => { await pullNow(true); render(); };
}
function studentRowsAll() {
  const map = new Map(), key = (c, r) => `${c}|${r}`;
  for (const [c, list] of Object.entries(db.students)) for (const x of list) map.set(key(c, x.roll), {cls: c, roll: x.roll, name: fullName(x), father: x.father || '', addedBy: x.addedBy || '', roster: true});
  for (const u of db.users.filter(u => u.role === 'student' && u.cls)) { const k = key(u.cls, u.roll), ex = map.get(k) || {cls: u.cls, roll: u.roll, name: fullName(u), father: u.father || ''}; ex.acct = u; if (!ex.name) ex.name = fullName(u); map.set(k, ex); }
  const pctBy = {}; for (const c of new Set([...map.values()].map(r => r.cls))) for (const s of aggregate(testsIn({cls: c}))) pctBy[key(c, s.roll)] = s.pct;
  return [...map.values()].map(r => ({...r, pct: pctBy[key(r.cls, r.roll)], status: r.acct ? r.acct.status : ''}))
    .sort((a, b) => a.cls.localeCompare(b.cls) || (+a.roll || 0) - (+b.roll || 0) || String(a.roll).localeCompare(String(b.roll)));
}
function studentsSecHTML() {
  const all = studentRowsAll(), fc = STATE.stCls || '', fs = STATE.stSt || '';
  const list = all.filter(r => (!fc || r.cls === fc) && (!fs || (fs === 'none' ? !r.acct : r.status === fs)));
  const byCls = {}; all.forEach(r => byCls[r.cls] = (byCls[r.cls] || 0) + 1);
  const nP = all.filter(r => r.status === 'pending').length, nA = all.filter(r => r.status === 'approved').length;
  return `<div class="card" id="studentsSec"><div class="card-h"><h2>🎓 Students <span class="ur">طلبہ</span></h2><span class="badge ${nP ? 'warn' : ''}">${nP} pending</span></div>
    <div class="kpis" id="sKpisA">${kpi('Total students', all.length, `${all.filter(r => !r.acct).length} without login`)}${kpi('Approved logins', nA)}${kpi('Pending', nP, nP ? 'waiting for you' : '', nP ? 'down' : '')}${kpi('Classes', Object.keys(byCls).length)}</div>
    ${pendingReqHTML('student')}
    <div class="chips" id="byCls">${Object.entries(byCls).map(([c, n]) => `<button class="chip ${fc === c ? 'on' : ''}" data-stcls="${esc(c)}">${esc(c)} <b>${n}</b></button>`).join('')}</div>
    <div class="filters"><div><label>Search</label><input id="stSearch" placeholder="Roll, name, father, username…" value="${esc(STATE.stQ || '')}"></div>
      <div><label>Class</label><select id="stClsF">${opts(allClassKeys(), fc, 'All classes')}</select></div>
      <div><label>Status</label><select id="stStF">${optsKV([['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['disabled', 'Disabled'], ['rejected', 'Rejected'], ['none', 'No login yet']], fs)}</select></div></div>
    ${list.length ? `<div class="tbl-wrap"><table id="stTblA" class="ptbl"><tr><th>Roll</th><th>Name</th><th>Father</th><th>Class</th><th>Status</th><th class="num">Overall %</th><th>Actions</th></tr>
      ${list.map(r => { const q = [r.roll, r.name, r.father, r.cls, r.acct ? r.acct.username : '', r.acct ? r.acct.email : ''].join(' ').toLowerCase();
        return `<tr data-q="${esc(q)}" data-sk="${esc(r.cls + '|' + r.roll)}"><td>${esc(r.roll)}</td><td class="pname"><b>${esc(r.name || (r.acct ? dispName(r.acct) : '–'))}</b>${r.acct ? `<div class="muted" style="font-size:12px">@${esc(r.acct.username)}${r.acct.email ? ' · ✉️ ' + esc(r.acct.email) : ''}</div>` : ''}${r.addedBy ? `<div class="muted" style="font-size:12px">added by ${esc(r.addedBy)}</div>` : ''}</td>
          <td>${esc(r.father || '–')}</td><td>${esc(r.cls)}</td><td>${stBadge(r.status)}</td><td class="num">${r.pct == null ? '–' : gradeBadge(r.pct)}</td>
          <td class="acts">${r.acct ? statusBtns(r.acct) : ''}<button class="btn sm sec" data-sres="${esc(r.cls + '|' + r.roll)}">📈 Results</button>${r.roster ? `<button class="btn sm sec" data-sed2="${esc(r.cls + '|' + r.roll)}">✏️ Edit</button><button class="btn sm red" data-sdel2="${esc(r.cls + '|' + r.roll)}">🗑 Delete</button>` : ''}</td></tr>`; }).join('')}</table></div>`
      : '<div class="empty">No students match.</div>'}
    <p class="muted">Students register on the “Student Login” page; teachers can also add students to their classes. A registration links to the class list entry with the same class + roll number.</p></div>`;
}
function bindPeopleSec() {
  const live = (inp, tbl, k) => { const el = $(inp); if (!el) return; const f = () => { const q = el.value.trim().toLowerCase(); STATE[k] = el.value;
    $$(`${tbl} tr[data-q]`).forEach(tr => { const hide = q && !tr.dataset.q.includes(q); tr.style.display = hide ? 'none' : ''; const n = tr.nextElementSibling; if (n && n.classList.contains('subrow')) n.style.display = hide ? 'none' : ''; }); };
    el.oninput = f; f(); };
  live('#tSearch', '#tTbl', 'tQ'); live('#stSearch', '#stTblA', 'stQ'); bindPendingReqs(); labelPtbls();
  if ($('#tStF')) $('#tStF').onchange = e => { STATE.tF = e.target.value; render(); };
  $$('[data-tedit]').forEach(b => b.onclick = () => { STATE.tEdit = STATE.tEdit === b.dataset.tedit ? '' : b.dataset.tedit; render(); });
  if ($('#teSave')) $('#teSave').onclick = async () => { const un = STATE.tEdit, name = $('#teName').value.trim(); if (!name) return toast('Name required');
    const subjects = $$('#teSubs input:checked').map(i => i.value), classes = $$('#teCls input:checked').map(i => i.value);
    try { if (!online()) throw new Error('Connect to the internet to edit a teacher'); const r = await postJSON(db.settings.scriptUrl, {action: 'admin_user_update', username: un, name, phone: $('#tePhone').value.trim(), subjects: subjects.join(';'), classes: classes.join(';')});
      if (!r.ok) throw new Error(r.error); const u = db.users.find(x => x.username === un); if (u) Object.assign(u, {name, phone: $('#tePhone').value.trim(), subjects, classes}); save(); STATE.tEdit = ''; toast('Teacher updated ✓'); render(); } catch (e) { toast(e.message); } };
  if ($('#teCancel')) $('#teCancel').onclick = () => { STATE.tEdit = ''; render(); };
  $$('#teSubs input, #teCls input').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
  $$('[data-ttests]').forEach(b => b.onclick = () => { STATE.tOpen = STATE.tOpen === b.dataset.ttests ? '' : b.dataset.ttests; render(); });
  if ($('#stClsF')) $('#stClsF').onchange = e => { STATE.stCls = e.target.value; render(); };
  if ($('#stStF')) $('#stStF').onchange = e => { STATE.stSt = e.target.value; render(); };
  $$('[data-stcls]').forEach(b => b.onclick = () => { STATE.stCls = STATE.stCls === b.dataset.stcls ? '' : b.dataset.stcls; render(); });
  const split = v => { const i = v.lastIndexOf('|'); return [v.slice(0, i), v.slice(i + 1)]; };
  $$('[data-sres]').forEach(b => b.onclick = () => { const [c, r] = split(b.dataset.sres); go('sdash', {sCls: c, sRoll: r}); });
  $$('[data-sed2]').forEach(b => b.onclick = () => { const [c, r] = split(b.dataset.sed2); STATE.sCls = c; STATE.sEdit = r; render(); setTimeout(() => $('#students') && $('#students').scrollIntoView(), 60); });
  $$('[data-sdel2]').forEach(b => b.onclick = () => { const [c, r] = split(b.dataset.sdel2); if (!confirm(`Remove roll ${r} from ${c}? Old test marks stay.`)) return;
    db.students[c] = (db.students[c] || []).filter(x => x.roll !== r); const {grade: g, section} = splitCk(c); db.deletedStudents.push(`${g}|${section}|${r}`); save(); window.syncNow(false); render(); });
}
export async function viewAdmin() {
  if (!isAdmin()) return go('home');
  await ensureChart().catch(e => toast(e.message));
  const [from, to] = rangeDates(); const [pf, pt] = prevRange(from, to);
  const tests = testsIn({from, to}); const avg = classAvg(tests); const dl = delta(avg, classAvg(testsIn({from: pf, to: pt})));
  const classes = allClassKeys(); const subs = [...new Set(tests.map(t => t.subject))];
  const studentsN = classes.reduce((n, c) => n + rosterOf(c).length, 0);
  const teachers = db.users.filter(u => u.role !== 'student'); const tNames = [...new Set([...teachers.filter(t => t.status === 'approved' || t.role === 'owner').map(t => t.name), ...db.tests.map(t => t.teacherName)])];
  const schoolPass = (() => { const fail = []; let n = 0, ok = 0; classes.forEach(c => aggregate(tests.filter(t => testCk(t) === c)).forEach(x => { if (x.pct == null) return; n++;
    const failSubs = Object.entries(x.subj).filter(([k, v]) => v.pct != null && !isPass(v.pct, k)); if (isPass(x.pct) && !failSubs.length) ok++; else fail.push({...x, cls: c}); })); return {rate: n ? ok / n * 100 : null, fail}; })();
  const sec = ['overview', 'teachers', 'students', 'classes', 'settings', 'share', 'history'].includes(STATE.aSec) ? STATE.aSec : 'overview';
  const tAll = db.users.filter(u => u.role === 'teacher'), sAcc = db.users.filter(u => u.role === 'student');
  const nPendT = tAll.filter(u => u.status === 'pending').length, nPendS = sAcc.filter(u => u.status === 'pending').length;
  const SEC = [['overview', '📊', 'Overview'], ['teachers', '👩‍🏫', 'Teachers', nPendT], ['students', '🎓', 'Students', nPendS], ['classes', '🏫', 'Classes & Subjects'], ['settings', '⚙️', 'School Settings'], ['history', '🕘', 'Change history'], ['share', '🔗', 'Share & Backup']];
  const side = `<aside class="admin-side no-print" id="adminSide"><div class="admin-side-h">🛡️ Admin Panel</div>${SEC.map(([k, ic, l, n]) => `<button class="${k === sec ? 'on' : ''}" data-asec="${k}">${ic} ${l}${n ? ` <span class="nbadge">${n}</span>` : ''}</button>`).join('')}</aside>`;
  let main;
  if (sec === 'overview') main = `<div class="peoplecards"><button class="pcard" data-asec="teachers" id="ovTeachers"><span class="pc-ic">👩‍🏫</span><span><b>${tAll.length}</b> Teachers</span><small>${tAll.filter(u => u.status === 'approved').length} approved · ${nPendT} pending</small><span class="pc-go">Manage →</span></button>
      <button class="pcard" data-asec="students" id="ovStudents"><span class="pc-ic">🎓</span><span><b>${studentsN}</b> Students</span><small>${sAcc.filter(u => u.status === 'approved').length} with login · ${nPendS} pending</small><span class="pc-go">Manage →</span></button></div>
  <div class="card"><div class="card-h"><h2>Admin overview <span class="ur">انتظامیہ</span></h2></div>${rangeHTML()}</div>
  <div class="kpis">${kpi('Teachers', tNames.length)}${kpi('Classes', classes.length)}${kpi('Students', studentsN)}${kpi('Tests (period)', tests.length, `${db.tests.length} all-time`)}
    ${kpi('School average', p1(avg), dl.txt)}${kpi(`Pass rate (≥${passMark()}%)`, p1(schoolPass.rate), `${schoolPass.fail.length} students failing`)}${kpi('Waiting to sync', db.tests.filter(t => !t.synced).length)}</div>
  <div class="grid2"><div class="card"><h3>Average by class</h3><div class="chartbox"><canvas id="aClsChart"></canvas></div></div>
    <div class="card"><h3>Average by subject</h3><div class="chartbox"><canvas id="aSub"></canvas></div></div></div>
  <div class="grid2"><div class="card"><h3>Tests entered per teacher</h3><div class="chartbox"><canvas id="aTch"></canvas></div></div>
    <div class="card"><h3>Daily activity (tests)</h3><div class="chartbox"><canvas id="aAct"></canvas></div></div></div>
  <div class="card"><h3>All classes</h3><div class="tbl-wrap"><table><tr><th>Class</th><th class="num">Students</th><th class="num">Tests</th><th class="num">Average</th><th class="num">Leaves</th><th>Last test</th><th>Teachers</th></tr>
    ${classes.map(c => { const ct = tests.filter(t => testCk(t) === c); const last = db.tests.filter(t => testCk(t) === c).map(t => t.date).sort().pop();
      return `<tr><td><button class="link" data-cls="${esc(c)}">${esc(c)}</button></td><td class="num">${rosterOf(c).length}</td><td class="num">${ct.length}</td><td class="num">${p1(classAvg(ct))}</td><td class="num">${ct.reduce((n, t) => n + t.rows.filter(r => r.obt == null).length, 0)}</td><td>${last ? fmtD(last) : '–'}</td><td class="muted">${esc([...new Set(ct.map(t => t.teacherName))].join(', '))}</td></tr>`; }).join('')}</table></div></div>
  <div class="card" id="aFailCard"><h3>❌ Failing students (period) <span class="ur">فیل طلبہ</span></h3>${failingHTML(schoolPass.fail, '')}</div>
  <div class="card"><h3>Most leaves (period) <span class="ur">سب سے زیادہ چھٹیاں</span></h3>${mostLeaves(tests)}</div>
`;
  else if (sec === 'teachers') main = teachersSecHTML();
  else if (sec === 'students') main = studentsSecHTML() + deletedStudentsHTML() + studentsHTML();
  else if (sec === 'history') main = historyHTML();
  else if (sec === 'classes') main = listsHTML();
  else if (sec === 'settings') main = `  <div class="card"><h2>School settings <span class="ur">اسکول کی ترتیبات</span></h2>
    <div class="row"><div><label>School name</label><input id="aName" value="${esc(school())}"></div>
    <div><label>Logo (PNG/JPG, auto-resized)</label><div style="display:flex;gap:10px;align-items:center"><img id="aLogoPrev" class="logo-prev" src="${esc(logo())}"><input type="file" id="aLogo" accept="image/*"></div></div></div>
    <div class="row"><div><label>Pass mark % per subject (default 40)</label><input type="number" id="aPass" min="1" max="100" step="0.5" value="${Number(db.settings.passPercent) || 40}"><div class="muted" style="font-size:12px">Per-subject overrides: Classes &amp; Subjects.</div></div><div></div></div>
    <div class="row"><div><label>Honor Board size (students shown)</label><input type="number" id="aHonor" min="1" max="20" value="${Number(db.settings.honorLimit) || 7}"></div>
    <div><label>Announcements</label><label class="chk"><input type="checkbox" id="aTAnn" ${db.settings.teachersCanAnnounce === 'yes' ? 'checked' : ''}> Teachers may also post announcements</label></div></div>
    <h3>Contact (shown on the public Contact page and on “Forgot password”)</h3>
    <div class="row"><div><label>WhatsApp name</label><input id="cWaName" value="${esc((db.settings.contact || {}).whatsapp_name || '')}"></div><div></div></div>
    <div class="row"><div><label>Phone</label><input id="cPhone" inputmode="tel" value="${esc((db.settings.contact || {}).phone || '')}"></div><div><label>WhatsApp</label><input id="cWa" inputmode="tel" value="${esc((db.settings.contact || {}).whatsapp || '')}"></div></div>
    <div class="row"><div><label>Email</label><input id="cEmail" value="${esc((db.settings.contact || {}).email || '')}"></div><div><label>Address</label><input id="cAddr" value="${esc((db.settings.contact || {}).address || '')}"></div></div>
    <p class="muted">Saved to the “Settings” tab of the Google Sheet and copied to every device on its next sync.</p>
    <button class="btn" id="aSave">Save school settings</button><button class="btn sec" id="aReset">Reset logo</button></div>
`;
  else main = shareHTML() + backupHTML();
  app().innerHTML = `<div class="admin-layout">${side}<div class="admin-main" id="adminMain">${main}${['teachers', 'students'].includes(sec) ? peopleBoxesHTML() : ''}</div></div>`;
  $$('[data-asec]').forEach(b => b.onclick = () => { STATE.aSec = b.dataset.asec; render(); window.scrollTo(0, 0); });
  if (sec === 'teachers' || sec === 'students') { bindPeople(); bindPeopleSec(); }
  if (sec === 'students') { bindStudents(); bindDeletedStudents(); }
  if (sec === 'history') bindHistory();
  if (sec === 'classes') bindLists();
  if (sec === 'share') bindBackup();
  if (sec === 'settings') {
  let newLogo = null;
  $('#aLogo').onchange = e => { const f = e.target.files[0]; if (!f) return; const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'), S = 128, k = Math.min(S / img.width, S / img.height); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); newLogo = c.toDataURL('image/png'); if (newLogo.length > 45000) newLogo = c.toDataURL('image/jpeg', .8); $('#aLogoPrev').src = newLogo; URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(f); };
  $('#aReset').onclick = () => { newLogo = ''; $('#aLogoPrev').src = 'icons/icon-192.png'; };
  $('#aSave').onclick = () => { db.settings.schoolName = $('#aName').value.trim() || DEFAULT_NAME; db.settings.honorLimit = Math.max(1, Math.min(20, parseInt($('#aHonor').value) || 7)); db.settings.passPercent = Math.max(1, Math.min(100, parseFloat($('#aPass').value) || 40)); db.settings.teachersCanAnnounce = $('#aTAnn').checked ? 'yes' : 'no'; db.settings.contact = {whatsapp_name: $('#cWaName').value.trim(), phone: $('#cPhone').value.trim(), whatsapp: $('#cWa').value.trim(), email: $('#cEmail').value.trim(), address: $('#cAddr').value.trim()}; if (newLogo !== null) db.settings.logo = newLogo;
    db.settings.settingsDirty = true; save(); applyBranding(); toast('School settings saved ✓'); window.syncNow(false); };
  }
  if (sec !== 'overview') return;
  bindRange(render);
  $$('[data-cls]').forEach(b => b.onclick = () => go('tdash', {dCls: b.dataset.cls, dSub: ''}));
  const ca = classes.map(c => r1(classAvg(tests.filter(t => testCk(t) === c))));
  chart('aClsChart', {type: 'bar', data: {labels: classes, datasets: [{label: 'Avg %', data: ca, backgroundColor: classes.map(c => /girls/i.test(c) ? '#b65a8d' : G)}]}, options: {scales: pctAxis}});
  chart('aSub', {type: 'bar', data: {labels: subs, datasets: [{label: 'Avg %', data: subs.map(s => r1(classAvg(tests.filter(t => t.subject === s)))), backgroundColor: BLUE}]}, options: {indexAxis: 'y', scales: {x: {min: 0, max: 100}}}});
  chart('aTch', {type: 'bar', data: {labels: tNames, datasets: [{label: 'Tests', data: tNames.map(n => tests.filter(t => t.teacherName === n).length), backgroundColor: O}]}, options: {scales: {y: {beginAtZero: true, ticks: {precision: 0}}}}});
  const days = []; for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d);
  chart('aAct', {type: 'line', data: {labels: days.map(d => fmtD(d).slice(0, 6)), datasets: [{label: 'Tests', data: days.map(d => tests.filter(t => t.date === d).length), borderColor: G, backgroundColor: G2, fill: true, tension: .25, pointRadius: 2}]}, options: {scales: {y: {beginAtZero: true, ticks: {precision: 0}}}}});
}

/* ------------------------------------------------------------------ weekly / monthly report */
function periodOf(type, ref) { return type === 'week' ? weekRange(ref) : monthRange(ref); }
function periodLabel(type, f, t) { return type === 'all' ? 'All tests' : type === 'week' ? `Week ${fmtD(f)} – ${fmtD(t)}` : parseD(f).toLocaleDateString('en-GB', {month: 'long', year: 'numeric'}); }
export async function viewReport() {
  const all = allClassKeys(); const cls = STATE.rCls && all.includes(STATE.rCls) ? STATE.rCls : (STATE.dCls || all[0]);
  const type = STATE.rType || 'week', ref = STATE.rRef || today(), sub = STATE.rSub || '';
  const [f, t] = periodOf(type, ref); const tests = testsIn({cls, subject: sub || undefined, from: f, to: t}); const agg = aggregate(tests);
  const subs = [...new Set(tests.map(x => x.subject))];
  app().innerHTML = `<div class="card no-print"><div class="card-h"><h2>Weekly / monthly report <span class="ur">ہفتہ وار / ماہانہ رپورٹ</span></h2></div>
    <div class="filters"><div><label>Class</label><select id="rCls">${opts(all, cls)}</select></div><div><label>Subject</label><select id="rSub">${opts(allSubjects(), sub, 'All subjects')}</select></div>
    <div><label>Period <span class="ur">مدت</span></label><select id="rType"><option value="week" ${type === 'week' ? 'selected' : ''}>Weekly (Mon–Sun)</option><option value="month" ${type === 'month' ? 'selected' : ''}>Monthly</option></select></div>
    <div><label>Any date in period</label><input type="date" id="rRef" value="${ref}"></div>
    <div><label>Search</label><input id="rQ" type="search" placeholder="🔍 Name, roll, father"></div><div><label>Result</label><select id="rPF"><option value="">All</option><option value="pass">Pass only</option><option value="fail">Fail only</option></select></div></div>
    <button class="btn sec" onclick="print()">🖨️ Print / PDF</button><button class="btn sec" id="rCsv">⬇ CSV</button></div>
  <div class="card"><div class="card-h"><h3>${esc(school())} – ${esc(cls)} – ${periodLabel(type, f, t)}${sub ? ' – ' + esc(sub) : ''}</h3><span class="muted">${tests.length} tests</span></div>
  ${!tests.length ? '<div class="empty">No tests in this period.</div>' : `<div class="tbl-wrap"><table id="rTbl"><tr><th>Roll</th><th>Name</th>${subs.map(s => `<th class="num">${esc(s)}</th>`).join('')}<th class="num">Obtained</th><th class="num">Overall %</th><th>Grade</th><th>Result</th><th class="num">Rank</th></tr>
    ${agg.map(s => { const fsub = Object.entries(s.subj).filter(([k, v]) => v.pct != null && !isPass(v.pct, k)).length, pf = s.pct == null ? '' : fsub ? 'fail' : 'pass';
      return `<tr data-q="${esc([s.roll, s.name, ((db.students[cls] || []).find(x => x.roll === s.roll) || {}).father || ''].join(' ').toLowerCase())}" data-pf="${pf}"><td>${esc(s.roll)}</td><td>${esc(s.name)}</td>${subs.map(x => `<td class="num">${s.subj[x] ? (s.subj[x].pct == null ? 'Leave' : p1(s.subj[x].pct) + ' ' + passBadge(s.subj[x].pct, x) + (s.subj[x].leave ? ` <small class="muted">(${s.subj[x].leave}L)</small>` : '')) : '–'}</td>`).join('')}<td class="num">${r1(s.obt)}/${s.total}</td><td class="num"><b>${p1(s.pct)}</b></td><td><b>${grade(s.pct)}</b></td><td>${pf ? `<span class="badge pf ${pf}">${pf === 'pass' ? 'Pass' : `Fail (${fsub})`}</span>` : 'Leave'}</td><td class="num">${s.rank}</td></tr>`; }).join('')}
    <tr><td></td><td><b>Class average</b></td>${subs.map(x => `<td class="num"><b>${p1(classAvg(tests.filter(y => y.subject === x)))}</b></td>`).join('')}<td></td><td class="num"><b>${p1(classAvg(tests))}</b></td><td></td><td></td><td></td></tr></table></div>
    <p class="muted">% = total obtained ÷ total marks of tests attended in the period (leave tests are counted in “Leave” but not in %). Grades: A+ ≥80, A ≥70, B ≥60, C ≥50, D ≥40, E ≥33, F &lt;33.</p>`}</div>`;
  const set = () => { Object.assign(STATE, {rCls: $('#rCls').value, rSub: $('#rSub').value, rType: $('#rType').value, rRef: $('#rRef').value}); render(); };
  ['#rCls', '#rSub', '#rType', '#rRef'].forEach(s => $(s).onchange = set);
  const rf = () => { const q = $('#rQ').value.trim().toLowerCase(), pf = $('#rPF').value; $$('#rTbl tr[data-q]').forEach(r => r.classList.toggle('hidden', (!!q && !q.split(/\s+/).every(w => r.dataset.q.includes(w))) || (!!pf && r.dataset.pf !== pf))); };
  $('#rQ').oninput = rf; $('#rPF').onchange = rf;
  $('#rCsv').onclick = () => download(`report-${cls.replace(/\s/g, '_')}-${type}-${f}.csv`, ['roll,name,' + subs.join(',') + ',obtained,total,percent,grade,rank']
    .concat(agg.map(s => [s.roll, `"${s.name}"`, ...subs.map(x => s.subj[x] && s.subj[x].pct != null ? r1(s.subj[x].pct) : ''), r1(s.obt), s.total, s.pct == null ? '' : r1(s.pct), grade(s.pct), s.rank].join(','))).join('\n'), 'text/csv');
}

/* ------------------------------------------------------------------ parent result card */
function cardData(cls, roll, f, t, src) {
  const inP = src ? src.filter(x => x.date >= f && x.date <= t).sort((a, b) => a.date.localeCompare(b.date)) : testsIn({cls, from: f, to: t});
  const tests = inP.filter(x => x.rows.some(r => r.roll === roll));
  const s = aggregate(tests).find(x => x.roll === roll); const rank = (src && src.anon) || meStudent() ? null : aggregate(inP).find(x => x.roll === roll);
  return {tests, s, rank};
}
function cardHTML(cls, roll, type, f, t, src) {
  const {tests, s, rank} = cardData(cls, roll, f, t, src); if (!s) return '';
  const {grade: g, section} = splitCk(cls);
  const ro = (db.students[cls] || []).find(x => x.roll === roll) || {}; const nm = (src && src.student && src.student.name) || fullName(ro) || s.name, fa = (src && src.student && src.student.father) || ro.father || '';
  return `<div class="rc"><div class="hd"><img class="logo" src="${esc(logo())}" alt=""><h1>${esc(school())}</h1><div>Student Result Card · <span class="ur">رزلٹ کارڈ</span></div><div class="muted">${periodLabel(type, f, t)}</div></div>
    <div class="meta"><div><b>Name:</b> ${esc(nm)}</div><div><b>Father's Name:</b> ${esc(fa || '–')}</div><div><b>Roll No:</b> ${esc(s.roll)}</div><div><b>Class:</b> ${esc(g)}${/^(9|10)th$/.test(g) ? ' (Matric)' : ''}</div><div><b>Section:</b> ${esc(section)}</div></div>
    <table><tr><th>Subject</th><th class="num">Tests</th><th class="num">Leave</th><th class="num">Obtained</th><th class="num">Total</th><th class="num">%</th><th>Grade</th><th>Result</th></tr>
    ${Object.entries(s.subj).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.tests}</td><td class="num">${v.leave}</td><td class="num">${r1(v.obt)}</td><td class="num">${v.total}</td><td class="num">${p1(v.pct)}</td><td>${grade(v.pct)}</td><td>${v.pct == null ? 'Leave' : passBadge(v.pct, k)}</td></tr>`).join('')}
    <tr class="gt"><th>Grand total (all subjects)</th><th class="num">${s.tests}</th><th class="num">${s.leave}</th><th class="num">${r1(s.obt)}</th><th class="num">${s.total}</th><th class="num">${p1(s.pct)}</th><th>${grade(s.pct)}</th><th>${(() => { const fs = Object.entries(s.subj).filter(([k, v]) => v.pct != null && !isPass(v.pct, k)); return s.pct == null ? '' : fs.length ? `<span class="badge pf fail">Fail (${fs.length})</span>` : passBadge(s.pct); })()}</th></tr></table>
    ${(() => { const fsub = Object.entries(s.subj).filter(([k, v]) => v.pct != null && !isPass(v.pct, k)).map(([k]) => k); const ok = s.pct != null && !fsub.length;
      return `<div class="rc-overall ${s.pct == null ? '' : ok ? 'pass' : 'fail'}" id="rcOverall"><div><small>Grand total</small><b>${r1(s.obt)} / ${s.total}</b></div><div><small>Overall %</small><b>${p1(s.pct)}</b></div><div><small>Grade</small><b>${grade(s.pct)}</b></div>${rank ? `<div><small>Class position</small><b>${rank.rank}</b></div>` : ''}<div><small>Overall result</small><b class="rc-res">${s.pct == null ? 'Leave' : ok ? '✅ PASS' : '❌ FAIL'}</b></div></div>
      <p class="muted" style="margin:2px 0 8px;font-size:12px">Pass mark ${passMark()}% in every subject. ${fsub.length ? `Failed in: <b>${fsub.map(esc).join(', ')}</b> – overall result is Fail.` : 'Passed in all subjects.'}</p>`; })()}
    <details open><summary class="muted">Test-wise detail</summary><table style="font-size:12px">${tests.map(x => { const r = x.rows.find(y => y.roll === roll); return `<tr><td>${fmtD(x.date)}</td><td>${esc(x.subject)}</td><td class="num">${r.obt == null ? 'Leave' : `${r.obt}/${x.total}`}</td><td>${r.obt == null ? '' : passBadge(pct(r.obt, x.total), x.subject)}</td></tr>`; }).join('')}</table></details>
    <div class="sig"><div>Class Teacher</div><div>Principal</div></div><div class="dev">Generated by ${esc(school())} · Developed by Toshan Rafiq</div></div>`;
}
function shareText(cls, roll, type, f, t) {
  const {s, rank} = cardData(cls, roll, f, t); if (!s) return '';
  return `*${school()}* – Result Card\n${periodLabel(type, f, t)}\nStudent: ${s.name} (Roll ${s.roll}), ${cls}\n\n` +
    Object.entries(s.subj).map(([k, v]) => `• ${k}: ${v.pct == null ? 'Leave' : `${r1(v.obt)}/${v.total} = ${p1(v.pct)} ${isPass(v.pct, k) ? '✅ Pass' : '❌ Fail'}`}${v.leave ? ` (${v.leave} leave)` : ''}`).join('\n') +
    `\n\n*Overall: ${r1(s.obt)}/${s.total} = ${p1(s.pct)} (Grade ${grade(s.pct)})*\nClass position: ${rank ? rank.rank : '–'}\nLeave: ${s.leave} of ${s.tests} test(s)\n\nشکریہ – ${school()}`;
}
export async function viewCard() {
  const all = allClassKeys(); const cls = STATE.cCls && all.includes(STATE.cCls) ? STATE.cCls : (STATE.dCls || all[0]);
  const roster = rosterOf(cls); const roll = STATE.cRoll === '*' ? '*' : roster.some(s => s.roll === STATE.cRoll) ? STATE.cRoll : (roster[0] || {}).roll;
  const type = STATE.cType || 'month', ref = STATE.cRef || today(); const [f, t] = periodOf(type, ref);
  const rolls = roll === '*' ? roster.map(s => s.roll) : [roll];
  const cards = rolls.map(r => cardHTML(cls, r, type, f, t)).filter(Boolean);
  app().innerHTML = `<div class="card no-print"><div class="card-h"><h2>Parent result card <span class="ur">والدین کے لیے رزلٹ کارڈ</span></h2></div>
    <div class="filters"><div><label>Class</label><select id="cCls">${opts(all, cls)}</select></div>
    <div><label>Student</label><select id="cStu"><option value="*" ${roll === '*' ? 'selected' : ''}>All students (print all)</option>${roster.map(s => `<option value="${esc(s.roll)}" ${s.roll === roll ? 'selected' : ''}>${esc(s.roll)} – ${esc(s.name)}</option>`).join('')}</select></div>
    <div><label>Period</label><select id="cType"><option value="week" ${type === 'week' ? 'selected' : ''}>Weekly</option><option value="month" ${type === 'month' ? 'selected' : ''}>Monthly</option></select></div>
    <div><label>Any date in period</label><input type="date" id="cRef" value="${ref}"></div></div>
    <button class="btn" onclick="print()">🖨️ Print / Save PDF</button>${roll !== '*' && cards.length ? '<button class="btn wa" id="cWa">WhatsApp share</button><button class="btn sec" id="cCopy">Copy text</button>' : ''}
    <p class="muted">Tip: in the print window choose “Save as PDF”. <span class="ur">پرنٹ میں "Save as PDF" منتخب کریں</span></p></div>
  <div id="printArea">${cards.length ? cards.join('') : '<div class="card empty">No results in this period for the selected student.</div>'}</div>`;
  if (STATE.lockStudent) { $('#cCls').disabled = $('#cStu').disabled = true; }
  const set = () => { Object.assign(STATE, {cCls: $('#cCls').value, cRoll: $('#cStu').value, cType: $('#cType').value, cRef: $('#cRef').value}); render(); };
  $('#cCls').onchange = () => { STATE.cRoll = null; Object.assign(STATE, {cCls: $('#cCls').value}); render(); };
  ['#cStu', '#cType', '#cRef'].forEach(s => $(s).onchange = set);
  if ($('#cWa')) {
    const txt = shareText(cls, roll, type, f, t);
    $('#cWa').onclick = () => { if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) navigator.share({text: txt}).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank'); };
    $('#cCopy').onclick = () => navigator.clipboard.writeText(txt).then(() => toast('Copied – paste in WhatsApp'), () => toast('Copy not allowed'));
  }
}

/* ------------------------------------------------------------------ Honor Board */
// Each student's best single test result in the period, ranked by %; ties → earlier date first, then higher total marks.
export function honorList({cls, subject, from, to, limit}) {
  const best = {};
  testsIn({cls: cls || undefined, subject: subject || undefined, from, to}).forEach(t => t.rows.forEach(r => {
    if (r.obt == null) return; const key = testCk(t) + '|' + r.roll; const p = pct(r.obt, t.total); if (!isPass(p, t.subject)) return; // passing results only
    const cur = best[key]; const cand = {name: r.name, roll: r.roll, cls: testCk(t), subject: t.subject, date: t.date, obt: r.obt, total: t.total, pct: p};
    if (!cur || p > cur.pct || (p === cur.pct && (t.date < cur.date || (t.date === cur.date && t.total > cur.total)))) best[key] = cand;
  }));
  return Object.values(best).sort((a, b) => b.pct - a.pct || a.date.localeCompare(b.date) || b.total - a.total || a.name.localeCompare(b.name)).slice(0, limit);
}
export async function viewHonor() {
  if (meStudent()) { app().innerHTML = `<div class="card" id="stuHonor"><div class="card-h"><h2>🏅 Honor Board <span class="ur">اعزازی بورڈ</span></h2><span class="muted">School top ${Number(db.settings.honorLimit) || 7} · last 30 days</span></div>${honorMiniHTML(db.publicHonor || [])}</div>`; return; }
  const all = allClassKeys();
  const cls = STATE.hCls ?? ''; const per = STATE.hPer || 'week', sub = STATE.hSub || '';
  const [from, to] = per === 'week' ? weekRange(today()) : per === 'month' ? monthRange(today()) : per === 'lastweek' ? weekRange(addDays(today(), -7)) : monthRange(addDays(monthRange(today())[0], -1));
  const limit = Math.max(1, Math.min(20, Number(db.settings.honorLimit) || 7));
  const list = honorList({cls, subject: sub, from, to, limit});
  const medal = ['🥇', '🥈', '🥉']; const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  const row = (h, i) => `<div class="hb-row r${i + 1}"><div class="hb-rank">${i < 3 ? medal[i] : ''}<span>${ord(i + 1)}</span></div>
      <div class="hb-main"><b>${esc(h.name)}</b><div class="muted">${esc(h.cls)} · Roll ${esc(h.roll)} · ${esc(h.subject)} · ${fmtD(h.date)}</div></div>
      <div class="hb-score"><b>${p1(h.pct)}</b><div class="muted">${h.obt}/${h.total}</div></div></div>`;
  app().innerHTML = `<div class="card no-print"><div class="card-h"><h2>🏅 Honor Board <span class="ur">اعزازی بورڈ</span></h2>${isAdmin() ? `<span class="muted">Shows top ${limit} · change in Admin</span>` : ''}</div>
    <div class="filters"><div><label>Class</label><select id="hCls">${opts(all, cls, 'All classes')}</select></div><div><label>Subject</label><select id="hSub">${opts(allSubjects(), sub, 'All subjects')}</select></div>
    <div><label>Period</label><select id="hPer">${[['week', 'This week'], ['month', 'This month'], ['lastweek', 'Last week'], ['lastmonth', 'Last month']].map(([v, l]) => `<option value="${v}" ${per === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="muted">${fmtD(from)} → ${fmtD(to)} · Each student's best test in the period. Ties: earlier date ranks higher.</div> <button class="btn sm sec" onclick="print()">🖨️ Print</button></div>
  <div class="honor">${!list.length ? '<div class="card empty">No results in this period yet.</div>' : `
    <div class="hb-top"><div class="crown">👑</div><div class="hb-badge">1st</div><div class="hb-name">${esc(list[0].name)}</div>
      <div class="hb-meta">${esc(list[0].cls)} · Roll ${esc(list[0].roll)}</div><div class="hb-meta">${esc(list[0].subject)} · ${fmtD(list[0].date)}</div>
      <div class="hb-pct">${p1(list[0].pct)}</div><div class="hb-meta">${list[0].obt} / ${list[0].total} marks</div></div>
    <div class="hb-list">${list.slice(1).map((h, i) => row(h, i + 1)).join('')}</div>`}
    <div class="dev" style="text-align:center;font-size:11px;color:#777;margin-top:10px">${esc(school())} · ${fmtD(from)} – ${fmtD(to)}</div></div>`;
  const set = () => { Object.assign(STATE, {hCls: $('#hCls').value, hSub: $('#hSub').value, hPer: $('#hPer').value}); render(); };
  ['#hCls', '#hSub', '#hPer'].forEach(s => $(s).onchange = set);
}

/* ------------------------------------------------------------------ admin helpers: people & approvals, lists, share/QR */
function peopleHTML() {
  const f = STATE.pFilter || '';
  const ppl = db.users.filter(u => u.role !== 'owner' && (!f || u.role === f || (f === 'pending' && u.status === 'pending')))
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.role.localeCompare(b.role) || String(a.cls || '').localeCompare(String(b.cls || '')) || a.name.localeCompare(b.name));
  const nPend = db.users.filter(u => u.status === 'pending').length;
  return `<div class="card" id="people"><div class="card-h"><h2>People &amp; approvals <span class="ur">منظوری</span></h2><span class="badge ${nPend ? 'warn' : ''}">${nPend} pending</span></div>
    <div class="seg">${[['', 'All'], ['pending', 'Pending'], ['teacher', 'Teachers'], ['student', 'Students']].map(([v, l]) => `<button class="${f === v ? 'on' : ''}" data-pf="${v}">${l}</button>`).join('')}</div>
    <p class="muted">Only you (the owner) can approve. Approved accounts can log in on any phone. Blocking signs the person out everywhere. “Reset password” sets a temporary password (also unlocks a locked account).</p>
    <div id="rpwBox" class="card hidden" style="background:#fffbea"><h3>🔑 Reset password for <span id="rpwWho"></span></h3>
      <div class="row"><div><label>Temporary password</label><input id="rpwPass" autocomplete="off"></div><div><label>&nbsp;</label><label class="chk"><input type="checkbox" id="rpwForce" checked> Must change it at next login</label></div></div>
      <button class="btn" id="rpwSave">Set temporary password</button><button class="btn sec" id="rpwCancel">Cancel</button><p class="muted">Tell the person the temporary password by phone/WhatsApp. They are signed out on all phones.</p></div>
    <div id="emBox" class="card hidden" style="background:#eef6ff"><h3>✉️ Recovery email for <span id="emWho"></span></h3>
      <label>Email (leave empty to remove)</label><input id="emVal" type="email" inputmode="email" autocapitalize="none">
      <button class="btn" id="emSave">Save email</button><button class="btn sec" id="emCancel">Cancel</button><p class="muted">Used to send a 6-digit code on “Forgot password”.</p></div>
    ${ppl.length ? `<div class="tbl-wrap"><table id="pplTbl" class="ptbl"><tr><th>Name</th><th>Role</th><th>Class / roll</th><th>Father's name</th><th>Username</th><th class="num">Tests</th><th>Status</th><th></th></tr>${ppl.map(u => {
      const tn = u.role === 'teacher' ? db.tests.filter(t => t.teacherName === u.name).length : '';
      return `<tr><td class="pname"><b>${esc(dispName(u))}</b></td><td>${u.role === 'teacher' ? '👩‍🏫 teacher' : '🎓 student'}</td><td>${u.role === 'student' ? esc(u.cls) + ' #' + esc(u.roll) : `<span class="muted">${esc((u.classes || []).join(', ') || 'all')}</span>`}</td>
        <td>${u.role === 'student' ? esc(u.father || ((db.students[u.cls] || []).find(x => x.roll === u.roll) || {}).father || '–') : ''}</td><td>${esc(u.username)}${u.mustChange ? ' <span class="badge warn">must change</span>' : ''}${u.email ? `<div class="muted" style="font-size:12px">✉️ ${esc(u.email)}</div>` : ''}</td><td class="num">${tn}</td><td><span class="badge ${u.status === 'pending' ? 'warn' : u.status === 'rejected' ? 'bad' : ''}">${esc(u.status)}</span></td>
        <td style="white-space:nowrap">${u.status !== 'approved' ? `<button class="btn sm" data-appr="${esc(u.username)}" data-st="approved">Approve</button>` : ''}${u.status !== 'rejected' ? `<button class="btn sm red" data-appr="${esc(u.username)}" data-st="rejected">${u.status === 'approved' ? 'Block' : 'Reject'}</button>` : ''}<button class="btn sm sec" data-rpw="${esc(u.username)}">🔑 Reset password</button><button class="btn sm sec" data-em="${esc(u.username)}">✉️ Email</button></td></tr>`; }).join('')}</table></div>`
      : '<div class="muted">Nobody here yet. Teachers and students use “sign-up” on the login screen.</div>'}</div>`;
}
function bindPeople() {
  $$('[data-pf]').forEach(b => b.onclick = () => { STATE.pFilter = b.dataset.pf; render(); });
  $$('[data-appr]').forEach(b => b.onclick = async () => { b.disabled = true; await setUserStatus(b.dataset.appr, b.dataset.st); render(); });
  let who = '';
  $$('[data-rpw]').forEach(b => b.onclick = () => { who = b.dataset.rpw; const u = db.users.find(x => x.username === who); $('#rpwWho').textContent = `${u ? u.name : ''} (${who})`;
    $('#rpwPass').value = 'Temp-' + newPin().slice(0, 4); $('#rpwBox').classList.remove('hidden'); $('#rpwBox').scrollIntoView({block: 'center'}); });
  $('#rpwCancel').onclick = () => $('#rpwBox').classList.add('hidden');
  $$('[data-em]').forEach(b => b.onclick = () => { who = b.dataset.em; const u = db.users.find(x => x.username === who); $('#emWho').textContent = `${u ? u.name : ''} (${who})`;
    $('#emVal').value = (u && u.email) || ''; $('#emBox').classList.remove('hidden'); $('#emBox').scrollIntoView({block: 'center'}); });
  $('#emCancel').onclick = () => $('#emBox').classList.add('hidden');
  $('#emSave').onclick = async () => { try { await adminSetEmail(who, $('#emVal').value); toast(`Recovery email saved for ${who} ✓`); render(); } catch (e) { toast(e.message); } };
  $('#rpwSave').onclick = async () => { try { await adminResetPassword(who, $('#rpwPass').value.trim(), $('#rpwForce').checked); toast(`Temporary password set for ${who} ✓`); render(); } catch (e) { toast(e.message); } };
}
/* ------------------------------------------------------------------ students (roster) – same fields as student sign-up */
function studentsHTML() {
  const all = allClassKeys(), cls = STATE.sCls && all.includes(STATE.sCls) ? STATE.sCls : all[0] || ''; STATE.sCls = cls;
  const list = (db.students[cls] || []).slice().sort((a, b) => (+a.roll || 0) - (+b.roll || 0) || String(a.roll).localeCompare(String(b.roll)));
  const ed = STATE.sEdit ? list.find(x => x.roll === STATE.sEdit) || {} : {};
  return `<div class="card" id="students"><h2>Students <span class="ur">طلبہ</span></h2>
    <div class="row"><div><label>Class</label><select id="sCls">${opts(all, cls)}</select></div><div></div></div>
    <div class="card" style="background:#f6faf8"><h3>${STATE.sEdit ? 'Edit student' : 'Add student'}</h3>
      <div class="row"><div><label>Roll Number *</label><input id="sRoll" inputmode="numeric" value="${esc(ed.roll || '')}"></div><div><label>Class &amp; section *</label><select id="sCls2">${opts(all, cls)}</select></div></div>
      <div class="row"><div><label>First Name *</label><input id="sFirst" value="${esc(ed.first || (ed.name || '').split(' ')[0] || '')}"></div><div><label>Last Name *</label><input id="sLast" value="${esc(ed.last || (ed.name || '').split(' ').slice(1).join(' '))}"></div></div>
      <label>Father's Name *</label><input id="sFather" value="${esc(ed.father || '')}">
      <button class="btn" id="sSave">${STATE.sEdit ? 'Save changes' : '＋ Add student'}</button>${STATE.sEdit ? '<button class="btn sec" id="sCancel">Cancel</button>' : ''}</div>
    ${list.length ? `<div class="tbl-wrap"><table id="stuTbl"><tr><th>Roll</th><th>Name</th><th>Father's name</th><th></th></tr>${list.map(x => `<tr><td>${esc(x.roll)}</td><td>${esc(fullName(x))}</td><td>${esc(x.father || '–')}</td>
      <td style="white-space:nowrap"><button class="btn sm sec" data-sed="${esc(x.roll)}">✏️ Edit</button><button class="btn sm red" data-sdel="${esc(x.roll)}">✕</button></td></tr>`).join('')}</table></div>` : '<div class="muted">No students in this class yet.</div>'}</div>`;
}
function bindStudents() {
  $('#sCls').onchange = e => { STATE.sCls = e.target.value; STATE.sEdit = ''; render(); };
  $$('[data-sed]').forEach(b => b.onclick = () => { STATE.sEdit = b.dataset.sed; render(); setTimeout(() => $('#students').scrollIntoView(), 50); });
  if ($('#sCancel')) $('#sCancel').onclick = () => { STATE.sEdit = ''; render(); };
  $$('[data-sdel]').forEach(b => b.onclick = () => { const cls = STATE.sCls, r = b.dataset.sdel; if (!confirm(`Remove roll ${r} from ${cls}? Old test marks stay.`)) return;
    db.students[cls] = (db.students[cls] || []).filter(x => x.roll !== r); const {grade: g, section} = splitCk(cls); db.deletedStudents.push(`${g}|${section}|${r}`); save(); window.syncNow(false); render(); });
  $('#sSave').onclick = () => {
    const roll = $('#sRoll').value.trim(), cls = $('#sCls2').value, first = $('#sFirst').value.trim(), last = $('#sLast').value.trim(), father = $('#sFather').value.trim();
    if (!roll || !cls || !first || !last || !father) return toast('All fields are required');
    const old = STATE.sEdit, oldCls = STATE.sCls, list = db.students[cls] = db.students[cls] || [];
    if (list.some(x => x.roll === roll && !(cls === oldCls && roll === old))) return toast(`Roll ${roll} already exists in ${cls}`);
    let rec = old ? (db.students[oldCls] || []).find(x => x.roll === old) : null;
    if (rec && (cls !== oldCls || roll !== old)) { db.students[oldCls] = db.students[oldCls].filter(x => x !== rec); const {grade: g, section} = splitCk(oldCls); db.deletedStudents.push(`${g}|${section}|${old}`); }
    if (rec) rec.dirty = true; if (!rec || cls !== oldCls || roll !== old) { rec = {...(rec || {}), isNew: true, addedBy: (rec && rec.addedBy) || (isOwner() ? 'admin' : (me() || {}).name)}; list.push(rec); }
    Object.assign(rec, {roll, first, last, father, name: `${first} ${last}`});
    db.settings.rosterDirty = true; STATE.sEdit = ''; STATE.sCls = cls; save(); toast('Student saved ✓'); window.syncNow(false); render();
  };
}
function listsHTML() {
  return `<div class="card"><h2>Classes, sections &amp; subjects <span class="ur">کلاسیں، سیکشن اور مضامین</span></h2>
    <p class="muted">Add as many as you need (e.g. 9th / Boys, 10th / Girls-B, 1st Year / Science). Synced to every phone.</p>
    <div class="grid2"><div><h3>Classes</h3><div id="lCls">${db.classes.map(c => clsRow(c.grade, c.section)).join('')}</div><button class="btn sec sm" id="lAddCls">＋ Add class</button></div>
    <div><h3>Subjects</h3><p class="muted">Teachers can add subjects; only you can rename or delete them.</p><div id="lSub">${db.subjects.map(subRow).join('')}</div><button class="btn sec sm" id="lAddSub">＋ Add subject</button></div></div>
    <button class="btn" id="lSave">Save classes &amp; subjects</button></div>`;
}
const clsRow = (g, s) => `<div class="lrow"><input class="lg" placeholder="Class e.g. 9th" value="${esc(g)}"><input class="ls" placeholder="Section e.g. Boys" value="${esc(s)}"><button class="btn sm red" data-lrm>✕</button></div>`;
const subRow = s => { const m = s && db.subjectMeta[s];
  return `<div class="lrow"><input class="lsub" placeholder="Subject" value="${esc(s)}" data-orig="${esc(s)}"><input class="lpass" type="number" min="1" max="100" step="0.5" title="Pass % for this subject (empty = school default)" placeholder="pass % (${Number(db.settings.passPercent) || 40})" value="${esc((db.settings.passOverrides || {})[s] || '')}">${m ? `<span class="addedby" title="${esc(fmtD((m.at || '').slice(0, 10)))}">👩‍🏫 added by ${esc(m.by || m.username)}</span>` : ''}<button class="btn sm red" data-lrm>✕</button></div>`; };
function bindLists() {
  const rm = () => $$('[data-lrm]').forEach(b => b.onclick = () => b.parentElement.remove());
  $('#lAddCls').onclick = () => { $('#lCls').insertAdjacentHTML('beforeend', clsRow('', '')); rm(); $('#lCls .lrow:last-child .lg').focus(); };
  $('#lAddSub').onclick = () => { $('#lSub').insertAdjacentHTML('beforeend', subRow('')); rm(); $('#lSub .lrow:last-child .lsub').focus(); };
  rm();
  $('#lSave').onclick = () => {
    const cl = []; $$('#lCls .lrow').forEach(r => { const g = r.querySelector('.lg').value.trim().replace(/\s+/g, ' '), sct = r.querySelector('.ls').value.trim().replace(/\s+/g, '-');
      if (g && sct && !cl.some(c => c.grade === g && c.section === sct)) cl.push({grade: g, section: sct}); });
    const sb = [], ren = {}, po = {};
    $$('#lSub .lsub').forEach(i => { const v = i.value.trim().replace(/\s+/g, ' '), o = i.dataset.orig || ''; if (!v || sb.some(x => x.toLowerCase() === v.toLowerCase())) return;
      sb.push(v); if (o && o !== v) ren[o] = v; const pp = parseFloat(i.parentElement.querySelector('.lpass') ? i.parentElement.querySelector('.lpass').value : ''); if (pp > 0 && pp <= 100) po[v] = pp; });
    if (!cl.length || !sb.length) return toast('Need at least one class and one subject');
    const prevRen = db.settings.subjectRenames || {}; for (const k in prevRen) if (ren[prevRen[k]]) prevRen[k] = ren[prevRen[k]];
    for (const [o, v] of Object.entries(ren)) { renameSubjectLocal(o, v); prevRen[o] = v; } db.settings.subjectRenames = prevRen;
    for (const k of Object.keys(db.subjectMeta)) if (!sb.includes(k)) delete db.subjectMeta[k];
    db.settings.passOverrides = po; db.classes = cl; db.subjects = sb; db.settings.settingsDirty = true; save(); toast(`Saved ${cl.length} classes, ${sb.length} subjects ✓`); window.syncNow(false); render(); };
}
const APP_URL = 'https://albilal-school.github.io/';
function shareHTML() {
  const key = db.settings.reportKey;
  return `<div class="card"><h2>Share the app <span class="ur">ایپ شیئر کریں</span></h2><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
    <img src="qr_app_url.png" alt="QR code" style="width:150px;height:150px;border:1px solid #dde;border-radius:8px;background:#fff">
    <div><p>Print this QR code for the notice board – scanning it opens <b>${APP_URL}</b> (placeholder until GitHub Pages is live).</p>
    <a class="btn sec sm" href="qr_app_url.png" download="albilal_qr.png">⬇ Download QR (PNG)</a>
    ${key ? `<p class="muted">Report key for <code>report.py</code>: <code id="rKey">${esc(key)}</code> (keep private)</p>` : ''}</div></div></div>`;
}

/* ------------------------------------------------------------------ parent lookup: class + full name + roll number (public, no login) */
export function viewLookup() {
  const classes = allClassKeys();
  app().innerHTML = `<div class="login-wrap"><div class="card no-print" id="lkForm"><div style="text-align:center"><img src="${esc(logo())}" class="logo-prev" alt=""><h2 style="margin:6px 0 0">${esc(school())}</h2>
      <div class="muted">Check Result · <span class="ur">نتیجہ دیکھیں</span></div></div>
    <div class="row"><div><label>Class <span class="ur">کلاس</span></label><select id="lkCls">${opts(classes, STATE.lkCls, '— choose class —')}</select></div><div><label>Roll Number <span class="ur">رول نمبر</span></label><input id="lkRoll" inputmode="numeric" value="${esc(STATE.lkRoll || '')}" placeholder="e.g. 12"></div></div>
    <div class="seg" id="lkPer">${[['month', 'This month'], ['lastmonth', 'Last month'], ['all', 'All']].map(([v, l]) => `<button data-per="${v}" class="${(STATE.lkPer || 'all') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <button class="btn" id="lkGo" style="width:100%">🔎 Check Result</button>
    <button class="btn sec sm" onclick="go('home')">← Home</button></div><div id="lkOut"></div></div>`;
  $$('#lkPer button').forEach(b => b.onclick = () => { STATE.lkPer = b.dataset.per; $$('#lkPer button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#lkRoll').onkeydown = e => { if (e.key === 'Enter') $('#lkGo').click(); };
  $('#lkGo').onclick = async () => {
    const cls = $('#lkCls').value, roll = $('#lkRoll').value.trim(); STATE.lkCls = cls; STATE.lkRoll = roll;
    if (!cls || !roll) return toast('Choose the class and enter the roll number');
    const out = $('#lkOut'); out.innerHTML = '<div class="empty">Checking…</div>';
    try {
      let tests;
      if (online() && db.settings.scriptUrl) {
        const {grade: g, section} = splitCk(cls); const r = await getJSON({action: 'lookup', class: g, section, roll});
        if (!r.ok) throw new Error(/not found/i.test(r.error || '') ? 'Result not found' : r.error);
        const groups = {}; r.rows.forEach(x => (groups[x.test_id] = groups[x.test_id] || []).push(x));
        tests = Object.assign(Object.entries(groups).map(([id, rows]) => ({id, date: String(rows[0].date).slice(0, 10), grade: g, section, subject: rows[0].subject, total: Number(rows[0].total), teacherName: '',
          rows: rows.map(x => ({roll, name: x.student_name, obt: x.status === 'leave' || x.obtained === 'A' || x.obtained === '' ? null : Number(x.obtained)}))})), {anon: true, student: r.student ? {name: r.student.name, father: r.student.father_name} : null});
      } else { // offline: only what this phone already has
        const local = (db.students[cls] || []).find(s => s.roll === roll); if (!local) throw new Error('Result not found');
        tests = Object.assign(db.tests.filter(t => testCk(t) === cls && t.rows.some(x => x.roll === roll)).map(t => ({...t, rows: t.rows.filter(x => x.roll === roll)})), {anon: true, student: {name: fullName(local), father: local.father || ''}});
      }
      const per = STATE.lkPer || 'all', now = today();
      const [from, to] = per === 'all' ? ['0000-01-01', '9999-12-31'] : per === 'lastmonth' ? monthRange(addDays(monthRange(now)[0], -1)) : monthRange(now);
      const html = cardHTML(cls, roll, per === 'all' ? 'all' : 'month', from, to, tests);
      if (!html) throw new Error(tests.length ? 'No results in this period – try “All”' : 'Result not found');
      out.innerHTML = `<div id="printArea">${html}</div><div class="no-print lk-acts" style="text-align:center"><button class="btn" id="lkPrint">🖨️ Print</button><button class="btn sec" id="lkDl">⬇ Download</button></div>`;
      $('#lkPrint').onclick = () => window.print();
      $('#lkDl').onclick = async () => { let css = ''; try { css = await (await fetch('styles.css')).text(); } catch (e) {}
        download(`result-${cls.replace(/\s+/g, '_')}-roll-${roll}.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Result – ${esc(cls)} roll ${esc(roll)}</title><style>${css}</style></head><body style="padding:12px">${$('#printArea').innerHTML}</body></html>`, 'text/html'); };
    } catch (e) { out.innerHTML = `<div class="card empty" id="lkNotFound">❌ ${esc(e.message)}</div>`; }
  };
}

function mostLeaves(tests) {
  const by = {}; tests.forEach(t => t.rows.forEach(r => { if (r.obt != null) return; const k = testCk(t) + '|' + r.roll; const o = by[k] = by[k] || {cls: testCk(t), roll: r.roll, name: r.name, n: 0, subj: {}}; o.n++; o.subj[t.subject] = (o.subj[t.subject] || 0) + 1; }));
  const list = Object.values(by).sort((a, b) => b.n - a.n).slice(0, 10);
  if (!list.length) return '<div class="muted">No leaves in this period 🎉</div>';
  return `<div class="tbl-wrap"><table><tr><th>Class</th><th>Roll</th><th>Name</th><th class="num">Leaves</th><th>By subject</th></tr>${list.map(o => `<tr><td>${esc(o.cls)}</td><td>${esc(o.roll)}</td><td>${esc(o.name)}</td><td class="num"><b>${o.n}</b></td><td class="muted">${esc(Object.entries(o.subj).map(([k, v]) => k + ' ' + v).join(', '))}</td></tr>`).join('')}</table></div>`;
}
