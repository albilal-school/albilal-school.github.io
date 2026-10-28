/* Class chat – one group per class+section. Lazy-loaded. Polls the Apps Script "Chat" tab every 12 s while open.
   Messages typed offline wait in db.chatQueue and are sent automatically. Developed by Toshan Rafiq */
import {db, $, $$, esc, uid, toast, save, isOwner, myClasses, allClassKeys, STATE, app, opts, sessionUser, postJSON, getJSON, online, getToken, splitCk, VIEW_NAME} from './app.js';

const POLL_MS = 12000;
let timer = null;
export function stopChat() { if (timer) { clearInterval(timer); timer = null; } }
const room = cls => (db.chat[cls] = db.chat[cls] || {msgs: [], since: ''});

function merge(cls, msgs) {
  const r = room(cls);
  msgs.forEach(m => {
    const ex = r.msgs.find(x => x.id === m.msg_id);
    const o = {id: m.msg_id, username: m.username, name: m.name, role: m.role, text: m.text, createdAt: m.created_at, updatedAt: m.updated_at, deleted: m.deleted === '1', pending: false};
    if (ex) Object.assign(ex, o); else r.msgs.push(o);
    if (m.updated_at > r.since) r.since = m.updated_at;
  });
  r.msgs.sort((a, b) => (a.pending - b.pending) || String(a.createdAt).localeCompare(String(b.createdAt)));
  if (r.msgs.length > 500) r.msgs = r.msgs.slice(-500); // keep the phone light
}
export async function poll(cls) {
  if (!online() || !getToken()) return false;
  const {grade, section} = splitCk(cls);
  const res = await getJSON({action: 'chat', class: grade, section, since: room(cls).since});
  if (!res.ok) { if (!res.auth) toast(res.error); return false; }
  merge(cls, res.msgs || []); save(); return (res.msgs || []).length > 0;
}
export async function flushChat() {
  if (!db.chatQueue.length || !online() || !getToken()) return;
  const batch = db.chatQueue.slice();
  const res = await postJSON(db.settings.scriptUrl, {action: 'chat_send', msgs: batch});
  if (res.ok) { db.chatQueue = db.chatQueue.filter(q => !batch.includes(q)); save(); }
  else if (!res.auth) { db.chatQueue = db.chatQueue.filter(q => !batch.includes(q)); toast('Chat: ' + res.error); save(); }
}

function rooms() { const u = sessionUser(); return u.role === 'student' ? [u.cls] : (isOwner() ? allClassKeys() : [...new Set([...myClasses(), ...allClassKeys()])]); }
const t2 = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}); };

function listHTML(cls) {
  const u = sessionUser(), r = room(cls);
  if (!r.msgs.length) return '<div class="empty">No messages yet – say Assalam-o-Alaikum! 👋</div>';
  return r.msgs.map(m => `<div class="msg ${m.username === u.username ? 'mine' : ''} ${m.role !== 'student' ? 'staff' : ''}">
    <div class="mh"><b>${esc(m.name)}</b>${m.role === 'owner' ? ' <span class="badge">Owner</span>' : m.role === 'teacher' ? ' <span class="badge">Teacher</span>' : ''} <span class="muted">${m.pending ? '⏳ waiting to send' : t2(m.createdAt)}</span>
    ${isOwner() && !m.deleted && !m.pending ? `<button class="lnk" data-mdel="${esc(m.id)}" title="Delete (moderation)">🗑</button>` : ''}</div>
    <div class="mt">${m.deleted ? '<i class="muted">message removed by admin</i>' : esc(m.text)}</div></div>`).join('');
}
export function viewChat() {
  const all = rooms(); const cls = all.includes(STATE.chatCls) ? STATE.chatCls : all[0]; STATE.chatCls = cls;
  const u = sessionUser();
  app().innerHTML = `<div class="card chat"><div class="card-h"><h2>💬 Class Chat <span class="ur">کلاس گروپ</span></h2>
      ${u.role === 'student' ? `<span class="badge">${esc(cls)}</span>` : `<select id="chCls" style="max-width:180px">${opts(all, cls)}</select>`}</div>
    <p class="muted" style="margin-top:0">Be respectful. Teachers and the owner can read every class group; the owner can remove messages. ${online() ? 'Updates every 12 seconds.' : db.settings.scriptUrl ? '📴 Offline – messages will be sent later.' : 'Local mode (no sync URL) – messages stay on this device.'}</p>
    <div id="chList" class="chlist">${listHTML(cls)}</div>
    <div class="chin"><textarea id="chText" rows="2" maxlength="1000" placeholder="Type a message… · پیغام لکھیں"></textarea><button class="btn" id="chSend">Send</button></div></div>`;
  const box = $('#chList'); box.scrollTop = box.scrollHeight;
  const redraw = () => { if (VIEW_NAME() !== 'chat' || STATE.chatCls !== cls) return; const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60; box.innerHTML = listHTML(cls); bindDel(); if (atEnd) box.scrollTop = box.scrollHeight; };
  const sel = $('#chCls'); if (sel) sel.onchange = () => { STATE.chatCls = sel.value; stopChat(); viewChat(); };
  $('#chSend').onclick = async () => {
    const text = $('#chText').value.trim(); if (!text) return;
    const {grade, section} = splitCk(cls); const id = uid() + '_' + u.username;
    room(cls).msgs.push({id, username: u.username, name: u.name, role: u.role, text, createdAt: new Date().toISOString(), pending: !!db.settings.scriptUrl});
    if (db.settings.scriptUrl) db.chatQueue.push({msg_id: id, class: grade, section, text});
    $('#chText').value = ''; save(); redraw(); box.scrollTop = box.scrollHeight;
    try { await flushChat(); await poll(cls); redraw(); } catch (e) { console.warn('chat send later', e); }
  };
  $('#chText').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chSend').click(); } };
  function bindDel() { $$('[data-mdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Remove this message for everyone?')) return;
    if (!online()) return toast('Connect to the internet to moderate');
    const res = await postJSON(db.settings.scriptUrl, {action: 'chat_delete', msg_id: b.dataset.mdel});
    if (!res.ok) return toast(res.error); await poll(cls); redraw(); toast('Message removed'); }); }
  bindDel();
  stopChat();
  const tick = async () => { try { await flushChat(); if (await poll(cls)) redraw(); } catch (e) { /* offline – try next tick */ } };
  tick(); timer = setInterval(tick, POLL_MS);
}
