/* Albilal School System – Notes / Study Material (lazy-loaded).
   Files are kept in IndexedDB on the device (offline reading + offline upload queue)
   and uploaded to Google Drive through the Apps Script when online. */
import {db, $, $$, esc, uid, fmtD, toast, save, me, isAdmin, myClasses, mySubjects, subjectsForClass, allClassKeys, allSubjects, STATE, render, app, opts,
  meStudent, sessionUser, updateNotesBadge, postJSON, getJSON, syncNow, logout} from './app.js';

const MAX = 10 * 1024 * 1024; // 10 MB
/* ---- tiny IndexedDB wrapper */
let dbp = null;
function idb() { return dbp = dbp || new Promise((res, rej) => { const r = indexedDB.open('albilal_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbDo(mode, fn) { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction('files', mode); const req = fn(tx.objectStore('files')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); }); }
const fget = id => idbDo('readonly', s => s.get(id));
const fput = (id, v) => idbDo('readwrite', s => s.put(v, id));
const fdel = id => idbDo('readwrite', s => s.delete(id));
const fkeys = () => idbDo('readonly', s => s.getAllKeys());
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });
const b64ToBlob = (b64, mime) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], {type: mime || 'application/octet-stream'}); };
const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const icon = n => n.kind === 'text' ? '📝' : /pdf/.test(n.mime) ? '📕' : /image/.test(n.mime) ? '🖼️' : /word|document/.test(n.mime) ? '📄' : /sheet|excel/.test(n.mime) ? '📊' : /presentation|powerpoint/.test(n.mime) ? '📽️' : '📎';

/* ---- called by syncNow(): push queued notes (with their files) to Apps Script */
export async function uploadPendingNotes(url) {
  for (const n of db.notes.filter(x => !x.synced)) {
    const f = n.kind === 'file' ? await fget(n.id) : null;
    if (n.kind === 'file' && !f) { console.warn('file missing for note', n.id); continue; }
    const res = await postJSON(url, {action: 'note', note: {note_id: n.id, class: n.cls.slice(0, n.cls.lastIndexOf(' ')), section: n.cls.slice(n.cls.lastIndexOf(' ') + 1), subject: n.subject,
      title: n.title, description: n.desc || '', kind: n.kind, text: n.text || '', file_name: n.fileName || '', mime: n.mime || '', size: n.size || 0, teacher: n.teacherName, created_at: n.createdAt,
      data: f ? await blobToB64(f.blob) : ''}});
    if (!res || res.ok === false) throw new Error(res && res.error || 'note upload failed');
    Object.assign(n, {synced: true, fileId: res.file_id || n.fileId, url: res.file_url || n.url}); save();
  }
}

/* ---- view */
export async function viewNotes() {
  const t = me(), stu = meStudent(), u = sessionUser();
  const classes = stu ? [stu.cls] : (isAdmin() ? allClassKeys() : myClasses());
  const fCls = stu ? stu.cls : (STATE.nCls ?? ''), fSub = STATE.nSub || '';
  const seenBefore = db.settings.notesSeen[u.id] || '';
  const list = db.notes.filter(n => (!fCls || n.cls === fCls) && (!fSub || n.subject === fSub) && (stu || isAdmin() || !t.classes || !t.classes.length || t.classes.includes(n.cls) || n.teacherId === t.id))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const cached = new Set(await fkeys().catch(() => []));
  const subsHere = [...new Set(db.notes.filter(n => !fCls || n.cls === fCls).map(n => n.subject))];
  app().innerHTML = `
  ${t ? `<div class="card"><div class="card-h"><h2>Share notes / study material <span class="ur">نوٹس اپ لوڈ کریں</span></h2></div>
    <div class="filters"><div><label>Class &amp; section</label><select id="uCls">${opts(classes, STATE.uCls)}</select></div><div><label>Subject</label><select id="uSub">${opts(subjectsForClass(classes.includes(STATE.uCls) ? STATE.uCls : classes[0], mySubjects()), STATE.uSub)}</select></div>
      <div><label>Type</label><select id="uKind"><option value="file">File (PDF, image, document)</option><option value="text" ${STATE.uKind === 'text' ? 'selected' : ''}>Text note</option></select></div></div>
    <label>Title <span class="ur">عنوان</span></label><input id="uTitle" placeholder="e.g. Chapter 3 – Kinematics summary">
    <label>Description (optional) <span class="ur">تفصیل</span></label><input id="uDesc" placeholder="What is it, which pages to read…">
    <div id="uFileBox" class="${STATE.uKind === 'text' ? 'hidden' : ''}"><label>File (max 10 MB)</label><div class="drop"><input type="file" id="uFile" accept=".pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"></div></div>
    <div id="uTextBox" class="${STATE.uKind === 'text' ? '' : 'hidden'}"><label>Notes text</label><textarea id="uText" rows="6" placeholder="Type or paste notes here…"></textarea></div>
    <button class="btn" id="uSave">📤 Post</button><span class="muted"> Offline? It is queued and uploads automatically when internet returns.</span></div>` :
    `<div class="card"><div class="card-h"><h2>📚 Notes for ${esc(stu.cls)} <span class="ur">نوٹس</span></h2><button class="btn sm red" onclick="logout()">Log out</button></div><div class="muted">Hi ${esc(stu.name)} (Roll ${esc(stu.roll)}). Opened files are saved on this phone for offline reading.</div></div>`}
  <div class="card"><div class="card-h"><h3>Notes ${list.length ? `(${list.length})` : ''}</h3><button class="btn sm sec" onclick="syncNow(true)">⟳ Refresh</button></div>
    <div class="filters">${stu ? '' : `<select id="nCls">${opts(classes, fCls, 'All classes')}</select>`}<select id="nSub">${opts(subsHere, fSub, 'All subjects')}</select></div>
    ${list.length ? list.map(n => `<div class="note ${(n.createdAt || '') > seenBefore && n.teacherName !== u.name ? 'new' : ''}">
      <div class="nh"><div style="display:flex;gap:10px"><div class="ficon">${icon(n)}</div><div><h4>${esc(n.title)} ${(n.createdAt || '') > seenBefore && n.teacherName !== u.name ? '<span class="nbadge">NEW</span>' : ''}</h4>
        <div class="muted">${esc(n.subject)} · ${esc(n.cls)} · by ${esc(n.teacherName)} · ${n.createdAt ? fmtD(n.createdAt.slice(0, 10)) : ''}${n.kind === 'file' ? ` · ${esc(n.fileName)} (${size(n.size)})` : ''}</div></div></div>
        <div>${n.synced ? '' : '<span class="badge warn">waiting to upload</span> '}${cached.has(n.id) ? '<span class="badge">✓ offline</span>' : ''}</div></div>
      ${n.desc ? `<div style="margin-top:6px">${esc(n.desc)}</div>` : ''}${n.kind === 'text' ? `<div class="txt">${esc(n.text)}</div>` : ''}
      <div>${n.kind === 'file' ? `<button class="btn sm" data-open="${n.id}">👁️ View</button><button class="btn sm sec" data-dl="${n.id}">⬇ Download</button>` : ''}
      ${t && (isAdmin() || n.teacherId === t.id) ? `<button class="btn sm red" data-ndel="${n.id}">Delete</button>` : ''}</div>
      <div class="viewer" id="v_${n.id}"></div></div>`).join('') : '<div class="empty">No notes yet.</div>'}</div>`;
  // mark as seen (badge clears; NEW labels stay until next visit)
  const newest = db.notes.map(n => n.createdAt || '').sort().pop(); if (newest && newest > seenBefore) { db.settings.notesSeen[u.id] = newest; save(); updateNotesBadge(); }
  if (t) {
    $('#uCls').onchange = () => { const sel = $('#uSub'), cur = sel.value, l = subjectsForClass($('#uCls').value, mySubjects()); sel.innerHTML = opts(l, l.includes(cur) ? cur : l[0]); };
    $('#uKind').onchange = () => { STATE.uKind = $('#uKind').value; $('#uFileBox').classList.toggle('hidden', STATE.uKind === 'text'); $('#uTextBox').classList.toggle('hidden', STATE.uKind !== 'text'); };
    $('#uSave').onclick = async () => {
      const kind = $('#uKind').value, title = $('#uTitle').value.trim(), cls = $('#uCls').value, subject = $('#uSub').value;
      if (!title) return toast('Add a title'); const n = {id: uid(), cls, subject, title, desc: $('#uDesc').value.trim(), kind, teacherName: t.name, teacherId: t.id, createdAt: new Date().toISOString(), synced: false};
      if (kind === 'text') { n.text = $('#uText').value.trim(); if (!n.text) return toast('Type the notes text'); }
      else { const f = $('#uFile').files[0]; if (!f) return toast('Choose a file'); if (f.size > MAX) return toast('File is larger than 10 MB');
        Object.assign(n, {fileName: f.name, mime: f.type || 'application/octet-stream', size: f.size}); await fput(n.id, {blob: f, name: f.name, mime: n.mime}); }
      db.notes.push(n); Object.assign(STATE, {uCls: cls, uSub: subject}); db.settings.notesSeen[t.id] = n.createdAt; save();
      toast(navigator.onLine && db.settings.scriptUrl ? 'Posted – uploading…' : 'Saved – will upload when online'); render(); syncNow(false).then(() => { if (location.hash === '#notes') render(); });
    };
    $('#nCls').onchange = () => { STATE.nCls = $('#nCls').value; render(); };
  }
  $('#nSub').onchange = () => { STATE.nSub = $('#nSub').value; render(); };
  $$('[data-open]').forEach(b => b.onclick = () => openNote(b.dataset.open, false));
  $$('[data-dl]').forEach(b => b.onclick = () => openNote(b.dataset.dl, true));
  $$('[data-ndel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this note for everyone?')) return; const n = db.notes.find(x => x.id === b.dataset.ndel);
    db.notes = db.notes.filter(x => x !== n); if (n.synced) db.deletedNotes.push(n.id); await fdel(n.id).catch(() => {}); save(); syncNow(false); render(); });
}

async function getFile(n) {
  let f = await fget(n.id).catch(() => null); if (f) return f;
  const url = db.settings.scriptUrl;
  if (!navigator.onLine || !url || !n.fileId) return null;
  toast('Downloading…');
  const res = await getJSON({action: 'file', id: n.fileId});
  if (!res.ok) throw new Error(res.error || 'download failed');
  f = {blob: b64ToBlob(res.data, res.mime || n.mime), name: n.fileName, mime: res.mime || n.mime};
  await fput(n.id, f); return f; // cached for offline reading
}
async function openNote(id, download) {
  const n = db.notes.find(x => x.id === id); const box = $('#v_' + id);
  try {
    const f = await getFile(n);
    if (!f) { if (n.url && navigator.onLine) return window.open(n.url, '_blank'); return toast('Not saved on this device yet – open it once while online'); }
    const href = URL.createObjectURL(f.blob);
    if (download) { const a = document.createElement('a'); a.href = href; a.download = n.fileName || 'note'; a.click(); return toast('Saved ✓ (also available offline)'); }
    box.innerHTML = /image/.test(f.mime) ? `<img src="${href}" style="max-width:100%;border-radius:8px;margin-top:8px">`
      : /pdf/.test(f.mime) ? `<iframe src="${href}" style="width:100%;height:70vh;border:1px solid var(--bd);border-radius:8px;margin-top:8px"></iframe>`
      : `<p><a class="btn sm" href="${href}" download="${esc(n.fileName)}">Open ${esc(n.fileName)}</a></p>`;
    box.insertAdjacentHTML('afterbegin', `<button class="btn sm sec" style="margin-top:8px" onclick="this.parentElement.innerHTML=''">✕ Close</button>`);
  } catch (e) { toast('Could not open: ' + e.message); }
}
export {fget, fput, fdel, blobToB64, b64ToBlob, size, MAX};
