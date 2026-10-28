/* Announcements – lazy-loaded. Stored in the "Announcements" Sheet tab, cached on the phone for offline reading.
   Audience: all (also shown on the public login page) / teachers / one class+section. Developed by Toshan Rafiq */
import {db, $, $$, esc, uid, fmtD, today, toast, save, isOwner, allClassKeys, STATE, app, render, sessionUser, postJSON, getJSON, online, syncNow,
  annFor, annUnread, updateBell, bindAnnFiles, loadMod} from './app.js';
import {fget, fput, fdel, blobToB64, b64ToBlob, size, MAX} from './notes.js';

const canPost = u => u && (u.role === 'owner' || (u.role === 'teacher' && db.settings.teachersCanAnnounce === 'yes'));
const canEdit = (u, a) => u && (u.role === 'owner' || (u.role === 'teacher' && a.author === u.name && canPost(u)));
const audLabel = a => a === 'all' ? '🌐 Everyone' : a === 'teachers' ? '👩‍🏫 Teachers only' : '🏫 ' + a.replace(/^class:/, '');
const key = id => 'ann_' + id;

/* ---- called by syncNow() */
export async function uploadPendingAnn(url) {
  for (const id of db.deletedAnn.slice()) { const r = await postJSON(url, {action: 'ann_delete', ann_id: id}); if (r.ok || !r.auth) db.deletedAnn = db.deletedAnn.filter(x => x !== id); save(); }
  for (const a of db.announcements.filter(x => !x.synced)) {
    const f = a.newFile ? await fget(key(a.id)).catch(() => null) : null;
    const r = await postJSON(url, {action: 'ann_save', ann: {ann_id: a.id, title: a.title, message: a.message, audience: a.audience, pinned: a.pinned, expires: a.expires, created_at: a.createdAt,
      file_name: a.fileName || '', mime: a.mime || '', data: f ? await blobToB64(f.blob) : '', remove_file: !!a.removeFile}});
    if (!r.ok) { if (r.auth) return; toast('Announcement: ' + r.error); db.announcements = db.announcements.filter(x => x !== a); save(); continue; }
    Object.assign(a, {synced: true, newFile: false, removeFile: false, fileId: r.file_id || '', url: r.file_url || ''}); save();
  }
}
/* ---- attachments: cached in IndexedDB after the first view, so they open offline */
async function annFile(id) {
  const a = db.announcements.find(x => x.id === id); if (!a) throw new Error('not found');
  let f = await fget(key(id)).catch(() => null); if (f) return f;
  if (!a.fileId || !online()) throw new Error('Attachment available when online');
  const r = await getJSON({action: 'file', id: a.fileId}); if (!r.ok) throw new Error(r.error);
  f = {blob: b64ToBlob(r.data, r.mime || a.mime), name: a.fileName, mime: r.mime || a.mime}; await fput(key(id), f); return f;
}
export async function annFileURL(id) { return URL.createObjectURL((await annFile(id)).blob); }
export async function openAnnFile(id) { const f = await annFile(id); const u = URL.createObjectURL(f.blob); const l = document.createElement('a'); l.href = u; l.download = f.name || 'file'; l.target = '_blank'; l.click(); }

function formHTML(u, a) {
  const auds = ['all', 'teachers', ...allClassKeys().map(c => 'class:' + c)];
  return `<div class="card no-print" id="annForm"><h2>${a ? '✏️ Edit announcement' : '📣 New announcement'} <span class="ur">نیا اعلان</span></h2>
    <label>Title <span class="ur">عنوان</span></label><input id="aTitle" maxlength="120" value="${esc(a ? a.title : '')}">
    <label>Message <span class="ur">پیغام</span></label><textarea id="aMsg" rows="4" maxlength="4000">${esc(a ? a.message : '')}</textarea>
    <div class="row"><div><label>Who can see it? <span class="ur">کس کے لیے</span></label><select id="aAud">${auds.map(x => `<option value="${esc(x)}" ${(a ? a.audience : 'all') === x ? 'selected' : ''}>${esc(audLabel(x))}</option>`).join('')}</select></div>
      <div><label>Show until (optional) <span class="ur">آخری تاریخ</span></label><input id="aExp" type="date" value="${esc(a ? a.expires : '')}" min="${today()}"></div></div>
    <label class="chk"><input type="checkbox" id="aPin" ${a && a.pinned ? 'checked' : ''}> 📌 Pin to top (banner) <span class="ur">اوپر لگائیں</span></label>
    <label>Attachment or image (optional, max 10 MB)</label><input id="aFile" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt">
    ${a && a.fileName ? `<label class="chk"><input type="checkbox" id="aRm"> Remove current attachment (${esc(a.fileName)})</label>` : ''}
    <button class="btn" id="aSave">${a ? 'Save changes' : 'Publish'}</button>${a ? '<button class="btn sec" id="aCancel">Cancel</button>' : ''}
    <p class="muted">“Everyone” announcements also appear on the public login page. ${online() ? '' : '📴 Offline – it will be published when internet returns.'}</p></div>`;
}
export function viewAnn() {
  const u = sessionUser(); const editA = STATE.annEdit && db.announcements.find(x => x.id === STATE.annEdit);
  const seen = (db.settings.annSeen || {})[u.id] || '', unread = new Set(annUnread(u).map(a => a.id));
  const list = isOwner() ? db.announcements.slice().sort((a, b) => (b.pinned - a.pinned) || (b.createdAt || '').localeCompare(a.createdAt || '')) : annFor(u);
  app().innerHTML = (canPost(u) ? formHTML(u, editA) : '') + `<div class="card"><div class="card-h"><h2>📢 Announcements <span class="ur">اعلانات</span></h2><span class="muted">${list.length} total</span></div>
    ${list.length ? list.map(a => { const exp = a.expires && a.expires < today();
      return `<div class="ann ${a.pinned ? 'pin' : ''} ${exp ? 'expired' : ''}"><div class="card-h"><b>${a.pinned ? '📌 ' : ''}${esc(a.title)} ${unread.has(a.id) ? '<span class="nbadge">NEW</span>' : ''}</b>
        <span class="badge">${esc(audLabel(a.audience))}</span></div>
        <div class="muted">${esc(a.author || '')} · ${fmtD((a.createdAt || '').slice(0, 10))}${a.expires ? ` · ${exp ? 'expired' : 'until'} ${fmtD(a.expires)}` : ''}${a.synced ? '' : ' · ⏳ waiting to publish'}</div>
        <div style="white-space:pre-wrap;margin:6px 0">${esc(a.message)}</div>
        ${a.fileName && /^image\//.test(a.mime || '') ? `<img class="annimg" data-annimg="${esc(a.id)}" alt="${esc(a.fileName)}">` : a.fileName ? `<button class="btn sm sec" data-annfile="${esc(a.id)}">📎 ${esc(a.fileName)}</button>` : ''}
        ${canEdit(u, a) ? `<div class="no-print"><button class="btn sm sec" data-aedit="${esc(a.id)}">Edit</button><button class="btn sm red" data-adel="${esc(a.id)}">Delete</button></div>` : ''}</div>`; }).join('')
      : '<div class="empty">No announcements yet.</div>'}</div>`;
  bindAnnFiles(app());
  // mark as read (NEW badges stay visible on this screen until the next visit)
  db.settings.annSeen = db.settings.annSeen || {}; db.settings.annSeen[u.id] = new Date().toISOString(); save(); updateBell();
  $$('[data-aedit]').forEach(b => b.onclick = () => { STATE.annEdit = b.dataset.aedit; viewAnn(); window.scrollTo(0, 0); });
  $$('[data-adel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this announcement for everyone?')) return; const a = db.announcements.find(x => x.id === b.dataset.adel);
    db.announcements = db.announcements.filter(x => x !== a); if (a.synced) db.deletedAnn.push(a.id); await fdel(key(a.id)).catch(() => {}); save(); toast('Deleted'); syncNow(false); viewAnn(); });
  if (!canPost(u)) return;
  if ($('#aCancel')) $('#aCancel').onclick = () => { STATE.annEdit = null; viewAnn(); };
  $('#aSave').onclick = async () => {
    const title = $('#aTitle').value.trim(), message = $('#aMsg').value.trim(); if (!title || !message) return toast('Write a title and message');
    const file = $('#aFile').files[0]; if (file && file.size > MAX) return toast('File is larger than 10 MB');
    const now = new Date().toISOString();
    const a = editA || {id: uid(), createdAt: now, author: u.name};
    Object.assign(a, {title, message, audience: $('#aAud').value, pinned: $('#aPin').checked, expires: $('#aExp').value, updatedAt: now, synced: false});
    if ($('#aRm') && $('#aRm').checked) { Object.assign(a, {removeFile: true, fileName: '', mime: '', fileId: ''}); await fdel(key(a.id)).catch(() => {}); }
    if (file) { await fput(key(a.id), {blob: file, name: file.name, mime: file.type}); Object.assign(a, {newFile: true, removeFile: false, fileName: file.name, mime: file.type || 'application/octet-stream', size: file.size}); }
    if (!editA) db.announcements.push(a);
    STATE.annEdit = null; save(); toast(online() ? 'Publishing…' : db.settings.scriptUrl ? 'Saved – will publish when online' : 'Published ✓');
    if (!db.settings.scriptUrl) a.synced = true;
    viewAnn(); await syncNow(false); if (location.hash === '#ann') viewAnn();
  };
}
