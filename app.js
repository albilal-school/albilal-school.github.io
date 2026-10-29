/* Albilal School System – offline-first test record PWA
   Data lives in localStorage on each device; optional sync to a Google Sheet via Apps Script.
   Developed by Toshan Rafiq */
// ES module (strict by default)

/* ------------------------------------------------------------------ utils */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fmtD = s => { if (!s) return ''; const d = parseD(s); return d.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}); };
const pct = (o, t) => t > 0 ? (o / t) * 100 : null;
const p1 = v => v == null || isNaN(v) ? '–' : (Math.round(v * 10) / 10).toFixed(1) + '%';
const r1 = v => Math.round(v * 10) / 10;
function grade(p) {
  if (p == null) return '–';
  return p >= 80 ? 'A+' : p >= 70 ? 'A' : p >= 60 ? 'B' : p >= 50 ? 'C' : p >= 40 ? 'D' : p >= 33 ? 'E' : 'F';
}
/* pass rule: pass_percent (default 40) per subject, optional per-subject override; leave = neither pass nor fail */
const passMark = subj => { const st = (db && db.settings) || {}, o = (st.passOverrides || {})[subj]; return Number(o) > 0 ? Number(o) : Number(st.passPercent) > 0 ? Number(st.passPercent) : 40; };
const isPass = (p, subj) => p != null && !isNaN(p) && p + 1e-9 >= passMark(subj);
const passBadge = (p, subj) => p == null || isNaN(p) ? '' : isPass(p, subj) ? '<span class="badge pf pass">Pass</span>' : '<span class="badge pf fail">Fail</span>';
function gradeBadge(p, subj) { const g = grade(p); if (g === '–') return '–'; const cls = g === 'F' ? 'bad' : (g === 'E' || g === 'D') ? 'warn' : ''; return `<span class="badge ${cls}">${g}</span> ${passBadge(p, subj)}`; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
function weekRange(s) { const d = parseD(s); const dow = (d.getDay() + 6) % 7; const start = addDays(s, -dow); return [start, addDays(start, 6)]; }
function monthRange(s) { const d = parseD(s); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);

/* SHA-256 (pure JS so it also works from file:// and old phones) */
function sha256(ascii) {
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  const bytes = new TextEncoder().encode(ascii); const K = [], H = []; let primeCounter = 0; const isComposite = {};
  for (let c = 2; primeCounter < 64; c++) { if (!isComposite[c]) { for (let i = 0; i < 313; i += c) isComposite[i] = c;
      H[primeCounter] = (Math.pow(c, .5) * 4294967296) | 0; K[primeCounter++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; } }
  const hash = H.slice(0, 8); const words = []; const l = bytes.length * 8;
  const m = [...bytes, 0x80]; while (m.length % 64 !== 56) m.push(0);
  for (let i = 7; i >= 0; i--) m.push(i >= 4 ? 0 : (l >>> (i * 8)) & 255);
  for (let i = 0; i < m.length; i += 4) words.push((m[i] << 24) | (m[i + 1] << 16) | (m[i + 2] << 8) | m[i + 3]);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16); const old = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2]; const a = hash[0], e = hash[4];
      const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + K[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash.unshift((t1 + t2) | 0); hash[4] = (hash[4] + t1) | 0; hash.pop();
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
  }
  return hash.map(h => (h >>> 0).toString(16).padStart(8, '0')).join('');
}
function hashPw(pw, salt) { let h = salt + ':' + pw; for (let i = 0; i < 2000; i++) h = sha256(salt + h); return h; }
const newSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');

/* ------------------------------------------------------------------ storage */
const DB_KEY = 'albilal_db_v2', SES_KEY = 'albilal_session', TOKEN_KEY = 'albilal_token';
const DEFAULT_NAME = 'Albilal School System';
// OPTIONAL: paste your Apps Script Web App URL here before publishing, so every phone syncs without typing it.
// (It can also be given once as a link: https://<you>.github.io/albilal/?sync=<WEB_APP_URL>)
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyA7VQFk32167btzweqNrVnIuDhzLVXo8Dq3uk9PS2QzomXOW6w6lUW2Ffeka4IDWvO/exec';
// Subjects offered per grade. A grade not listed here shows every subject (9th / 10th keep the full list).
const BASE_SUBJECTS = ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Islamiat', 'Pakistan Studies', 'Tarjama-tul-Quran'];
const CLASS_SUBJECTS = {'8th': ['Urdu', 'English', 'Islamiat', 'Mathematics', 'Science']};
function freshDB() {
  return {
    classes: [{grade: '8th', section: 'Boys'}, {grade: '8th', section: 'Girls'}, {grade: '9th', section: 'Boys'}, {grade: '9th', section: 'Girls'}, {grade: '10th', section: 'Boys'}, {grade: '10th', section: 'Girls'}],
    subjects: ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Islamiat', 'Pakistan Studies', 'Tarjama-tul-Quran', 'Science'],
    classSubjects: JSON.parse(JSON.stringify(CLASS_SUBJECTS)),
    users: [], students: {}, tests: [], deleted: [], notes: [], deletedNotes: [], chat: {}, chatQueue: [], announcements: [], deletedAnn: [], approvalQueue: [], deletedStudents: [], pendingSubjects: [], subjectMeta: {}, publicHonor: [],
    settings: {schoolName: DEFAULT_NAME, logo: '', scriptUrl: DEFAULT_SCRIPT_URL, settingsDirty: false, rosterDirty: false, lastSync: '', lastPull: '', notesSeen: {}, annSeen: {}, honorLimit: 7,
      teachersCanAnnounce: 'no', passPercent: 40, passOverrides: {}, serverHasOwner: false, reportKey: '', contact: {...DEFAULT_CONTACT}}
  };
}
let db;
function load() { try { db = JSON.parse(localStorage.getItem(DB_KEY)) || freshDB(); } catch (e) { db = freshDB(); }
  const f = freshDB(); for (const k in f) if (db[k] === undefined) db[k] = f[k]; for (const k in f.settings) if (db.settings[k] === undefined) db.settings[k] = f.settings[k];
  addClass8(); }
/** one-time upgrade of phones that already have data: add Class 8 (Boys/Girls) + its subjects without touching anything else.
    Runs once per device (flag), so if the owner later removes Class 8 in Admin it is not added back. */
function addClass8() {
  if (db.settings.class8Added) return;
  const add = [{grade: '8th', section: 'Boys'}, {grade: '8th', section: 'Girls'}].filter(c => !db.classes.some(x => ck(x) === ck(c)));
  db.classes = [...add, ...db.classes];
  for (const s of CLASS_SUBJECTS['8th']) if (!db.subjects.some(x => x.toLowerCase() === s.toLowerCase())) db.subjects.push(s);
  db.classSubjects = {...CLASS_SUBJECTS, ...(db.classSubjects || {})};
  db.settings.class8Added = true;
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(db)); updateStatus(); }
const ck = c => `${c.grade} ${c.section}`;
const splitCk = k => { const i = k.lastIndexOf(' '); return {grade: k.slice(0, i), section: k.slice(i + 1)}; };
const testCk = t => `${t.grade} ${t.section}`;
const sessionUser = () => db.users.find(u => u.id === localStorage.getItem(SES_KEY));
const me = () => { const u = sessionUser(); return u && u.role !== 'student' ? u : undefined; };       // owner or teacher
const meStudent = () => { const u = sessionUser(); return u && u.role === 'student' ? u : undefined; };
const isOwner = () => (sessionUser() || {}).role === 'owner';
const isAdmin = isOwner; // the owner is the school admin
const approved = u => u && (u.role === 'owner' || u.status === 'approved');
const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const hasOwner = () => db.users.some(u => u.role === 'owner') || db.settings.serverHasOwner;
const canEditTest = t => isAdmin() || myClasses().includes(testCk(t)); // server enforces the same rule (class assignment)
const myClasses = () => { const m = me(); const all = db.classes.map(ck); return m && m.classes && m.classes.length ? all.filter(c => m.classes.includes(c)) : all; };
const mySubjects = () => { const m = me(); return m && m.subjects && m.subjects.length ? db.subjects.filter(s => m.subjects.includes(s)) : db.subjects; };
/** subjects for a class key like "8th Boys": the grade's own list (if it has one) + subjects added for that grade; else the given list */
const subjectsForClass = (cls, list = db.subjects) => { const g = cls ? splitCk(cls).grade : ''; const m = (db.classSubjects || {})[g];
  if (!m || !m.length) { const only = new Set(Object.values(db.classSubjects || {}).flat().filter(x => !BASE_SUBJECTS.includes(x))); return list.filter(s => !only.has(s)); } // e.g. Science is Class 8 only
  const own = list.filter(s => m.includes(s)); return own.length ? own : m.slice(); };
const allClassKeys = () => [...new Set([...db.classes.map(ck), ...db.tests.map(testCk)])];
const allSubjects = () => [...new Set([...db.subjects, ...db.tests.map(t => t.subject)])];
const newPin = () => String(100000 + Math.floor(Math.random() * 900000)); // only used for temporary passwords
const DEFAULT_CONTACT = {whatsapp_name: 'TOSHAN RAFIQ', whatsapp: '03012208818', phone: '', email: '', address: ''};

/* ------------------------------------------------------------------ branding */
function applyBranding() {
  const name = db.settings.schoolName || DEFAULT_NAME; const logo = db.settings.logo || 'icons/icon-192.png';
  $('#brandName').textContent = name; $('#brandLogo').src = logo; document.title = name; $('#favicon').href = logo;
  // live manifest so a fresh install picks up the school name (installed apps keep the name they were installed with)
  try {
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    const man = {name, short_name: name.length > 14 ? name.split(' ')[0] : name, start_url: base + 'index.html', scope: base, display: 'standalone',
      background_color: '#f4f7f5', theme_color: '#0f6b4f',
      icons: [192, 512].map(s => ({src: base + `icons/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any'}))
        .concat([192, 512].map(s => ({src: base + `icons/icon-${s}-maskable.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'maskable'})))};
    if (location.protocol.startsWith('http') && name !== DEFAULT_NAME) $('#manifestLink').href = URL.createObjectURL(new Blob([JSON.stringify(man)], {type: 'application/manifest+json'}));
  } catch (e) {}
}

/* ------------------------------------------------------------------ sync (Google Apps Script) */
function pendingCount() {
  return db.tests.filter(t => !t.synced).length + db.deleted.length + (db.settings.settingsDirty ? 1 : 0) + (db.settings.rosterDirty ? 1 : 0) + db.notes.filter(n => !n.synced).length +
    db.deletedNotes.length + db.users.filter(u => u.regQueued || u.ownerQueued || u.profileDirty).length + db.approvalQueue.length + db.chatQueue.length +
    db.announcements.filter(a => !a.synced).length + db.deletedAnn.length + db.deletedStudents.length + db.pendingSubjects.length;
}
function updateStatus() {
  const on = navigator.onLine; const n = $('#netStatus'); if (!n || !db) return;
  n.textContent = on ? '● Online' : '● Offline'; n.classList.toggle('off', !on);
  const p = pendingCount();
  $('#syncStatus').textContent = !db.settings.scriptUrl ? 'Local mode' : p ? `⟳ ${p} to sync` : '✓ Synced';
  const m = sessionUser(); $('#whoami').textContent = m ? whoText(m) : '';
  updateBell();
}
function flatRows(t) {
  return t.rows.map(r => ({date: t.date, teacher: t.teacherName, class: t.grade, section: t.section, subject: t.subject,
    roll_no: r.roll, student_name: r.name, obtained: r.obt == null ? '' : r.obt, total: t.total, status: r.obt == null ? 'leave' : 'present', test_id: t.id}));
}
// text/plain avoids a CORS pre-flight; Apps Script answers with JSON. The session token is added automatically.
async function postJSON(url, body) {
  const res = await fetch(url, {method: 'POST', body: JSON.stringify({token: getToken(), ...body}), headers: {'Content-Type': 'text/plain;charset=utf-8'}, redirect: 'follow'});
  const j = await res.json(); if (j && j.auth) onAuthError(j.error); return j;
}
async function getJSON(params) {
  const url = db.settings.scriptUrl; const q = new URLSearchParams({token: getToken(), ...params}).toString();
  const j = await (await fetch(url + (url.includes('?') ? '&' : '?') + q)).json(); if (j && j.auth && params.action !== 'public') onAuthError(j.error); return j;
}
function onAuthError(msg) { if (!getToken()) return; localStorage.removeItem(TOKEN_KEY); toast('Please log in again: ' + msg.replace(/^auth:\s*/, '')); }
const online = () => navigator.onLine && !!db.settings.scriptUrl;
let syncing = false;
async function syncNow(manual) {
  if (!db.settings.scriptUrl) { if (manual) toast('Local mode – add the Google Script URL in Settings to sync'); return; }
  if (!navigator.onLine) { if (manual) toast('Offline – everything is queued and will sync later'); return; }
  if (syncing) return; syncing = true; const url = db.settings.scriptUrl;
  try {
    // 1) queued owner setup / sign-ups (no token needed)
    for (const u of db.users.filter(x => x.ownerQueued)) { const r = await postJSON(url, {action: 'owner_setup', username: u.username, name: u.name, salt: u.salt, hash: u.hash, sec_q: u.secQ || '', sec_a: u.secA || '', email: u.email || DEFAULT_OWNER_EMAIL});
      if (r.ok) { u.ownerQueued = false; if (u.id === localStorage.getItem(SES_KEY)) localStorage.setItem(TOKEN_KEY, r.token); } else { u.ownerQueued = false; toast('Owner setup: ' + r.error); } save(); }
    for (const u of db.users.filter(x => x.regQueued)) { const r = await postJSON(url, regPayload(u));
      u.regQueued = false; if (!r.ok) toast('Sign-up: ' + r.error); save(); }
    const me0 = sessionUser();
    if (!getToken() && me0 && me0.hash && !approved(me0)) await tryServerLogin(me0.username, me0.hash); // pending users: check if approved now
    if (!getToken()) { if (manual) toast('Log in while online to sync'); return; }
    const u = sessionUser(); if (!u) return;
    // 2) owner approvals
    for (const q of db.approvalQueue.slice()) { const r = await postJSON(url, {action: 'approve', username: q.username, status: q.status}); if (r.ok || !r.auth) db.approvalQueue.shift(); if (!r.ok) toast(r.error); }
    if (u.profileDirty) { const r = await postJSON(url, {action: 'profile', name: u.name, phone: u.phone || '', email: u.email || '', subjects: (u.subjects || []).join('; '), classes: (u.classes || []).join('; ')}); if (r.ok) u.profileDirty = false; }
    // 3a) subjects a teacher added (queued while offline) – before the marks that use them
    if (u.role !== 'student') for (const nm of db.pendingSubjects.slice()) {
      const r = await postJSON(url, {action: 'add_subject', name: nm, base: db.subjects});
      if (!r.ok && /unknown action/i.test(r.error || '')) break; // server not updated yet – keep it queued
      db.pendingSubjects = db.pendingSubjects.filter(x => x !== nm);
      if (r.ok) { if (r.name && r.name !== nm) renameSubjectLocal(nm, r.name); applySubjectLists(r.subjects_json, r.subject_meta_json); } else toast(r.error); save();
    }
    // 3) marks, rosters, deletions, school settings
    if (u.role !== 'student') {
      const pend = db.tests.filter(t => !t.synced);
      const body = {action: 'push', rows: pend.flatMap(flatRows), test_ids: pend.map(t => t.id), deleted: db.deleted.slice(), deleted_notes: db.deletedNotes.slice()};
      if (db.settings.rosterDirty) body.students = Object.entries(db.students).flatMap(([k, list]) => list.filter(s => s.isNew || s.dirty).map(s => { const n = splitName(s); return {class: splitCk(k).grade, section: splitCk(k).section, roll_no: s.roll, first_name: n.first, last_name: n.last, father_name: s.father || '', student_name: n.full, new: s.isNew ? 'yes' : ''}; }));
      const delS = db.deletedStudents.slice(); if (delS.length) body.deleted_students = delS.map(k => { const [c, sc, r] = k.split('|'); return {class: c, section: sc, roll_no: r}; });
      if (db.settings.settingsDirty && u.role === 'owner') body.settings = {school_name: db.settings.schoolName, logo: db.settings.logo, honor_limit: db.settings.honorLimit,
        classes_json: JSON.stringify(db.classes), subjects_json: JSON.stringify(db.subjects), teachers_can_announce: db.settings.teachersCanAnnounce, contact_json: JSON.stringify(db.settings.contact || {}),
        pass_percent: db.settings.passPercent || 40, pass_overrides_json: JSON.stringify(db.settings.passOverrides || {}),
        subjects_base: db.settings.lastPull || '', subject_renames: db.settings.subjectRenames || {}};
      const res = await postJSON(url, body);
      if (!res || res.ok === false) throw new Error(res && res.error || 'Script error');
      if (res.forbidden && res.forbidden.length) toast(`⛔ Not allowed for ${res.forbidden.length} test(s) – not your class. Restored from the school copy.`);
      pend.forEach(t => t.synced = true); db.deleted = db.deleted.filter(id => !body.deleted.includes(id)); db.deletedNotes = db.deletedNotes.filter(id => !body.deleted_notes.includes(id));
      if (body.settings) { db.settings.settingsDirty = false; db.settings.subjectRenames = {}; } if (body.students) { db.settings.rosterDirty = false; Object.values(db.students).forEach(l => l.forEach(x => { delete x.isNew; delete x.dirty; })); if (res.forbidden_students) toast('Not your class – not saved: ' + res.forbidden_students.join(', ')); } if (body.deleted_students) db.deletedStudents = db.deletedStudents.filter(x => !delS.includes(x)); save();
      if (db.notes.some(n => !n.synced)) await (await loadMod('notes')).uploadPendingNotes(url);
    }
    if (db.announcements.some(a => !a.synced) || db.deletedAnn.length) await (await loadMod('ann')).uploadPendingAnn(url);
    if (db.chatQueue.length) await (await loadMod('chat')).flushChat();
    db.settings.lastSync = new Date().toISOString(); save();
    await pullNow(false);
    if (manual) toast('Synced ✓');
  } catch (e) { console.warn('sync failed', e); if (manual) toast('Sync failed: ' + e.message); }
  finally { syncing = false; updateStatus(); }
}
async function pullNow(manual) {
  if (!online() || !getToken()) { if (manual) toast(getToken() ? 'Offline' : 'Log in while online first'); return; }
  try {
    const res = await getJSON({action: 'pull'});
    if (!res.ok) throw new Error(res.error || 'pull failed');
    applyServerSettings(res.settings || {});
    const u = sessionUser();
    if (res.me && u) { u.status = res.me.status; if (!u.profileDirty) Object.assign(u, userFromServer(res.me, u)); }
    mergeRemoteRows(res.rows || [], true);
    (res.users || []).forEach(su => { const ex = db.users.find(x => x.username === su.username); if (ex) { if (!ex.profileDirty) Object.assign(ex, userFromServer(su, ex)); } else db.users.push({id: 'r_' + su.username, remote: true, ...userFromServer(su, {})}); });
    if (res.users) { const names = new Set(res.users.map(x => x.username)); db.users = db.users.filter(x => !x.remote || names.has(x.username)); }
    if (res.students) res.students.forEach(s => { const key = `${s.class} ${s.section}`; const list = db.students[key] = db.students[key] || [];
      const o = {name: s.student_name, first: s.first_name || '', last: s.last_name || '', father: s.father_name || '', addedBy: s.added_by || ''};
      const ex = list.find(x => x.roll === String(s.roll_no)); if (ex) { if (!ex.dirty && !ex.isNew) for (const k in o) if (o[k]) ex[k] = o[k]; } else list.push({roll: String(s.roll_no), ...o}); });
    if (res.deleted_students) res.deleted_students.forEach(k => { const i = k.lastIndexOf('|'), c = k.slice(0, i), r = k.slice(i + 1); if (db.students[c]) db.students[c] = db.students[c].filter(x => x.roll !== r || x.isNew); });
    if (res.notes) { const remoteIds = new Set(res.notes.map(n => n.note_id));
      db.notes = db.notes.filter(n => !n.synced || remoteIds.has(n.id));
      res.notes.forEach(rn => { if (db.deletedNotes.includes(rn.note_id) || db.notes.some(n => n.id === rn.note_id)) return;
        db.notes.push({id: rn.note_id, cls: `${rn.class} ${rn.section}`, subject: rn.subject, title: rn.title, desc: rn.description, kind: rn.kind, text: rn.text,
          fileName: rn.file_name, mime: rn.mime, size: Number(rn.size) || 0, fileId: rn.file_id, url: rn.file_url, teacherName: rn.teacher, createdAt: rn.created_at, synced: true}); }); }
    if (res.announcements) mergeAnn(res.announcements);
    if (res.my_stats) db.myStats = res.my_stats; if (Array.isArray(res.honor)) db.publicHonor = res.honor;
    if (res.deleted_rows) db.deletedRows = res.deleted_rows; if (res.audit) db.audit = res.audit;
    db.settings.lastPull = new Date().toISOString(); save(); applyBranding();
    if (manual) { toast('Downloaded latest data ✓'); render(); }
  } catch (e) { console.warn('pull failed', e); if (manual) toast('Download failed: ' + e.message); }
}
function userFromServer(s, ex) {
  const sp = v => String(v || '').split(';').map(x => x.trim()).filter(Boolean);
  return {username: s.username, name: s.name, role: s.role, status: s.status, phone: s.phone || '', subjects: sp(s.subjects), classes: sp(s.classes),
    cls: s.class ? `${s.class} ${s.section}` : (ex.cls || ''), roll: s.roll_no || ex.roll || '', first: s.first_name || ex.first || '', last: s.last_name || ex.last || '', father: s.father_name || ex.father || '', email: s.email !== undefined ? s.email : (ex.email || ''), createdAt: s.created_at || ex.createdAt || '', lastSeen: s.last_seen || ex.lastSeen || ''};
}
function applySubjectLists(sj, mj) { // server list + anything still queued on this phone
  try { if (sj) { const list = JSON.parse(sj); if (Array.isArray(list) && list.length) db.subjects = list; } } catch (e) {}
  try { if (mj) db.subjectMeta = JSON.parse(mj) || {}; } catch (e) {}
  for (const n of db.pendingSubjects) if (!db.subjects.some(x => x.toLowerCase() === n.toLowerCase())) db.subjects.push(n);
}
function renameSubjectLocal(from, to) {
  db.tests.forEach(t => { if (t.subject === from) { t.subject = to; t.synced = false; } });
  db.users.forEach(u => { if (u.subjects) u.subjects = [...new Set(u.subjects.map(x => x === from ? to : x))]; });
  if (db.subjectMeta[from]) { db.subjectMeta[to] = db.subjectMeta[from]; delete db.subjectMeta[from]; }
  db.subjects = [...new Set(db.subjects.map(x => x === from ? to : x))];
}
/** An approved teacher (or the owner) adds a new subject: shared list, auto-assigned to them, usable at once, queued offline. */
/** A teacher (or the owner) adds a student to a class roster: usable at once for marks, synced (queued offline). Roll is unique per class. */
function addRosterStudent(f) {
  const m = me(); if (!m || !approved(m)) throw new Error('Only approved teachers can add students');
  const roll = String(f.roll || '').trim(), first = String(f.first || '').trim(), last = String(f.last || '').trim(), father = String(f.father || '').trim(), cls = f.cls;
  if (!roll || !first || !last || !father || !cls) throw new Error('Roll, first name, last name, father\'s name and class are required');
  if (!/^[A-Za-z0-9-]{1,10}$/.test(roll)) throw new Error('Roll number: letters/numbers only');
  if (!myClasses().includes(cls)) throw new Error('You can only add students to your own classes');
  const list = db.students[cls] = db.students[cls] || [];
  if (list.some(x => x.roll === roll) || db.users.some(u => u.role === 'student' && u.cls === cls && u.roll === roll && u.status !== 'rejected'))
    throw new Error(`Roll ${roll} already exists in ${cls}`);
  list.push({roll, first, last, father, name: `${first} ${last}`, addedBy: m.role === 'owner' ? 'admin' : m.name, isNew: true});
  db.settings.rosterDirty = true; save(); syncNow(false).catch(() => {});
  return {roll, cls};
}
function addSubject(raw) {
  const m = me(); if (!m || !approved(m)) throw new Error('Only approved teachers can add subjects');
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 40) throw new Error('Subject name: 1–40 characters');
  if (/[;|<>]/.test(name)) throw new Error('Subject name cannot contain ; | < >');
  const dup = allSubjects().find(x => x.toLowerCase() === name.toLowerCase());
  const final = dup || name;
  if (!dup) { db.subjects.push(name); db.subjectMeta[name] = {by: m.name, username: m.username, at: new Date().toISOString()};
    if (m.role === 'owner') db.settings.settingsDirty = true; else db.pendingSubjects.push(name); }
  else if (!db.subjects.includes(dup)) db.subjects.push(dup);
  if (m.role !== 'owner' && m.subjects && m.subjects.length && !m.subjects.includes(final)) m.subjects.push(final);
  save(); if (!dup) syncNow(false).catch(() => {});
  return {name: final, existed: !!dup};
}
function applyServerSettings(s) {
  if (db.settings.settingsDirty) return;
  if (s.school_name) db.settings.schoolName = s.school_name;
  if (s.logo !== undefined) db.settings.logo = s.logo || '';
  if (Number(s.honor_limit) > 0) db.settings.honorLimit = Number(s.honor_limit);
  if (s.teachers_can_announce) db.settings.teachersCanAnnounce = s.teachers_can_announce;
  if (Number(s.pass_percent) > 0) db.settings.passPercent = Number(s.pass_percent);
  try { if (s.pass_overrides_json) db.settings.passOverrides = JSON.parse(s.pass_overrides_json) || {}; } catch (e) {}
  try { if (s.classes_json) db.classes = JSON.parse(s.classes_json); } catch (e) {}
  applySubjectLists(s.subjects_json, s.subject_meta_json);
  if (s.report_key) db.settings.reportKey = s.report_key;
  try { if (s.contact_json) db.settings.contact = {...DEFAULT_CONTACT, ...JSON.parse(s.contact_json)}; } catch (e) {}
}
function mergeAnn(list, onlyPublic) {
  const ids = new Set(list.map(a => a.ann_id));
  db.announcements = db.announcements.filter(a => !a.synced || ids.has(a.id) || (onlyPublic && a.audience !== 'all'));
  list.forEach(r => { if (db.deletedAnn.includes(r.ann_id)) return; const ex = db.announcements.find(a => a.id === r.ann_id); if (ex && !ex.synced) return;
    const a = {id: r.ann_id, title: r.title, message: r.message, audience: r.audience || 'all', pinned: r.pinned === 'yes', expires: r.expires || '', fileId: r.file_id, url: r.file_url,
      fileName: r.file_name, mime: r.mime, author: r.author, createdAt: r.created_at, updatedAt: r.updated_at, synced: true};
    if (ex) Object.assign(ex, a); else db.announcements.push(a); });
}
function mergeRemoteRows(rows, authoritative) {
  const groups = {};
  rows.forEach(r => { const id = r.test_id || [r.date, r.class, r.section, r.subject, r.teacher].join('|'); (groups[id] = groups[id] || []).push(r); });
  if (authoritative) db.tests = db.tests.filter(t => !t.synced || groups[t.id]); // deleted on another device
  for (const id in groups) {
    if (db.deleted.includes(id)) continue;
    const local = db.tests.find(t => t.id === id); if (local && !local.synced) continue; // local edits win until pushed
    const g = groups[id], f = g[0];
    const t = {id, date: normDate(f.date), grade: String(f.class), section: String(f.section), subject: String(f.subject), total: Number(f.total),
      teacherName: String(f.teacher), teacherId: '', synced: true, updatedAt: String(f.updated_at || ''), updatedBy: String(f.updated_by || ''),
      rows: g.map(r => ({roll: String(r.roll_no), name: String(r.student_name), obt: isLeave(r) ? null : Number(r.obtained)}))};
    t.rows.forEach(x => x.status = x.obt == null ? 'leave' : 'present');
    if (local) Object.assign(local, t, {teacherId: local.teacherId}); else db.tests.push(t);
    if (!meStudent()) rememberRoster(testCk(t), t.rows, true);
  }
}
function isLeave(r) { return String(r.status || '').toLowerCase() === 'leave' || r.obtained == null || /^(a|l|abs|absent|leave)?$/i.test(String(r.obtained).trim()); }
function normDate(v) { const s = String(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d) ? s : ymd(d); }
function rememberRoster(key, rows, fromServer) {
  const roster = db.students[key] || [];
  rows.forEach(r => { if (!r.roll && !r.name) return; const ex = roster.find(s => s.roll === r.roll);
    if (ex) { const before = JSON.stringify([ex.father, ex.first, ex.last, ex.name]); if (r.father) ex.father = r.father; if (r.first) { ex.first = r.first; ex.last = r.last || ''; ex.name = fullName(r); } else if (r.name && r.name !== ex.name && !(ex.first && fullName(ex) === r.name)) { ex.name = r.name; const n = splitName({name: r.name}); ex.first = n.first; ex.last = n.last; } if (!fromServer && JSON.stringify([ex.father, ex.first, ex.last, ex.name]) !== before) { ex.dirty = true; db.settings.rosterDirty = true; } } else { const n = splitName(r); roster.push({roll: r.roll, name: n.full, first: n.first, last: n.last, father: r.father || '', ...(fromServer ? {} : {dirty: true})}); if (!fromServer) db.settings.rosterDirty = true; } });
  roster.sort((a, b) => (parseFloat(a.roll) || 0) - (parseFloat(b.roll) || 0) || String(a.roll).localeCompare(String(b.roll)));
  db.students[key] = roster;
}
window.addEventListener('online', () => { updateStatus(); syncNow(false); });
window.addEventListener('offline', updateStatus);
setInterval(() => { if (pendingCount() && navigator.onLine) syncNow(false); }, 60000);

/* ------------------------------------------------------------------ auth (owner setup, sign-up, login, approvals, password) */
async function tryServerLogin(username, hash) {
  const r = await postJSON(db.settings.scriptUrl, {action: 'login', username, hash});
  const u = db.users.find(x => x.username === username);
  if (r.ok) { localStorage.setItem(TOKEN_KEY, r.token); if (u) Object.assign(u, userFromServer(r.user, u), {remote: false}); save(); }
  else if (r.status && u) { u.status = r.status; save(); }
  return r;
}
const SEC_QS = ['Favourite teacher?', 'Birth city?', 'First school?', "Mother's first name?", 'Best friend in class 5?', 'Favourite food?'];
const normAns = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
const ansHash = v => sha256('ans:' + normAns(v)); // hashed on the phone; the server hashes again with the username
const splitName = o => { if (o.first || o.last) return {first: o.first || '', last: o.last || '', full: fullName(o)}; const p = String(o.name || '').trim().split(/\s+/); return {first: p[0] || '', last: p.slice(1).join(' '), full: p.join(' ')}; };
const fullName = (o = {}) => ((o.first || '') + ' ' + (o.last || '')).replace(/\s+/g, ' ').trim() || o.name || '';
function findLocalByIdent(ident, cls) {
  const id = ident.trim().toLowerCase();
  return db.users.find(x => x.username === id && x.hash) ||
    db.users.find(x => x.role === 'student' && x.hash && String(x.roll).toLowerCase() === id && (!cls || x.cls === cls));
}
// identifier = username OR roll number; cls only needed when that roll number exists in more than one class
async function login(ident, pass, cls) {
  ident = ident.trim().toLowerCase(); if (!ident || !pass) throw new Error('Enter username / roll number and password');
  let local = findLocalByIdent(ident, cls);
  if (online()) {
    try {
      const where = cls ? {class: splitCk(cls).grade, section: splitCk(cls).section} : {};
      const s = await postJSON(db.settings.scriptUrl, {action: 'salt', username: ident, ...where});
      if (!s.ok) throw Object.assign(new Error(s.error), {server: true});
      const username = s.username, hash = hashPw(pass, s.salt);
      local = db.users.find(x => x.username === username);
      if (!local) { local = {id: uid(), username, role: 'teacher'}; db.users.push(local); }
      const r = await postJSON(db.settings.scriptUrl, {action: 'login', username, hash});
      if (!r.ok && !r.status) throw Object.assign(new Error(r.error), {server: true});
      Object.assign(local, {salt: s.salt, hash, remote: false});
      if (r.ok) { localStorage.setItem(TOKEN_KEY, r.token); Object.assign(local, userFromServer(r.user, local), {mustChange: !!r.must_change}); }
      else Object.assign(local, {status: r.status, role: r.role || local.role, name: r.name || local.name});
      localStorage.setItem(SES_KEY, local.id); save(); return local;
    } catch (e) { if (e.server) throw e; console.warn('server login failed, trying offline', e); }
  }
  if (!local || local.hash !== hashPw(pass, local.salt)) throw new Error('Wrong username / roll number or password');
  localStorage.setItem(SES_KEY, local.id); return local;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, DEFAULT_OWNER_EMAIL = 'jonaskhan05@gmail.com';
const cleanEmail = (v, required) => { v = String(v || '').trim().toLowerCase(); if (!v && !required) return ''; if (!EMAIL_RE.test(v)) throw new Error('Enter a valid recovery email'); return v; };
async function ownerSetup(name, username, pass, secQ, secA, email) {
  username = username.trim().toLowerCase(); email = cleanEmail(email, true); const salt = newSalt(), hash = hashPw(pass, salt);
  const u = {id: uid(), name, username, role: 'owner', status: 'approved', salt, hash, subjects: [], classes: [], secQ: secQ || '', secA: secA ? ansHash(secA) : '', email, created: new Date().toISOString()};
  if (online()) { const r = await postJSON(db.settings.scriptUrl, {action: 'owner_setup', username, name, salt, hash, sec_q: u.secQ, sec_a: u.secA, email}); if (!r.ok) throw new Error(r.error); localStorage.setItem(TOKEN_KEY, r.token); }
  else if (db.settings.scriptUrl) u.ownerQueued = true;
  db.users.push(u); localStorage.setItem(SES_KEY, u.id); save(); return u;
}
function regPayload(u) {
  const c = u.cls ? splitCk(u.cls) : {grade: '', section: ''};
  return {action: 'register', username: u.username, name: u.name, role: u.role, salt: u.salt, hash: u.hash, phone: u.phone || '', class: c.grade, section: c.section, roll_no: u.roll || '',
    first_name: u.first || '', last_name: u.last || '', father_name: u.father || '', sec_q: u.secQ, sec_a: u.secA, email: u.email || ''};
}
async function signUp(f) {
  const username = f.username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new Error('Username: 3-30 letters/numbers (no spaces)');
  if (!f.secQ || !normAns(f.secA)) throw new Error('Choose a security question and write the answer');
  if (db.users.some(x => x.username === username && x.status !== 'rejected' && !(x.remote && x.status === 'rejected'))) throw new Error('Username already taken – choose another');
  if (f.role === 'student') {
    if (!f.roll || !f.first || !f.last || !f.father || !f.cls) throw new Error('All fields are required');
    if (db.users.some(x => x.role === 'student' && x.status !== 'rejected' && x.cls === f.cls && String(x.roll) === String(f.roll))) throw new Error(`Roll number ${f.roll} is already registered in ${f.cls}`);
  }
  const email = cleanEmail(f.email, false);
  const salt = newSalt(), hash = hashPw(f.pass, salt);
  const u = {id: uid(), email, name: f.role === 'student' ? fullName(f) : f.name, username, role: f.role, status: 'pending', salt, hash, phone: f.phone || '', cls: f.cls || '', roll: f.roll || '',
    first: f.first || '', last: f.last || '', father: f.father || '', secQ: f.secQ, secA: ansHash(f.secA), subjects: [], classes: [], created: new Date().toISOString()};
  if (online()) { const r = await postJSON(db.settings.scriptUrl, regPayload(u)); if (!r.ok) throw new Error(r.error); }
  else if (db.settings.scriptUrl) u.regQueued = true;
  db.users = db.users.filter(x => x.username !== username); db.users.push(u); localStorage.setItem(SES_KEY, u.id); save(); return u;
}
// Forgot password, option B (security question). Server limits 5 wrong answers per hour and locks after 10 in a row.
async function forgotQuestion(ident, cls) {
  ident = ident.trim().toLowerCase();
  if (online()) { const where = cls ? {class: splitCk(cls).grade, section: splitCk(cls).section} : {};
    const r = await postJSON(db.settings.scriptUrl, {action: 'forgot_q', username: ident, ...where}); if (!r.ok) throw new Error(r.error); return {username: r.username, question: r.question}; }
  const u = findLocalByIdent(ident, cls); if (!u) throw new Error(db.settings.scriptUrl ? 'Connect to the internet' : 'Unknown username or roll number');
  if (!u.secQ) throw new Error('No security question set – contact the admin'); return {username: u.username, question: u.secQ};
}
async function forgotReset(username, answer, newPw) {
  if (newPw.length < 6) throw new Error('New password: at least 6 characters');
  const salt = newSalt(), hash = hashPw(newPw, salt);
  if (online()) { const r = await postJSON(db.settings.scriptUrl, {action: 'forgot_reset', username, ans_hash: ansHash(answer), salt, hash}); if (!r.ok) throw new Error(r.error); }
  else { const u = db.users.find(x => x.username === username); if (!u || u.secA !== ansHash(answer)) throw new Error('Answer is wrong'); }
  const u = db.users.find(x => x.username === username); if (u) Object.assign(u, {salt, hash, mustChange: false}); save();
}
// Forgot password by email OTP (needs the online Apps Script: MailApp sends the code). Server: 5 sends/hour, 5 wrong codes, 10-minute expiry.
async function otpSend(ident, cls) {
  ident = ident.trim().toLowerCase(); if (!ident) throw new Error('Enter username or roll number');
  if (!db.settings.scriptUrl) throw new Error('Email codes need online sync – ask the admin, or use the security question');
  if (!online()) throw new Error('Connect to the internet to get a code');
  const where = cls ? {class: splitCk(cls).grade, section: splitCk(cls).section} : {};
  const r = await postJSON(db.settings.scriptUrl, {action: 'otp_send', username: ident, ...where}); if (!r.ok) throw new Error(r.error); return {username: r.username, masked: r.masked, minutes: r.minutes};
}
async function otpReset(username, otp, newPw) {
  otp = String(otp || '').replace(/\D/g, ''); if (otp.length !== 6) throw new Error('Enter the 6-digit code from the email');
  if (newPw.length < 6) throw new Error('New password: at least 6 characters'); if (!online()) throw new Error('Connect to the internet');
  const salt = newSalt(), hash = hashPw(newPw, salt);
  const r = await postJSON(db.settings.scriptUrl, {action: 'otp_reset', username, otp, salt, hash}); if (!r.ok) throw new Error(r.error);
  const u = db.users.find(x => x.username === username); if (u) Object.assign(u, {salt, hash, mustChange: false});
  if (me() && me().username === username) { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SES_KEY); } save();
}
async function adminSetEmail(username, email) { // OWNER ONLY
  if (!isOwner()) throw new Error('Only the owner can change this'); const u = db.users.find(x => x.username === username);
  email = cleanEmail(email, u && u.role === 'owner');
  if (db.settings.scriptUrl) { if (!online()) throw new Error('Connect to the internet'); const r = await postJSON(db.settings.scriptUrl, {action: 'admin_set_email', token: getToken(), username, email}); if (!r.ok) throw new Error(r.error); }
  if (u) u.email = email; save();
}
async function adminResetPassword(username, temp, force) { // OWNER ONLY
  if (!isOwner()) throw new Error('Only the owner can reset passwords'); if (temp.length < 6) throw new Error('Temporary password: at least 6 characters');
  const salt = newSalt(), hash = hashPw(temp, salt);
  if (db.settings.scriptUrl) { if (!online()) throw new Error('Connect to the internet to reset a password');
    const r = await postJSON(db.settings.scriptUrl, {action: 'admin_reset', username, salt, hash, force_change: !!force}); if (!r.ok) throw new Error(r.error); }
  const u = db.users.find(x => x.username === username); if (u) Object.assign(u, {salt, hash, mustChange: !!force}); save();
}
async function setUserStatus(username, status) { // OWNER ONLY
  if (!isOwner()) return toast('Only the owner can approve');
  const u = db.users.find(x => x.username === username); if (!u) return;
  if (online() && getToken()) { const r = await postJSON(db.settings.scriptUrl, {action: 'approve', username, status}); if (!r.ok) return toast(r.error); }
  else if (db.settings.scriptUrl) db.approvalQueue.push({username, status});
  u.status = status; if (status === 'approved' && u.role === 'student' && u.cls) rememberRoster(u.cls, [{roll: u.roll, name: fullName(u), first: u.first, last: u.last, father: u.father}]);
  save(); toast(`${u.name}: ${status}`);
}
async function changePassword(oldPw, newPw) {
  const u = sessionUser(); if (!u) throw new Error('Not logged in'); if (newPw.length < 6) throw new Error('New password: at least 6 characters');
  if (u.hash && u.hash !== hashPw(oldPw, u.salt)) throw new Error('Old password is wrong');
  const salt = newSalt(), hash = hashPw(newPw, salt);
  if (db.settings.scriptUrl) { if (!online()) throw new Error('Connect to the internet to change password');
    const r = await postJSON(db.settings.scriptUrl, {action: 'change_password', old_hash: hashPw(oldPw, u.salt), salt, hash}); if (!r.ok) throw new Error(r.error); }
  Object.assign(u, {salt, hash, mustChange: false}); save();
}
function doLogout(all) { const tok = getToken();
  if (online() && tok) postJSON(db.settings.scriptUrl, {action: all ? 'logout_all' : 'logout'}).catch(() => {});
  localStorage.removeItem(SES_KEY); localStorage.removeItem(TOKEN_KEY); STATE.lastLogin = ''; closeUserMenu(); toast(all ? 'Logged out from all devices ✓' : 'Logged out ✓'); go('home'); }
/** Log out: unsynced items stay saved on this phone (they sync after the next login) – warn and offer "Sync now" first. */
function logout(all) {
  all = all === true; closeUserMenu(); const n = pendingCount();
  if (!n) { if (all && !confirm('Log out from ALL devices (phones and computers) where you are signed in?')) return; return doLogout(all); }
  const m = $('#modal'); m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" id="logoutDlg"><h2>⚠️ ${n} item${n > 1 ? 's' : ''} not synced yet</h2>
    <p>Marks, notes or changes on this phone have not reached the school Sheet yet. They will <b>not be lost</b> – they stay saved on this phone and sync after you log in again here – but syncing now is safest.</p>
    <div class="modal-acts"><button class="btn" id="lgSync">⟳ Sync now, then log out</button><button class="btn sec" id="lgAnyway">Log out anyway (keep on this phone)</button><button class="btn sec" id="lgCancel">Cancel</button></div></div>`;
  m.classList.remove('hidden');
  $('#lgCancel').onclick = () => m.classList.add('hidden');
  $('#lgAnyway').onclick = () => { m.classList.add('hidden'); doLogout(all); };
  $('#lgSync').onclick = async e => { if (!online()) return toast('You are offline – connect to the internet to sync'); e.target.disabled = true; e.target.textContent = 'Syncing…';
    await syncNow(true); const left = pendingCount(); m.classList.add('hidden'); if (left) { toast(`${left} item(s) still not synced`); logout(all); } else doLogout(all); };
}
const whoText = u => u.role === 'student' ? `${u.name || u.username}, Class ${String(u.cls || '').replace(/\s+/, '-')}, Roll ${u.roll || ''}` : `${u.name || u.username}, ${u.role === 'owner' ? 'Admin' : 'Teacher'}`;
function closeUserMenu() { const d = $('#userMenu'); if (d) d.classList.add('hidden'); const b = $('#userBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
function renderUserMenu() {
  const u = sessionUser(), ok = approved(u), w = $('#umenuWrap'); if (!w) return;
  w.classList.toggle('hidden', !u); const ho = $('#hdrLogout'); if (ho) ho.classList.toggle('hidden', !u); if (!u) return; { const t = whoText(u), i = t.indexOf(', '); $('#whoami').innerHTML = i < 0 ? esc(t) : `<span class="wn">${esc(t.slice(0, i))}</span><span class="wsep">, </span><span class="wd">${esc(t.slice(i + 2))}</span>`; }
  const role = u.role === 'owner' ? 'Admin' : u.role === 'student' ? 'Student' : 'Teacher';
  $('#uAv').textContent = (u.name || u.username || '?').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  $('#uRole').textContent = role; $('#uRole').className = 'rbadge r-' + u.role;
  $('#userMenu').innerHTML = `<div class="um-h"><b>${esc(u.name || u.username)}</b><span class="rbadge r-${esc(u.role)}">${role}</span><small>@${esc(u.username)}${u.role === 'student' ? ` · ${esc(u.cls)} #${esc(u.roll)}` : ''}</small></div>
    ${ok ? `<button data-um="profile">👤 Profile</button><button data-um="password">🔑 Change password</button>` : ''}
    <button data-um="sync">⟳ Sync now <small>${pendingCount() ? pendingCount() + ' waiting' : 'all synced'}</small></button>
    <button data-um="logout" id="umLogout" class="um-out">🚪 Logout</button><button data-um="logoutall" id="umLogoutAll">📵 Logout from all devices</button>`;
  $$('#userMenu [data-um]').forEach(b => b.onclick = () => { const a = b.dataset.um; closeUserMenu();
    if (a === 'profile') go(u.role === 'student' ? 'account' : 'settings');
    else if (a === 'password') { STATE.focusPw = true; go(u.role === 'student' ? 'account' : 'settings'); }
    else if (a === 'sync') syncNow(true); else if (a === 'logout') logout(); else logout(true); });
}

/* ------------------------------------------------------------------ announcements (core part: visibility, bell, banner) */
function annVisible(a, u) {
  if (a.expires && a.expires < today()) return false;
  if (a.audience === 'all') return true; if (!u) return false; if (u.role === 'owner') return true;
  if (a.audience === 'teachers') return u.role === 'teacher';
  if (a.audience.startsWith('class:')) return u.role === 'teacher' || a.audience === 'class:' + u.cls;
  return false;
}
function annFor(u) { return db.announcements.filter(a => annVisible(a, u)).sort((a, b) => (b.pinned - a.pinned) || (b.createdAt || '').localeCompare(a.createdAt || '')); }
function annUnread(u) { const seen = (db.settings.annSeen || {})[u ? u.id : 'public'] || ''; return annFor(u).filter(a => (a.updatedAt || a.createdAt || '') > seen && a.author !== (u || {}).name); }
function updateBell() { const b = $('#bellCount'); if (!b) return; const u = sessionUser(); const n = u && approved(u) ? annUnread(u).length : 0; b.textContent = n || ''; b.classList.toggle('hidden', !n); $('#bell').classList.toggle('hidden', !u || !approved(u)); }
function bannerHTML() {
  const u = sessionUser(); if (!u || !approved(u) || VIEW === 'ann') return '';
  const unread = annUnread(u); const a = annFor(u).find(x => x.pinned) || unread[0]; if (!a) return '';
  return `<div class="annbar ${a.pinned ? 'pin' : ''}" onclick="go('ann')"><b>${a.pinned ? '📌' : '📢'} ${esc(a.title)}</b> <span>${esc((a.message || '').slice(0, 120))}${(a.message || '').length > 120 ? '…' : ''}</span>${unread.includes(a) ? ' <span class="nbadge">NEW</span>' : ''}<span class="muted"> · tap to open</span></div>`;
}

/* ------------------------------------------------------------------ shared query helpers */
function testsIn({cls, subject, from, to} = {}) {
  return db.tests.filter(t => (!cls || testCk(t) === cls) && (!subject || t.subject === subject) && (!from || t.date >= from) && (!to || t.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date));
}
function classAvg(tests) { let o = 0, t = 0; tests.forEach(x => x.rows.forEach(r => { if (r.obt != null) { o += r.obt; t += x.total; } })); return pct(o, t); }

/* ------------------------------------------------------------------ router */
let VIEW = 'home'; const STATE = {};
const hashView = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/$/, '');
function go(v, extra) { VIEW = v; if (extra) Object.assign(STATE, extra); if (hashView() !== v) history.replaceState(null, '', '#/' + v); render(); window.scrollTo(0, 0); }
const STUDENT_VIEWS = ['shome', 'notes', 'mine', 'card', 'honor', 'chat', 'ann', 'account'];
const PUBLIC_VIEWS = ['home', 'teacher', 'teacher/register', 'student', 'student/register', 'admin', 'pending'];
function render() {
  if (dashMod) dashMod.destroyCharts(); if (chatMod) chatMod.stopChat(); updateStatus(); applyBranding();
  const u = sessionUser(), ok = approved(u), stu = u && u.role === 'student';
  renderFooter(); renderUserMenu(); $('#nav').classList.toggle('hidden', !u || !ok); $('#menuBtn').classList.toggle('hidden', !u || !ok); $('#pubNav').classList.toggle('hidden', !!(u && ok));
  const roleKey = !u ? '' : stu ? 'student' : u.role === 'owner' ? 'owner' : 'teacher'; document.body.dataset.role = roleKey || 'public';
  $$('#nav [data-who]').forEach(b => b.classList.toggle('hidden', !b.dataset.who.split(' ').includes(roleKey)));
  $$('#pubNav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === VIEW.split('/')[0]));
  updateNotesBadge(); $('#annBanner').innerHTML = '';
  if (VIEW === 'forgot' && u) VIEW = 'home';
  if (['lookup', 'contact', 'forgot'].includes(VIEW)) { $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === VIEW)); // public pages
    if (VIEW === 'lookup') return lazyView('dash', 'viewLookup'); if (VIEW === 'contact') return viewContact(); return viewForgot(); }
  if (!u) { if (!PUBLIC_VIEWS.includes(VIEW) || VIEW === 'pending') VIEW = 'home';
    if (VIEW === 'home') return viewPublicHome(); const [r, sub] = VIEW.split('/'); return viewRoleLogin(r, sub === 'register'); }
  if (!ok) return viewPending(u);
  if (PUBLIC_VIEWS.includes(VIEW) && !(VIEW === 'admin' && isOwner()) && !(VIEW === 'home' && !stu)) VIEW = landingFor(u);
  if (u.mustChange) VIEW = u.role === 'student' ? 'account' : 'settings';
  if (stu && !STUDENT_VIEWS.includes(VIEW)) VIEW = 'shome';
  if (!stu && (VIEW === 'mine' || VIEW === 'account')) VIEW = VIEW === 'account' ? 'settings' : 'home';
  if (VIEW === 'admin' && !isOwner()) VIEW = 'home';
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === VIEW));
  $('#annBanner').innerHTML = bannerHTML();
  STATE.lockStudent = !!stu;
  if (stu) Object.assign(STATE, {sCls: u.cls, sRoll: u.roll, cCls: u.cls, cRoll: u.roll});
  const core = {home: viewHome, entry: viewEntry, tests: viewTests, settings: viewSettings, account: viewSettings}[VIEW];
  if (core) return core();
  if (VIEW === 'notes') return lazyView('notes', 'viewNotes');
  if (VIEW === 'chat') return lazyView('chat', 'viewChat');
  if (VIEW === 'ann') return lazyView('ann', 'viewAnn');
  const lazy = {shome: 'viewStudentHome', report: 'viewReport', card: 'viewCard', sdash: 'viewStudentDash', mine: 'viewStudentDash', tdash: 'viewTeacherDash', mystudents: 'viewMyStudents', admin: 'viewAdmin', honor: 'viewHonor'}[VIEW];
  if (!lazy) { VIEW = 'home'; return viewHome(); }
  lazyView('dash', lazy);
}
// dashboards (+ Chart.js), notes, chat and announcements are lazy-loaded only when first opened
const MODS = {};
function loadMod(name) { return MODS[name] ? Promise.resolve(MODS[name]) : import(`./${name}.js`).then(m => { MODS[name] = m; if (name === 'dash') dashMod = m; if (name === 'chat') chatMod = m; return m; }); }
let dashMod = null, chatMod = null;
const loadDash = () => loadMod('dash'), loadNotes = () => loadMod('notes');
function lazyView(mod, fn) {
  const want = VIEW; app().innerHTML = '<div class="empty">Loading…</div>';
  loadMod(mod).then(m => { if (VIEW === want) m[fn](); }).catch(e => { console.error(e); app().innerHTML = '<div class="card empty">Could not load this screen. Open the app once while online so it is saved for offline use.</div>'; });
}
function notesFor(u) { return u && u.role === 'student' ? db.notes.filter(n => n.cls === u.cls) : db.notes; }
function updateNotesBadge() {
  const u = sessionUser(); const b = $('#notesBadge'); if (!b) return; if (!u) { b.textContent = ''; b.classList.add('hidden'); return; }
  const seen = db.settings.notesSeen[u.id] || ''; const n = notesFor(u).filter(x => (x.createdAt || '') > seen && x.teacherName !== u.name).length;
  b.textContent = n ? n : ''; b.classList.toggle('hidden', !n);
}
$$('#nav button').forEach(b => b.onclick = () => { document.body.classList.remove('nav-open'); go(b.dataset.view); });
$('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
window.addEventListener('hashchange', () => { const v = hashView() || 'home'; if (v !== VIEW) { VIEW = v; render(); window.scrollTo(0, 0); } });
const app = () => $('#app');
const opts = (arr, sel, all) => (all ? `<option value="">${all}</option>` : '') + arr.map(v => `<option ${v === sel ? 'selected' : ''} value="${esc(v)}">${esc(v)}</option>`).join('');

/* ------------------------------------------------------------------ owner setup / login / sign-up */
function brandHead(sub) {
  return `<div style="text-align:center;margin-bottom:8px"><img src="${esc(db.settings.logo || 'icons/icon-192.png')}" class="logo-prev" alt=""><h2 style="margin:8px 0 0">${esc(db.settings.schoolName)}</h2><div class="muted">${sub}</div></div>`;
}
function viewOwnerSetup() {
  app().innerHTML = `<div class="login-wrap"><div class="card">${brandHead('First-time setup · <span class="ur">پہلی بار سیٹ اپ</span>')}
    <p>Create the <b>Owner</b> account. Only the owner can approve teachers &amp; students and change school settings. <span class="ur">مالک کا اکاؤنٹ بنائیں</span></p>
    <label>Owner name <span class="ur">نام</span></label><input id="oName" value="Toshan Rafiq">
    <label>Owner username <span class="ur">یوزر نیم</span></label><input id="oUser" autocomplete="username">
    <label>Password (8+ characters) <span class="ur">پاس ورڈ</span></label><input id="oPass" type="password" autocomplete="new-password">
    <label>Repeat password <span class="ur">دوبارہ پاس ورڈ</span></label><input id="oPass2" type="password" autocomplete="new-password">
    <label>Recovery email * <span class="ur">ریکوری ای میل</span></label><input id="oEmail" type="email" inputmode="email" autocapitalize="none" value="${DEFAULT_OWNER_EMAIL}" required>
    <p class="muted" style="margin-top:2px">A 6-digit reset code is sent here if you forget your password. You can change it.</p>
    ${secQHTML('O')}
    <button class="btn" id="oSave" style="width:100%">Create owner account</button>
    <p class="muted">Keep these details safe – write them on paper. ${db.settings.scriptUrl ? 'This will be saved to the school Google Sheet.' : ''}</p>
    <a class="auth-home" href="#/home">← Home</a> <button class="btn sec sm" onclick="go('lookup')">👪 Parent result lookup</button><button class="btn sec sm" id="oHave">Owner already exists? Log in</button></div></div>`;
  $('#oHave').onclick = () => { db.settings.serverHasOwner = true; save(); render(); };
  $('#oSave').onclick = async () => {
    const name = $('#oName').value.trim(), user = $('#oUser').value.trim(), p = $('#oPass').value;
    if (!name || !/^[a-z0-9_.-]{3,}$/i.test(user)) return toast('Username: 3+ letters/numbers'); if (p.length < 8) return toast('Password: at least 8 characters'); if (p !== $('#oPass2').value) return toast('Passwords do not match');
    if (!EMAIL_RE.test($('#oEmail').value.trim())) return toast('Enter a valid recovery email');
    if (!$('#secAO').value.trim()) return toast('Write a security answer (for password reset)');
    try { await ownerSetup(name, user, p, $('#secO').value, $('#secAO').value, $('#oEmail').value); toast('Owner account created ✓'); go('admin'); } catch (e) { toast('Setup failed: ' + e.message); if (/exists/.test(e.message)) { db.settings.serverHasOwner = true; save(); render(); } }
  };
}
function publicAnnHTML() {
  const list = annFor(null).slice(0, 5); if (!list.length) return '';
  return `<div class="card"><h2>📢 Announcements <span class="ur">اعلانات</span></h2>${list.map(a => `<div class="ann ${a.pinned ? 'pin' : ''}"><b>${a.pinned ? '📌 ' : ''}${esc(a.title)}</b>
    <div class="muted">${fmtD(a.createdAt.slice(0, 10))}${a.expires ? ' · until ' + fmtD(a.expires) : ''}</div><div style="white-space:pre-wrap">${esc(a.message)}</div>
    ${a.fileId && /^image\//.test(a.mime) ? `<img class="annimg" data-annimg="${esc(a.id)}" alt="">` : a.fileId ? `<button class="btn sm sec" data-annfile="${esc(a.id)}">📎 ${esc(a.fileName)}</button>` : ''}</div>`).join('')}</div>`;
}
const secQHTML = (id = 'Q') => `<div class="row"><div><label>Security question <span class="ur">حفاظتی سوال</span></label><select id="sec${id}">${opts(SEC_QS)}</select></div>
  <div><label>Answer <span class="ur">جواب</span></label><input id="secA${id}" autocomplete="off" placeholder="used if you forget your password"></div></div>`;
/* ------------------------------------------------------------------ public home + three login pages (#/teacher, #/student, #/admin) */
const ROLE_PAGES = {
  teacher: {icon: '👩‍🏫', title: 'Teacher Login', ur: 'اساتذہ لاگ ان', text: 'Enter marks, see class reports, share notes and chat with your classes.',
    bullets: ['➕ Enter daily test marks', '🏫 My classes & insights', '🗓️ Weekly / monthly reports', '📚 Notes, 💬 chat, 📢 announcements']},
  student: {icon: '🎓', title: 'Student Login', ur: 'طلبہ لاگ ان', text: 'See your marks, progress dashboard, notes and class chat.',
    bullets: ['📈 My results & progress', '🏠 Personal dashboard', '📚 Class notes & 💬 chat', '👤 Profile & settings']},
  admin: {icon: '🛡️', title: 'Admin Login', ur: 'ایڈمن لاگ ان', text: 'Approve accounts, manage classes, subjects and school settings.',
    bullets: ['✅ Approve teachers & students', '🏫 Classes, sections & subjects', '📊 Whole-school dashboards', '⚙️ School name, logo & backup']},
};
const landingFor = u => u.mustChange ? (u.role === 'student' ? 'account' : 'settings') : u.role === 'student' ? 'shome' : u.role === 'owner' ? 'admin' : 'home';
function honorMiniHTML(list) {
  if (!list || !list.length) return '<div class="empty">🏅 The Honor Board fills up as soon as teachers enter test marks.</div>';
  const medal = ['🥇', '🥈', '🥉'];
  return `<ol class="hb-mini">${list.slice(0, Math.max(1, Math.min(20, Number(db.settings.honorLimit) || 7))).map((h, i) => `<li><span class="hb-r">${i < 3 ? medal[i] : i + 1}</span>
    <span class="hb-n"><b>${esc(h.name)}</b><small>${esc(h.cls)} · ${esc(h.subject)}</small></span><span class="hb-p">${p1(h.pct)}</span></li>`).join('')}</ol>`;
}
function tilesHTML(list, id) { return `<div class="tiles" id="${id}">${list.map(([v, ic, t, x]) => `<button class="tile" data-tile="${v}" onclick="go('${v}')"><span class="tile-ic">${ic}</span><b>${t}</b><small>${x}</small></button>`).join('')}</div>`; }
function viewPublicHome() {
  const name = db.settings.schoolName || DEFAULT_NAME, logo = db.settings.logo || 'icons/icon-192.png';
  const card = r => { const c = ROLE_PAGES[r]; return `<a class="entry entry-${r}" href="#/${r}" data-entry="${r}"><span class="entry-ic">${c.icon}</span>
    <span class="entry-t">${c.title}</span><span class="ur">${c.ur}</span><span class="entry-x">${c.text}</span><span class="entry-go">${r === 'admin' ? 'Login' : 'Login / Register'} →</span></a>`; };
  const anns = annFor(null).slice(0, 4);
  app().innerHTML = `<section class="hero" id="homeHero"><img src="${esc(logo)}" class="hero-logo" alt="">
      <h1>${esc(name)}</h1><p class="hero-tag">Every test, every student – recorded, analysed and shared.</p>
      <p class="hero-ur ur">ہر ٹیسٹ، ہر طالب علم – محفوظ ریکارڈ</p>
      <div class="hero-cta"><button class="btn light" onclick="go('lookup')">👪 Check Result</button><button class="btn light" onclick="go('contact')">📞 Contact</button></div></section>
    <section class="entry-grid" id="entryCards">${card('teacher')}${card('student')}${card('admin')}</section>
    <section class="home-grid">
      <div class="card" id="homeHonor"><div class="card-h"><h2>🏅 Honor Board <span class="ur">اعزازی بورڈ</span></h2><span class="muted">Top ${Number(db.settings.honorLimit) || 7} · last 30 days</span></div><div id="hbBody">${honorMiniHTML(db.publicHonor)}</div></div>
      <div class="home-side">
        <div class="card" id="homeAnn"><h2>📢 Announcements <span class="ur">اعلانات</span></h2>${anns.length ? anns.map(a => `<div class="ann ${a.pinned ? 'pin' : ''}"><b>${a.pinned ? '📌 ' : ''}${esc(a.title)}</b>
          <div class="muted">${fmtD(a.createdAt.slice(0, 10))}${a.expires ? ' · until ' + fmtD(a.expires) : ''}</div><div style="white-space:pre-wrap">${esc(a.message)}</div>
          ${a.fileId && /^image\//.test(a.mime) ? `<img class="annimg" data-annimg="${esc(a.id)}" alt="">` : a.fileId ? `<button class="btn sm sec" data-annfile="${esc(a.id)}">📎 ${esc(a.fileName)}</button>` : ''}</div>`).join('') : '<div class="muted">No announcements right now.</div>'}</div>
        <div class="card home-check"><h2>👪 Parents: Check Result</h2><p class="muted">Choose the class and enter the roll number – no login needed.</p><button class="btn" style="width:100%" onclick="go('lookup')">Check Result →</button></div>
        <div class="card"><h2>💬 Contact the school</h2>${contactHTML(true)}</div>
      </div></section>`;
  bindAnnFiles();
  if (!(db.publicHonor || []).length && db.tests.length) loadMod('dash').then(m => { const el = $('#hbBody'); if (el && VIEW === 'home') el.innerHTML = honorMiniHTML(m.honorList({from: addDays(today(), -30), to: today(), limit: 20})); }).catch(() => {});
}
function viewRoleLogin(role, register) {
  const c = ROLE_PAGES[role]; STATE.lastLogin = role;
  if (role === 'admin' && !hasOwner()) return viewOwnerSetup();
  const cls = db.classes.map(ck);
  const side = `<div class="auth-side"><div class="auth-ic">${c.icon}</div><h1>${register ? (role === 'teacher' ? 'Teacher Registration' : 'Student Registration') : c.title}</h1><div class="ur">${c.ur}</div>
    <p>${esc(c.text)}</p><ul>${c.bullets.map(b => `<li>${b}</li>`).join('')}</ul><a class="auth-home" href="#/home">← ${esc(db.settings.schoolName || DEFAULT_NAME)} home</a></div>`;
  let form;
  if (register && role === 'student') form = `<h2>Create student account</h2><p class="muted">All fields with * are required. The admin approves your account.</p>
      <label>Roll Number <span class="ur">رول نمبر</span> *</label><input id="suRoll" inputmode="numeric" required>
      <div class="row"><div><label>First Name <span class="ur">پہلا نام</span> *</label><input id="suFirst" autocomplete="given-name" required></div><div><label>Last Name <span class="ur">آخری نام</span> *</label><input id="suLast" autocomplete="family-name" required></div></div>
      <label>Father's Name <span class="ur">والد کا نام</span> *</label><input id="suFather" required>
      <label>Class &amp; section <span class="ur">کلاس</span> *</label><select id="suCls">${opts(cls)}</select>
      <label>Username (unique, no spaces) <span class="ur">یوزر نیم</span> *</label><input id="suUser" autocomplete="username" autocapitalize="none">
      <label>Password (6+) <span class="ur">پاس ورڈ</span> *</label><input id="suPass" type="password" autocomplete="new-password">
      ${secQHTML('S')}
      <label>Recovery email (optional) <span class="ur">ای میل</span></label><input id="suEmail" type="email" inputmode="email" autocapitalize="none" placeholder="for a password reset code">
      <button class="btn big" id="doStu">Register as student</button>
      <p class="auth-switch">Already registered? <a href="#/student" id="toLogin">Log in here</a></p>`;
  else if (register) form = `<h2>Create teacher account</h2><p class="muted">The admin approves new teachers. <span class="ur">مالک منظوری دیں گے</span></p>
      <label>Full name <span class="ur">پورا نام</span> *</label><input id="rName" autocomplete="name">
      <label>Username <span class="ur">یوزر نیم</span> *</label><input id="rUser" autocomplete="username" autocapitalize="none" placeholder="e.g. ahmad or 03001234567">
      <label>Phone (optional) <span class="ur">فون نمبر</span></label><input id="rPhone" inputmode="tel">
      <label>Password (6+) <span class="ur">پاس ورڈ</span> *</label><input id="rPass" type="password" autocomplete="new-password">
      ${secQHTML('T')}
      <label>Recovery email (optional) <span class="ur">ای میل</span></label><input id="rEmail" type="email" inputmode="email" autocapitalize="none" placeholder="for a password reset code">
      <button class="btn big" id="doReg">Register as teacher</button>
      <p class="auth-switch">Already registered? <a href="#/teacher" id="toLogin">Log in here</a></p>`;
  else form = `<h2>${c.title}</h2>
      <label>${role === 'student' ? 'Roll Number or Username <span class="ur">رول نمبر یا یوزر نیم</span>' : role === 'admin' ? 'Admin username <span class="ur">یوزر نیم</span>' : 'Username <span class="ur">یوزر نیم</span>'}</label>
      <input id="lUser" autocomplete="username" autocapitalize="none" ${role === 'student' ? 'placeholder="e.g. 12 or hamza"' : ''}>
      <div id="lClsBox" class="${STATE.needCls ? '' : 'hidden'}"><label>Your class (this roll number is used in more than one class)</label><select id="lCls">${opts(cls, '', '— choose class —')}</select></div>
      <label>Password <span class="ur">پاس ورڈ</span></label><input id="lPass" type="password" autocomplete="current-password">
      <button class="btn big" id="doLogin">Log in</button>
      <div class="auth-links"><a href="#/forgot" id="fpLink">Forgot password? <span class="ur">پاس ورڈ بھول گئے</span></a></div>
      ${role === 'admin' ? '<p class="auth-switch muted">Admin accounts cannot be registered here. Teachers and students: use your own login page.</p>'
        : `<p class="auth-switch">New ${role}? <a href="#/${role}/register" id="toRegister">Register here →</a></p>`}`;
  app().innerHTML = `<div class="auth-wrap auth-${role}">${side}<div class="card auth-card">${form}
    <p class="muted auth-foot">🔒 Passwords are salted &amp; hashed – never stored or sent in plain text.</p></div></div>`;
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { toast(e.message.replace(/^choose_class:\s*/, '')); } finally { btn.disabled = false; } };
  if (register && role === 'student') $('#doStu').onclick = e => busy(e.target, async () => {
    const f = {role: 'student', roll: $('#suRoll').value.trim(), first: $('#suFirst').value.trim(), last: $('#suLast').value.trim(), father: $('#suFather').value.trim(), cls: $('#suCls').value,
      username: $('#suUser').value, pass: $('#suPass').value, secQ: $('#secS').value, secA: $('#secAS').value, email: $('#suEmail').value};
    if (!f.roll || !f.first || !f.last || !f.father || !f.cls || !f.username.trim()) throw new Error('All fields with * are required');
    if (f.pass.length < 6) throw new Error('Password: at least 6 characters');
    await signUp(f); go('pending');
  });
  else if (register) $('#doReg').onclick = e => busy(e.target, async () => {
    const f = {role: 'teacher', name: $('#rName').value.trim(), username: $('#rUser').value, pass: $('#rPass').value, phone: $('#rPhone').value.trim(), secQ: $('#secT').value, secA: $('#secAT').value, email: $('#rEmail').value};
    if (!f.name || !f.username.trim() || f.pass.length < 6) throw new Error('Enter name, username and a password (6+ chars)');
    await signUp(f); go('pending');
  });
  else $('#doLogin').onclick = e => busy(e.target, async () => {
    try { const u = await login($('#lUser').value, $('#lPass').value, $('#lCls').value); STATE.needCls = false;
      if (getToken()) await pullNow(false);
      const want = role === 'admin' ? 'owner' : role; if (approved(u) && u.role !== want) toast(`Logged in as ${u.role === 'owner' ? 'admin' : u.role} – opening your dashboard`);
      go(approved(u) ? landingFor(u) : 'pending');
    } catch (err) { if (/^choose_class/.test(err.message)) { STATE.needCls = true; $('#lClsBox').classList.remove('hidden'); } throw err; }
  });
}
function viewPending(u) {
  const rej = u.status === 'rejected', c = contactInfo();
  const who = u.role === 'student' ? `student of <b>${esc(u.cls)}</b>, roll # <b>${esc(u.roll)}</b>` : '<b>teacher</b>';
  const msg = `Assalam-o-Alaikum, I registered on ${db.settings.schoolName || DEFAULT_NAME} as ${u.role === 'student' ? `a student (${u.cls}, roll ${u.roll})` : 'a teacher'}. Username: ${u.username}. Please approve my account.`;
  app().innerHTML = `<div class="pending-wrap"><div class="card pending" id="pendingCard">
    <div class="pending-ic">${rej ? '⛔' : '⏳'}</div>
    <h1>${rej ? 'Account not approved' : 'Registration received – waiting for approval'}</h1><div class="ur">${rej ? 'اکاؤنٹ منظور نہیں ہوا' : 'رجسٹریشن ہو گئی – منظوری کا انتظار'}</div>
    <p>Assalam-o-Alaikum <b>${esc(u.name || u.username)}</b>! Your account as ${who} (username <code>${esc(u.username)}</code>) is <b>${esc(u.status || 'pending')}</b>.</p>
    ${rej ? '<p>Please contact the school admin.</p>' : `<ol class="steps"><li class="done"><b>1. Registered</b><span>Your details were sent to the school.</span></li>
      <li class="now"><b>2. Admin approves</b><span>Only the school admin can approve new ${u.role === 'student' ? 'students' : 'teachers'}. This usually happens the same day.</span></li>
      <li><b>3. Log in &amp; start</b><span>After approval, log in on <b>any phone</b> from the ${u.role === 'student' ? 'Student' : 'Teacher'} Login page.</span></li></ol>`}
    <p class="muted">Want it faster? Send the admin a WhatsApp message:</p>
    ${c.whatsapp ? `<a class="btn wa big" id="pendWa" href="${esc(waLink(c.whatsapp))}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 WhatsApp ${esc(c.whatsapp_name || 'admin')} · ${esc(c.whatsapp)}</a>` : contactHTML(true)}
    <div class="pending-actions"><button class="btn" id="pChk">⟳ Check approval again</button><button class="btn sec" id="stOut">← Log out / Home</button></div></div></div>`;
  $('#stOut').onclick = () => logout();
  $('#pChk').onclick = async () => { if (!online()) return toast('Connect to the internet to check'); const r = await tryServerLogin(u.username, u.hash);
    if (r.ok) { toast('Approved ✓ – welcome!'); await pullNow(false); go(landingFor(sessionUser() || u)); } else { toast(r.error || 'Still ' + (r.status || 'pending')); render(); } };
}
function contactInfo() { const c = db.settings.contact || {}; return c.whatsapp || c.phone || c.email || c.address ? c : {...DEFAULT_CONTACT}; }
const waLink = n => 'https://wa.me/' + String(n || '').replace(/\D/g, '').replace(/^0/, '92');
function waButton(cls = '') { const c = contactInfo(); if (!c.whatsapp) return '';
  return `<a class="btn wa ${cls}" href="${esc(waLink(c.whatsapp))}" target="_blank" rel="noopener" data-wa>💬 WhatsApp ${esc(c.whatsapp_name || '')}${c.whatsapp_name ? ' · ' : ''}${esc(c.whatsapp)}</a>`; }
function contactHTML(short) {
  const c = contactInfo();
  if (!c.phone && !c.whatsapp && !c.email && !c.address) return '<p class="muted">The school has not added contact details yet. Please visit the school office.</p>';
  return `<div class="contact">${waButton()}${c.phone ? `<a class="btn sec" href="tel:${esc(c.phone)}">📞 ${esc(c.phone)}</a>` : ''}
    ${c.email && !short ? `<a class="btn sec" href="mailto:${esc(c.email)}">✉️ ${esc(c.email)}</a>` : ''}</div>${c.address && !short ? `<p>📍 ${esc(c.address)}</p>` : ''}`;
}
function renderFooter() { const f = $('#footWa'); if (f) f.innerHTML = waButton('sm'); }
function viewContact() {
  app().innerHTML = `<div class="login-wrap"><div class="card">${brandHead('Contact us · <span class="ur">رابطہ</span>')}${contactHTML(false)}
    <button class="btn sec sm" onclick="go('home')">← Back</button></div></div>`;
}
function viewForgot() {
  const st = STATE.fp || {}, fo = STATE.fo || {};
  app().innerHTML = `<div class="login-wrap"><div class="card">${brandHead('Forgot password · <span class="ur">پاس ورڈ بھول گئے</span>')}
    <h3>Option A – Contact the admin <span class="ur">ایڈمن سے رابطہ</span></h3><p class="muted">The admin can set a temporary password for you.</p>${contactHTML(true)}
    <h3 style="margin-top:18px">Option B – Get OTP on email <span class="ur">ای میل پر کوڈ</span></h3>
    ${!fo.username ? `<label>Username or Roll Number</label><input id="foId" autocapitalize="none" value="${esc(fo.ident || '')}">
      <div id="foClsBox" class="${fo.needCls ? '' : 'hidden'}"><label>Your class</label><select id="foCls">${opts(db.classes.map(ck), '', '— choose class —')}</select></div>
      <button class="btn" id="foSend">📧 Send code to my email</button>` : `
      <p id="foSent" class="okmsg">✓ A 6-digit code was sent to <b>${esc(fo.masked)}</b>. It works for ${esc(fo.minutes || 10)} minutes.</p>
      <p>Account: <b>${esc(fo.username)}</b></p><label>6-digit code <span class="ur">کوڈ</span></label><input id="foCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <div class="row"><div><label>New password (6+)</label><input id="foNew" type="password" autocomplete="new-password"></div><div><label>Repeat</label><input id="foNew2" type="password" autocomplete="new-password"></div></div>
      <button class="btn" id="foSave">Set new password</button><button class="btn sec" id="foResend">Send a new code</button><button class="btn sec" id="foBack">Start again</button>
      <p class="muted">For safety: max 5 codes per hour; after 5 wrong codes the code stops working. A new password signs you out on all phones.</p>`}
    <h3 style="margin-top:18px">Option C – Answer your security question <span class="ur">حفاظتی سوال</span></h3>
    ${!st.username ? `<label>Username or Roll Number</label><input id="fpId" autocapitalize="none" value="${esc(st.ident || '')}">
      <div id="fpClsBox" class="${st.needCls ? '' : 'hidden'}"><label>Your class</label><select id="fpCls">${opts(db.classes.map(ck), '', '— choose class —')}</select></div>
      <button class="btn" id="fpNext">Next</button>` : `
      <p>Account: <b>${esc(st.username)}</b></p><label>${esc(st.question)}</label><input id="fpAns" autocomplete="off">
      <div class="row"><div><label>New password (6+)</label><input id="fpNew" type="password" autocomplete="new-password"></div><div><label>Repeat</label><input id="fpNew2" type="password" autocomplete="new-password"></div></div>
      <button class="btn" id="fpSave">Set new password</button><button class="btn sec" id="fpBack">Start again</button>
      <p class="muted">For safety: 5 wrong answers per hour; the account locks after 10 wrong answers and then only the admin can reset it.</p>`}
    <div style="margin-top:12px"><button class="btn sec sm" onclick="STATE_reset_fp(); go(STATE_lastLogin())">← Back to login</button></div></div></div>`;
  const send = async btn => { btn.disabled = true;
    try { const ident = fo.username || $('#foId').value.trim(); const r = await otpSend(ident, fo.username ? '' : $('#foCls').value); STATE.fo = {...r, ident}; viewForgot(); toast('Code sent to ' + r.masked); }
    catch (e) { if (/^choose_class/.test(e.message)) { STATE.fo = {ident: $('#foId').value.trim(), needCls: true}; viewForgot(); } toast(e.message.replace(/^choose_class:\s*/, '')); } finally { btn.disabled = false; } };
  if (!fo.username) $('#foSend').onclick = e => send(e.target);
  else {
    $('#foResend').onclick = e => send(e.target); $('#foBack').onclick = () => { STATE.fo = {}; viewForgot(); };
    $('#foSave').onclick = async () => { const n = $('#foNew').value; if (n !== $('#foNew2').value) return toast('Passwords do not match');
      try { await otpReset(fo.username, $('#foCode').value, n); STATE.fo = {}; toast('Password changed ✓ – please log in'); go(STATE.lastLogin || 'home'); } catch (e) { toast(e.message); } };
  }
  if (!st.username) $('#fpNext').onclick = async () => {
    try { const ident = $('#fpId').value.trim(); if (!ident) return toast('Enter username or roll number'); const r = await forgotQuestion(ident, $('#fpCls').value); STATE.fp = {...r, ident}; viewForgot(); }
    catch (e) { if (/^choose_class/.test(e.message)) { STATE.fp = {ident: $('#fpId').value.trim(), needCls: true}; viewForgot(); } toast(e.message.replace(/^choose_class:\s*/, '')); } };
  else {
    $('#fpBack').onclick = () => { STATE.fp = {}; viewForgot(); };
    $('#fpSave').onclick = async () => { const n = $('#fpNew').value; if (n !== $('#fpNew2').value) return toast('Passwords do not match');
      try { await forgotReset(st.username, $('#fpAns').value, n); STATE.fp = {}; toast('Password changed ✓ – please log in'); go(STATE.lastLogin || 'home'); } catch (e) { toast(e.message); } };
  }
}
window.STATE_lastLogin = () => STATE.lastLogin || 'home';
window.STATE_reset_fp = () => { STATE.fp = {}; STATE.fo = {}; };
function bindAnnFiles(root = document) {
  $$('[data-annimg]', root).forEach(async img => { try { const m = await loadMod('ann'); img.src = await m.annFileURL(img.dataset.annimg); } catch (e) { img.replaceWith(Object.assign(document.createElement('span'), {className: 'muted', textContent: '🖼 image available when online'})); } });
  $$('[data-annfile]', root).forEach(b => b.onclick = async () => { try { const m = await loadMod('ann'); m.openAnnFile(b.dataset.annfile); } catch (e) { toast(e.message); } });
}

/* ------------------------------------------------------------------ home */
function viewHome() {
  const m = me(); const mine = db.tests.filter(t => t.teacherId === m.id);
  const [wf, wt] = weekRange(today()); const [mf, mt] = monthRange(today());
  const recent = [...db.tests].sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6);
  app().innerHTML = `
  <div class="card"><div class="card-h"><h2>Assalam-o-Alaikum, ${esc(m.name)} 👋</h2><span class="ur">خوش آمدید</span></div>
    <div class="muted">Subjects: ${esc((m.subjects || []).join(', ') || 'all')} · Classes: ${esc((m.classes || []).join(', ') || 'all')}</div>
    <button class="btn sec sm" onclick="syncNow(true)">⟳ Sync now</button>
  </div>
  ${tilesHTML([['entry', '➕', 'Enter Marks', 'Record today\'s test'], ['mystudents', '👥', 'My Students', 'Class list & search'], ['tdash', '🏫', 'My Classes', 'Insights & my subjects'], ['report', '🗓️', 'Reports', 'Weekly / monthly'],
    ['notes', '📚', 'Notes', 'Share with classes'], ['chat', '💬', 'Chat', 'Class chat'], ['ann', '📢', 'Announcements', 'School news']].concat(m.role === 'owner' ? [['admin', '🛡️', 'Admin Panel', 'Approve & manage']] : []), 'tTiles')}
  <div class="kpis">
    <div class="kpi"><div class="l">Tests entered by you</div><div class="v">${mine.length}</div></div>
    <div class="kpi"><div class="l">This week (all)</div><div class="v">${testsIn({from: wf, to: wt}).length}</div><div class="s">${fmtD(wf)} – ${fmtD(wt)}</div></div>
    <div class="kpi"><div class="l">This month avg</div><div class="v">${p1(classAvg(testsIn({from: mf, to: mt})))}</div></div>
    <div class="kpi"><div class="l">Waiting to sync</div><div class="v">${pendingCount()}</div><div class="s">${db.settings.scriptUrl ? 'auto when online' : 'set URL in Settings'}</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Recent tests</h3><button class="btn sm sec" onclick="go('tests')">See all</button></div>
    ${recent.length ? `<div class="tbl-wrap"><table><tr><th>Date</th><th>Class</th><th>Subject</th><th class="num">Total</th><th class="num">Avg</th><th>Teacher</th></tr>
    ${recent.map(t => `<tr><td>${fmtD(t.date)}</td><td>${esc(testCk(t))}</td><td>${esc(t.subject)}</td><td class="num">${t.total}</td><td class="num">${p1(classAvg([t]))}</td><td>${esc(t.teacherName)}</td></tr>`).join('')}</table></div>`
    : '<div class="empty">No tests yet. Tap “Enter today\'s test”.</div>'}</div>`;
}

/* ------------------------------------------------------------------ test entry */
function viewEntry() {
  const edit = STATE.editId ? db.tests.find(t => t.id === STATE.editId) : null;
  const classes = edit ? [...new Set([...myClasses(), testCk(edit)])] : myClasses();
  const cls = edit ? testCk(edit) : (STATE.entryCls && classes.includes(STATE.entryCls) ? STATE.entryCls : classes[0]);
  const subsFor = c => { const l = subjectsForClass(c, mySubjects()); return edit && c === testCk(edit) && !l.includes(edit.subject) ? [...l, edit.subject] : l; };
  const subjects = subsFor(cls);
  app().innerHTML = `<div class="card"><div class="card-h"><h2>${edit ? 'Edit test' : 'Daily test entry'} <span class="ur">روزانہ ٹیسٹ اندراج</span></h2></div>
    <div class="row">
      <div><label>1 · Class <span class="ur">کلاس</span></label><select id="eCls">${opts(classes, cls)}</select></div>
      <div><label>2 · Subject <span class="ur">مضمون</span></label><select id="eSub">${opts(subjects, edit ? edit.subject : STATE.entrySub)}<option value="__add">➕ Add subject…</option></select>
        <div id="eSubAdd" class="addsub hidden"><input id="eSubNew" placeholder="New subject, e.g. Computer Science" maxlength="40"><button class="btn sm" id="eSubSave">Add</button><button class="btn sm sec" id="eSubX">✕</button></div></div>
      <div><label>3 · Test date <span class="ur">تاریخ</span></label><input type="date" id="eDate" value="${edit ? edit.date : (STATE.entryDate || today())}"></div>
      <div><label>4 · Total marks <span class="ur">کل نمبر</span></label><input type="number" id="eTotal" min="1" inputmode="numeric" value="${edit ? edit.total : (STATE.entryTotal || '')}" placeholder="e.g. 25"></div>
    </div></div>
  <div class="card"><div class="card-h"><h3>Students <span class="ur">طلبہ</span></h3><span class="muted">Tick <b>Leave</b> (or leave marks empty) for a student on leave · <span class="ur">چھٹی</span></span></div>
    <input id="eQ" type="search" placeholder="🔍 Find a student by name or roll" class="esearch">
    <div class="tbl-wrap"><table id="eTbl"><thead><tr><th style="width:90px">Roll # <span class="ur">رول</span></th><th>Name <span class="ur">نام</span></th><th style="width:110px">Obtained <span class="ur">حاصل</span></th><th style="width:76px">Leave <span class="ur">چھٹی</span></th><th class="num" style="width:70px">%</th><th style="width:40px"></th></tr></thead><tbody></tbody></table></div>
    <button class="btn sec sm" id="addRow">+ Add student</button><button class="btn sec sm" id="toMyStu" onclick="go('mystudents', {myStuCls: document.getElementById('eCls').value, scrollTo: 'msForm'})">🎓 Add student to class list</button>
    <div id="eSummary" class="muted" style="margin-top:10px"></div>
    <div style="margin-top:8px"><button class="btn big" id="saveTest">${edit ? '💾 Save changes' : '✅ Submit marks'}</button>${edit ? '<button class="btn sec" id="cancelEdit">Cancel</button>' : ''}</div>
  </div>`;
  const tbody = $('#eTbl tbody');
  const addRow = (r = {}) => { const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="eRoll" value="${esc(r.roll)}" inputmode="numeric" placeholder="Roll" aria-label="Roll number"></td><td><input class="eName" value="${esc(r.name)}" placeholder="Student name" aria-label="Name"></td>
      <td><input class="eObt" value="${r.obt == null ? '' : r.obt}" inputmode="decimal" placeholder="Marks" aria-label="Obtained marks" ${r.leave ? 'disabled' : ''}></td><td><label class="leave"><input type="checkbox" class="eLeave" ${r.leave ? 'checked' : ''}><span>Leave</span></label></td><td class="num ePct"></td><td><button class="btn red sm eDel" title="Remove">✕</button></td>`;
    tbody.appendChild(tr); $('.eDel', tr).onclick = () => { tr.remove(); recalc(); }; $$('input', tr).forEach(i => i.oninput = recalc);
    $('.eLeave', tr).onchange = e => { const o = $('.eObt', tr); o.disabled = e.target.checked; if (e.target.checked) o.value = ''; tr.classList.toggle('onleave', e.target.checked); recalc(); }; tr.classList.toggle('onleave', !!r.leave); };
  const loadRoster = () => { tbody.innerHTML = ''; const roster = db.students[$('#eCls').value] || [];
    if (edit && $('#eCls').value === testCk(edit)) { edit.rows.forEach(r => addRow({...r, leave: r.obt == null})); roster.filter(s => !edit.rows.some(r => r.roll === s.roll)).forEach(s => addRow(s)); }
    else if (roster.length) roster.forEach(s => addRow(s)); else for (let i = 0; i < 5; i++) addRow({roll: String(i + 1)});
    recalc(); };
  $('#eQ').oninput = () => { const q = $('#eQ').value.trim().toLowerCase(); $$('#eTbl tbody tr').forEach(tr => { const t = ($('.eRoll', tr).value + ' ' + $('.eName', tr).value + ' ' + rosterFather($('#eCls').value, $('.eRoll', tr).value.trim())).toLowerCase(); tr.classList.toggle('hidden', !!q && !q.split(/\s+/).every(w => t.includes(w))); }); };
  function recalc() {
    const total = parseFloat($('#eTotal').value); let sum = 0, n = 0, ab = 0, bad = 0, npass = 0;
    let empty = 0;
    $$('#eTbl tbody tr').forEach(tr => { const v = $('.eObt', tr).value.trim(); const cell = $('.ePct', tr); const lv = $('.eLeave', tr).checked || /^[al]$/i.test(v);
      if (lv) { cell.innerHTML = '<span class="badge warn">Leave</span>'; ab++; return; }
      if (v === '') { cell.textContent = ''; if ($('.eName', tr).value.trim()) empty++; return; }
      const o = parseFloat(v); if (isNaN(o) || (total && o > total) || o < 0) { cell.innerHTML = '<span class="down">check</span>'; bad++; return; }
      n++; sum += o; const pc = total ? o / total * 100 : null; if (pc != null && isPass(pc, $('#eSub').value)) npass++; cell.innerHTML = total ? `${p1(pc)} ${passBadge(pc, $('#eSub').value)}` : ''; });
    $('#eSummary').innerHTML = total ? `Students with marks: <b>${n}</b> · Leave: <b>${ab}</b>${empty ? ` (+${empty} empty → leave)` : ''} · Class average: <b>${n ? p1(sum / n / total * 100) : '–'}</b> · Pass (≥${passMark($('#eSub').value)}%): <b class="up">${npass}</b> · Fail: <b class="down">${n - npass}</b>${bad ? ` · <span class="down">${bad} invalid</span>` : ''}` : 'Enter total marks to see percentages.';
  }
  $('#eCls').onchange = () => { STATE.entryCls = $('#eCls').value; loadRoster();
    const sel = $('#eSub'), cur = sel.value, l = subsFor(STATE.entryCls); // each class shows its own subjects (e.g. Class 8: Urdu, English, Islamiat, Mathematics, Science)
    sel.innerHTML = opts(l, l.includes(cur) ? cur : (l.includes(STATE.entrySub) ? STATE.entrySub : l[0])) + '<option value="__add">➕ Add subject…</option>';
    prevSub = sel.value; STATE.entrySub = prevSub; recalc(); };
  let prevSub = $('#eSub').value === '__add' ? '' : $('#eSub').value;
  const closeAdd = () => { $('#eSubAdd').classList.add('hidden'); if ($('#eSub').value === '__add') $('#eSub').value = prevSub; };
  $('#eSub').onchange = () => { if ($('#eSub').value === '__add') { $('#eSubAdd').classList.remove('hidden'); $('#eSubNew').focus(); } else { prevSub = $('#eSub').value; STATE.entrySub = prevSub; closeAdd(); } };
  $('#eSubX').onclick = closeAdd;
  $('#eSubNew').onkeydown = e => { if (e.key === 'Enter') $('#eSubSave').click(); };
  $('#eSubSave').onclick = () => { try { const r = addSubject($('#eSubNew').value); const sel = $('#eSub');
      if (![...sel.options].some(o => o.value === r.name)) sel.insertBefore(new Option(r.name, r.name), sel.querySelector('option[value="__add"]'));
      { const g = splitCk($('#eCls').value).grade; const m = (db.classSubjects || {})[g]; if (m && !m.includes(r.name)) { m.push(r.name); save(); } }
      sel.value = r.name; prevSub = STATE.entrySub = r.name; $('#eSubNew').value = ''; $('#eSubAdd').classList.add('hidden');
      toast(r.existed ? `"${r.name}" already exists – selected it` : `Subject "${r.name}" added ✓${online() ? '' : ' (will sync when online)'}`); } catch (e) { toast(e.message); } };
  $('#eTotal').oninput = recalc; $('#addRow').onclick = () => { const rolls = $$('.eRoll').map(i => parseInt(i.value)).filter(n => !isNaN(n)); addRow({roll: String(rolls.length ? Math.max(...rolls) + 1 : 1)}); };
  if (edit) $('#cancelEdit').onclick = () => { STATE.editId = null; go('tests'); };
  $('#saveTest').onclick = () => {
    const date = $('#eDate').value, cls = $('#eCls').value, subject = $('#eSub').value, total = parseFloat($('#eTotal').value);
    if (!date || !cls || !subject || subject === '__add') return toast('Choose date, class and subject');
    if (!(total > 0)) return toast('Enter total marks');
    const rows = [], emptyRows = []; let err = '';
    $$('#eTbl tbody tr').forEach(tr => { const roll = $('.eRoll', tr).value.trim(), name = $('.eName', tr).value.trim(), v = $('.eObt', tr).value.trim();
      if (!roll && !name) return; if (!roll || !name) { err = 'Each student needs roll # and name'; return; }
      const lv = $('.eLeave', tr).checked || /^[al]$/i.test(v); if (!lv && v === '') emptyRows.push(`#${roll} ${name}`);
      let obt = null; if (!lv && v !== '') { obt = parseFloat(v); if (isNaN(obt) || obt < 0 || obt > total) { err = `Marks for ${name} must be 0–${total}`; return; } }
      if (rows.some(r => r.roll === roll)) { err = `Roll # ${roll} is repeated`; return; }
      rows.push({roll, name, obt, status: obt == null ? 'leave' : 'present'}); });
    if (err) return toast(err); if (!rows.length) return toast('Add at least one student');
    if (emptyRows.length && !confirm(`No marks entered for ${emptyRows.length} student(s). They will be counted as LEAVE (چھٹی) for this test:\n\n${emptyRows.join('\n')}\n\nSave anyway?`)) return;
    const {grade: g, section} = splitCk(cls); const m = me();
    const dup = db.tests.find(t => t.id !== (edit && edit.id) && t.date === date && testCk(t) === cls && t.subject === subject);
    if (dup && !confirm(`A ${subject} test for ${cls} on ${fmtD(date)} already exists. Save another one?`)) return;
    const rec = {id: edit ? edit.id : uid(), date, grade: g, section, subject, total, rows, teacherId: edit ? edit.teacherId : m.id,
      teacherName: edit ? edit.teacherName : m.name, synced: false, updatedAt: new Date().toISOString()};
    if (edit) Object.assign(edit, rec); else db.tests.push(rec);
    rememberRoster(cls, rows); Object.assign(STATE, {entryCls: cls, entrySub: subject, entryDate: date, entryTotal: total, editId: null}); save();
    const nM = rows.filter(r => r.obt != null).length, nL = rows.length - nM;
    toast(edit ? 'Test updated ✓' : `✅ Marks submitted: ${subject}, ${cls} – ${nM} students${nL ? ` + ${nL} on leave` : ''}. ${online() ? 'Syncing…' : 'Saved offline – will sync when online.'}`); syncNow(false); go(edit ? 'tests' : 'entry');
  };
  loadRoster();
}

/* ------------------------------------------------------------------ tests list */
function viewTests() {
  const f = STATE.tf || {}; const list = testsIn({cls: f.cls, subject: f.sub, from: f.from || undefined, to: f.to || undefined}).reverse();
  app().innerHTML = `<div class="card"><div class="card-h"><h2>All tests <span class="ur">تمام ٹیسٹ</span></h2><span class="muted">${list.length} tests</span></div>
    <div class="filters"><select id="tfCls">${opts(allClassKeys(), f.cls, 'All classes')}</select><select id="tfSub">${opts(allSubjects(), f.sub, 'All subjects')}</select>
      <label class="mini">From <input type="date" id="tfFrom" value="${esc(f.from || '')}"></label><label class="mini">To <input type="date" id="tfTo" value="${esc(f.to || '')}"></label>
      <input id="tfQ" type="search" placeholder="🔍 Search student, roll, father, teacher…" value="${esc(f.q || '')}"></div>
    ${list.length ? `<div class="tbl-wrap"><table><tr><th>Date</th><th>Class</th><th>Subject</th><th class="num">Total</th><th class="num">Students</th><th class="num">Avg</th><th>Teacher</th><th>Sync</th><th></th></tr>
    ${list.map(t => `<tr data-q="${esc([t.subject, t.teacherName, testCk(t), ...t.rows.flatMap(r => [r.roll, r.name, rosterFather(testCk(t), r.roll)])].join(' ').toLowerCase())}"><td>${fmtD(t.date)}</td><td>${esc(testCk(t))}</td><td>${esc(t.subject)}</td><td class="num">${t.total}</td><td class="num">${t.rows.length}</td><td class="num">${p1(classAvg([t]))}</td><td>${esc(t.teacherName)}${t.updatedBy && t.updatedBy !== t.teacherName ? `<br><small class="muted">edited by ${esc(t.updatedBy)}</small>` : ''}</td>
      <td>${t.synced ? '<span class="badge">✓</span>' : '<span class="badge warn">queued</span>'}</td>
      <td style="white-space:nowrap">${canEditTest(t) ? `<button class="btn sm sec" data-edit="${t.id}">Edit</button><button class="btn sm red" data-del="${t.id}">Delete</button>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">No tests found.</div>'}</div>`;
  $('#tfCls').onchange = $('#tfSub').onchange = $('#tfFrom').onchange = $('#tfTo').onchange = () => { STATE.tf = {cls: $('#tfCls').value, sub: $('#tfSub').value, from: $('#tfFrom').value, to: $('#tfTo').value, q: $('#tfQ').value}; render(); };
  const qf = () => { const q = $('#tfQ').value.trim().toLowerCase(); (STATE.tf = STATE.tf || {}).q = q; $$('tr[data-q]').forEach(r => r.classList.toggle('hidden', !!q && !q.split(/\s+/).every(w => r.dataset.q.includes(w)))); };
  $('#tfQ').oninput = qf; qf();
  $$('[data-edit]').forEach(b => b.onclick = () => go('entry', {editId: b.dataset.edit}));
  $$('[data-del]').forEach(b => b.onclick = () => { if (!confirm('Delete this test?')) return; const t = db.tests.find(x => x.id === b.dataset.del);
    db.tests = db.tests.filter(x => x !== t); if (t.synced) db.deleted.push(t.id); save(); syncNow(false); render(); });
}
function rosterFather(c, roll) { const s = (db.students[c] || []).find(x => x.roll === String(roll)); return s ? s.father || '' : ''; }

/* ------------------------------------------------------------------ settings (profile, sync, backup) */
const SHEET_COLS = ['date', 'teacher', 'class', 'section', 'subject', 'roll_no', 'student_name', 'obtained', 'total', 'status', 'test_id'];
function csvCell(v) { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCSV(rows) { return [SHEET_COLS.join(',')].concat(rows.map(r => SHEET_COLS.map(c => csvCell(r[c])).join(','))).join('\n'); }
function parseCSV(text) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; } else cur += c; }
  if (cur || row.length) { row.push(cur); out.push(row); }
  const h = out.shift().map(x => x.trim().toLowerCase()); return out.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function chipsHTML(id, all, sel) { return `<div class="chips" id="${id}">${all.map(v => `<label class="chip ${sel.includes(v) ? 'on' : ''}"><input type="checkbox" value="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</div>`; }
function bindChips(id) { $$(`#${id} input`).forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked)); }
// ---- backup / export (also used by the Admin screen)
function backupJSON() { const safe = {...db, users: db.users.map(({hash, salt, secA, ...u}) => u), settings: {...db.settings, reportKey: ''}};
  download(`albilal-backup-${today()}.json`, JSON.stringify(safe, null, 1), 'application/json'); }
function exportCSV() { download(`albilal-results-${today()}.csv`, toCSV(db.tests.flatMap(flatRows)), 'text/csv'); }
async function importFile(f) {
  const text = await f.text();
  if (f.name.endsWith('.csv')) { const before = db.tests.length; mergeRemoteRows(parseCSV(text)); db.tests.forEach(t => { if (!t.teacherId && !t.synced) t.synced = false; }); save(); return `Imported ${db.tests.length - before} new tests`; }
  const d = JSON.parse(text); let n = 0;
  (d.tests || []).forEach(t => { if (!db.tests.some(x => x.id === t.id)) { db.tests.push({...t, synced: false}); rememberRoster(testCk(t), t.rows); n++; } });
  (d.classes || []).forEach(c => { if (!db.classes.some(x => ck(x) === ck(c))) db.classes.push(c); });
  (d.subjects || []).forEach(s => { if (!db.subjects.includes(s)) db.subjects.push(s); });
  Object.entries(d.students || {}).forEach(([k, list]) => list.forEach(s => { const r = db.students[k] = db.students[k] || []; const ex = r.find(x => x.roll === s.roll); if (!ex) { const {pin, ...rest} = s; r.push(rest); } }));
  db.settings.rosterDirty = true; save(); return `Imported ${n} tests`;
}
function backupHTML() {
  return `<div class="card"><h2>Backup &amp; export <span class="ur">بیک اپ</span></h2>
    <p class="muted">Works without internet: export a backup and import it on another phone/PC (WhatsApp or USB). Import merges data. Passwords are never included.</p>
    <button class="btn sec" id="bJson">⬇ Backup (.json)</button><button class="btn sec" id="bCsv">⬇ Export CSV (Sheet format)</button>
    <label class="btn sec" style="display:inline-flex">⬆ Import backup / CSV<input type="file" id="bImp" accept=".json,.csv" hidden></label></div>`;
}
function bindBackup() {
  $('#bJson').onclick = backupJSON; $('#bCsv').onclick = exportCSV;
  $('#bImp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { toast(await importFile(f)); render(); } catch (err) { toast('Import failed: ' + err.message); } };
}
function passwordHTML() {
  return `<div class="card"><h2>Change password <span class="ur">پاس ورڈ تبدیل کریں</span></h2>
    <div class="row"><div><label>Old password</label><input id="cpOld" type="password" autocomplete="current-password"></div><div><label>New password (6+)</label><input id="cpNew" type="password" autocomplete="new-password"></div></div>
    <label>Repeat new password</label><input id="cpNew2" type="password" autocomplete="new-password">
    <button class="btn" id="cpSave">Change password</button><p class="muted">Other phones where you are logged in will be signed out.</p></div>`;
}
function bindPassword(after) {
  $('#cpSave').onclick = async () => { const o = $('#cpOld').value, n = $('#cpNew').value; if (n !== $('#cpNew2').value) return toast('New passwords do not match');
    try { await changePassword(o, n); ['#cpOld', '#cpNew', '#cpNew2'].forEach(s => $(s).value = ''); toast('Password changed ✓'); if (after) after(); } catch (e) { toast(e.message); } };
}
function viewSettings() {
  const u = sessionUser(), stu = u.role === 'student';
  if (u.mustChange) { app().innerHTML = `<div class="card annbar pin" style="cursor:default"><b>🔑 Please set a new password</b> – the admin gave you a temporary password. <span class="ur">نیا پاس ورڈ بنائیں</span></div>` + passwordHTML() + '<div class="card"><button class="btn red" id="pOut">Log out</button></div>';
    bindPassword(() => render()); $('#pOut').onclick = () => logout(); return; }
  app().innerHTML = (stu ? `<div class="card"><h2>My account <span class="ur">میرا اکاؤنٹ</span></h2><p><b>${esc(u.name)}</b> · ${esc(u.cls)} · Roll # ${esc(u.roll)} · username <code>${esc(u.username)}</code></p>
      <label>Recovery email (optional) <span class="ur">ای میل</span></label><input id="pEmail" type="email" inputmode="email" autocapitalize="none" value="${esc(u.email || '')}" placeholder="for a password reset code">
      <button class="btn" id="pSave">Save</button><button class="btn sec" onclick="syncNow(true)">⟳ Sync now</button><button class="btn red" id="pOut">Log out</button></div>` :
    `<div class="card"><h2>My profile <span class="ur">میری معلومات</span></h2>
    <div class="row"><div><label>Name</label><input id="pName" value="${esc(u.name)}"></div><div><label>Phone</label><input id="pPhone" value="${esc(u.phone || '')}"></div></div>
    <label>Recovery email ${u.role === 'owner' ? '*' : '(optional)'} <span class="ur">ای میل</span></label><input id="pEmail" type="email" inputmode="email" autocapitalize="none" value="${esc(u.email || '')}" placeholder="for a password reset code">
    <label>Subjects I teach <span class="ur">میرے مضامین</span></label>${chipsHTML('pSub', db.subjects, u.subjects || [])}
    <label>Classes I teach <span class="ur">میری کلاسیں</span></label>${chipsHTML('pCls', db.classes.map(ck), u.classes || [])}
    <p class="muted">Nothing selected = all. The owner edits the class &amp; subject lists in the Admin screen.</p>
    <button class="btn" id="pSave">Save profile</button><button class="btn red" id="pOut">Log out</button></div>`) +
    passwordHTML() +
    `<div class="card"><h2>Online sync <span class="ur">آن لائن ہم آہنگی</span></h2>
    <label>Google Apps Script Web App URL</label><input id="sUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(db.settings.scriptUrl)}" ${isOwner() || !db.settings.scriptUrl ? '' : 'readonly'}>
    <p class="muted">Everything is saved on this phone first and sent to the school Google Sheet when internet is available. Logins work on any phone once sync is set up.<br>
    Last sync: ${db.settings.lastSync ? new Date(db.settings.lastSync).toLocaleString() : 'never'} · Waiting: ${pendingCount()}</p>
    <button class="btn" id="sSave">Save URL</button><button class="btn sec" onclick="syncNow(true)">⟳ Sync now</button><button class="btn sec" id="sPull">⬇ Download latest</button></div>` +
    (stu ? '' : backupHTML());
  bindPassword(); $('#pOut').onclick = () => logout(); if (STATE.focusPw) { STATE.focusPw = false; const pc = document.querySelector('#cpOld'); if (pc) { pc.scrollIntoView({block: 'center'}); pc.focus(); } } $('#sPull').onclick = () => pullNow(true);
  $('#sSave').onclick = async () => { db.settings.scriptUrl = $('#sUrl').value.trim(); save(); toast('Saved');
    try { const s = await getJSON({action: 'status'}); db.settings.serverHasOwner = !!s.has_owner; const ow = db.users.find(x => x.role === 'owner' && !x.remote);
      if (!s.has_owner && ow && ow.hash) ow.ownerQueued = true; save(); } catch (e) {} syncNow(true); };
  const saveEmail = () => { u.email = cleanEmail($('#pEmail').value, u.role === 'owner'); };
  if (stu) { $('#pSave').onclick = () => { try { saveEmail(); } catch (e) { return toast(e.message); } u.profileDirty = true; save(); syncNow(false); toast('Saved ✓'); render(); }; return; }
  bindChips('pSub'); bindChips('pCls'); bindBackup();
  $('#pSave').onclick = () => { try { saveEmail(); } catch (e) { return toast(e.message); } u.name = $('#pName').value.trim() || u.name; u.phone = $('#pPhone').value.trim();
    u.subjects = $$('#pSub input:checked').map(i => i.value); u.classes = $$('#pCls input:checked').map(i => i.value); u.profileDirty = true; save(); syncNow(false); toast('Profile saved ✓'); render(); };
}

/* ------------------------------------------------------------------ boot */
load();
try { const q = new URLSearchParams(location.search).get('sync'); if (q && /^https:\/\/script\.google(usercontent)?\.com\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(q)) { db.settings.scriptUrl = q; save(); history.replaceState(null, '', location.pathname + location.hash); } } catch (e) {}
if (!db.settings.scriptUrl && DEFAULT_SCRIPT_URL) db.settings.scriptUrl = DEFAULT_SCRIPT_URL;
Object.assign(window, {go, syncNow, pullNow, logout});
$('#hdrLogout').onclick = () => logout();
$('#userBtn').onclick = e => { e.stopPropagation(); renderUserMenu(); const d = $('#userMenu'), open = d.classList.toggle('hidden'); $('#userBtn').setAttribute('aria-expanded', String(!open)); };
document.addEventListener('click', e => { if (!e.target.closest('#umenuWrap')) closeUserMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeUserMenu(); $('#modal').classList.add('hidden'); } });
$('#bell').onclick = () => go('ann');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
VIEW = hashView() || 'home';
async function boot() {
  if (online()) { // public info first: does an owner exist? school name/logo, public announcements
    try { const p = await Promise.race([getJSON({action: 'public'}), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
      if (p.ok) { applyServerSettings(p.settings || {}); mergeAnn(p.announcements || [], true); if (Array.isArray(p.honor)) db.publicHonor = p.honor; }
      const s = await getJSON({action: 'status'}); if (s.ok) db.settings.serverHasOwner = !!s.has_owner; save();
    } catch (e) { console.warn('status check failed', e); }
  }
  render();
  if (online()) syncNow(false).then(() => { if (!sessionUser() || !$('input:focus')) render(); });
}
boot();

export {db, $, $$, esc, uid, ymd, parseD, addDays, today, fmtD, pct, p1, r1, grade, gradeBadge, toast, weekRange, monthRange, daysBetween,
  save, ck, splitCk, testCk, me, isAdmin, isOwner, myClasses, canEditTest, mySubjects, allClassKeys, allSubjects, applyBranding, testsIn, classAvg, go, STATE,
  render, app, opts, meStudent, sessionUser, updateNotesBadge, postJSON, getJSON, hashPw, logout, chipsHTML, bindChips, download, toCSV, flatRows, syncNow, pullNow, pendingCount,
  DEFAULT_NAME, rememberRoster, setUserStatus, adminResetPassword, adminSetEmail, fullName, splitName, contactHTML, SEC_QS, isLeave, backupHTML, bindBackup, backupJSON, exportCSV, online, getToken, annFor, annUnread, annVisible, updateBell, bindAnnFiles,
  passMark, isPass, passBadge, subjectsForClass, loadMod, approved, newPin, VIEW_NAME, mergeAnn, addSubject, addRosterStudent, renameSubjectLocal, tilesHTML, landingFor, contactInfo, waLink, honorMiniHTML};
function VIEW_NAME() { return VIEW; }
