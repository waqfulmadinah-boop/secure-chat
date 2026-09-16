// ===== Madani IT Frontend =====
const $ = (id) => document.getElementById(id);
function safeBind(id, evt, fn) { const el = $(id); if (el) el[evt] = fn; }
let token = '';
let me = null, socket = null, users = [], currentPeer = 'group';
let replyTo = null, statuses = JSON.parse(localStorage.getItem('sc_status') || '[]');
let pendingMedia = [];
let profileMap = {};

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- Password toggles ----
function bindToggle(btnId, inputId) {
  const b = $(btnId), inp = $(inputId);
  if (!b || !inp) return;
  b.onclick = () => { const isPass = inp.type === 'password'; inp.type = isPass ? 'text' : 'password'; b.textContent = isPass ? '🙈' : '👁️'; };
}
bindToggle('togglePass', 'password');
bindToggle('toggleAdminPass', 'adminPass');
bindToggle('toggleRegPass', 'regPassword');

// ---- Login/Register toggle ----
safeBind('showRegister', 'onclick', (e) => { e.preventDefault(); $('loginScreen').classList.add('hidden'); $('registerScreen').classList.remove('hidden'); });
safeBind('showLogin', 'onclick', (e) => { e.preventDefault(); $('registerScreen').classList.add('hidden'); $('loginScreen').classList.remove('hidden'); });

// ---- Registration ----
safeBind('registerBtn', 'onclick', async () => {
  const errEl = $('regError'); if (errEl) errEl.textContent = '';
  const name = $('regName') ? $('regName').value.trim() : '';
  const email = $('regEmail') ? $('regEmail').value.trim() : '';
  const password = $('regPassword') ? $('regPassword').value : '';
  const btn = $('registerBtn');
  if (!email || !password) { if (errEl) errEl.textContent = 'Gmail ও পাসওয়ার্ড দিন।'; return; }
  if (btn) btn.textContent = 'রেজিস্ট্রেশন হচ্ছে...';
  try {
    const j = await api('/api/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    token = j.token; localStorage.setItem('sc_token', token);
    me = { email: j.email, name: j.displayName || j.name, displayName: j.displayName || j.name, avatar: j.avatar };
    users = j.allowedUsers || [];
    enterApp();
  } catch (e) { if (errEl) errEl.textContent = '⛔ ' + e.message; }
  if (btn) btn.textContent = 'রেজিস্ট্রেশন করুন';
});
safeBind('regPassword', 'onkeydown', function(e) { if (e.key === 'Enter') $('registerBtn').click(); });

// ---- Login ----
let loginEmail = '';
async function doLogin() {
  const errEl = $('loginError');
  if (errEl) errEl.textContent = '';
  const emailEl = $('email'), passEl = $('password'), btnEl = $('loginBtn');
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passEl ? passEl.value : '';
  if (!email || !password) { if (errEl) errEl.textContent = 'Gmail ও পাসওয়ার্ড দিন।'; return; }
  if (btnEl) btnEl.textContent = 'যাচাই হচ্ছে...';
  try {
    const j = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (j.require2FA) {
      loginEmail = email;
      const otpSec = $('otpSection'); if (otpSec) otpSec.classList.remove('hidden');
      if (errEl) errEl.textContent = '📱 ' + (j.hint || 'OTP পাঠানো হয়েছে।');
      if (btnEl) btnEl.textContent = 'প্রবেশ করুন';
      return;
    }
    token = j.token; localStorage.setItem('sc_token', token);
    me = { email: j.email, name: j.displayName || j.name, displayName: j.displayName || j.name, avatar: j.avatar };
    users = j.allowedUsers || [];
    enterApp();
  } catch (e) { if (errEl) errEl.textContent = '⛔ ' + e.message; }
  if (btnEl) btnEl.textContent = 'প্রবেশ করুন';
}
safeBind('loginBtn', 'onclick', doLogin);
safeBind('password', 'onkeydown', function(e) { if (e.key === 'Enter') doLogin(); });
safeBind('otpInput', 'onkeydown', function(e) { if (e.key === 'Enter') { const b = $('otpVerify'); if (b) b.click(); } });
safeBind('otpVerify', 'onclick', async () => {
  const otpEl = $('otpInput');
  const otp = otpEl ? otpEl.value.trim() : '';
  if (!otp || otp.length !== 6) { const e = $('loginError'); if (e) e.textContent = '৬ ডিজিট OTP দিন।'; return; }
  try {
    const j = await api('/api/verify-otp', { method: 'POST', body: JSON.stringify({ email: loginEmail, otp }) });
    token = j.token; localStorage.setItem('sc_token', token);
    me = { email: j.email, name: j.displayName || j.name, displayName: j.displayName || j.name, avatar: j.avatar };
    users = j.allowedUsers || [];
    const otpSec = $('otpSection'); if (otpSec) otpSec.classList.add('hidden');
    enterApp();
  } catch (e) { const errEl = $('loginError'); if (errEl) errEl.textContent = '⛔ ' + e.message; }
});

const ADMIN_EMAIL = 'waqfulmadinah@gmail.com';
async function enterApp() {
  $('loginScreen')?.classList.add('hidden');
  $('registerScreen')?.classList.add('hidden');
  $('app')?.classList.remove('hidden');
  if (me) {
    const n = $('meName'), e = $('meEmail'), av = $('meAvatar');
    if (n) n.textContent = me.displayName || me.name;
    if (e) e.textContent = me.email;
    if (av) {
      if (me.avatar) av.innerHTML = '<img src="' + me.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
      else av.textContent = (me.displayName || me.name || 'U')[0].toUpperCase();
    }
    if (me.email && me.email.toLowerCase() === ADMIN_EMAIL) {
      const ab = $('adminBtn'); if (ab) ab.classList.remove('hidden');
    }
  }
  connectSocket();
  renderChatList();
  await fetchProfiles();
  const msgs = await api('/api/messages').catch(() => []);
  msgs.forEach(addMsg);
  if (me && me.email && me.email.toLowerCase() === ADMIN_EMAIL) refreshAdminList().catch(() => {});
}
async function fetchProfiles() {
  try {
    profileMap = await api('/api/profiles');
    users = users.map(u => ({ ...u, name: (profileMap[u.email] || {}).name || u.name, avatar: (profileMap[u.email] || {}).avatar || u.avatar }));
  } catch {}
}

// ---- Socket ----
function connectSocket() {
  socket = io({ auth: { token } });
  socket.on('connect_error', () => { alert('⛔ সেশন শেষ।'); logout(); });
  socket.on('force-logout', (d) => { alert(d.reason || 'লগআউট'); logout(); });
  socket.on('chat:message', (m) => { if (m.to === 'group' || m.from === me.email || m.to === me.email) addMsg(m); });
  socket.on('chat:typing', (d) => {
    if (d.from === me.email) return;
    const fromName = (users.find(u => u.email === d.from) || {}).name || d.from.split('@')[0];
    const tl = $('typingLine'); if (tl) { tl.textContent = d.isTyping ? '✍️ ' + fromName + ' লিখছে...' : ''; }
    if (d.isTyping) setTimeout(() => { const tl2 = $('typingLine'); if (tl2) tl2.textContent = ''; }, 2500);
  });
  socket.on('presence', (d) => { updatePresence(d.onlineList || []); });
  // Incoming call
  socket.on('call:invite', (d) => {
    showIncomingCall(d.from, d.kind);
  });
  socket.on('call:signal', async (d) => {
    if (!pc) { console.log('call:signal received but no pc'); return; }
    try {
      const s = d.signal;
      if (s && s.type === 'offer') {
        await pc.setRemoteDescription(s);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:signal', { to: d.from, signal: pc.localDescription });
      } else if (s && s.type === 'answer') {
        await pc.setRemoteDescription(s);
      } else if (s && s.candidate) {
        await pc.addIceCandidate(s);
      }
    } catch (e) { console.error('signal error', e); }
  });
  socket.on('call:end', () => {
    endCallUI();
    rejectIncomingCall();
  });

  // Message edit/delete
  socket.on('chat:edited', (d) => {
    const el = document.querySelector('[data-msg-id="' + d.id + '"]');
    if (el) {
      const textEl = el.querySelector('.msg-text');
      if (textEl) textEl.textContent = d.text;
      if (!el.querySelector('.edited-tag')) {
        const meta = el.querySelector('.meta');
        if (meta) meta.insertAdjacentHTML('beforebegin', '<span class="edited-tag">(edited)</span>');
      }
    }
  });
  socket.on('chat:deleted', (d) => {
    const el = document.querySelector('[data-msg-id="' + d.id + '"]');
    if (el) {
      el.querySelector('.msg-text').textContent = '🚫 This message was deleted';
      el.classList.add('deleted-msg');
    }
  });

  // Group call events
  socket.on('groupcall:peers', handleGroupCallPeers);
  socket.on('groupcall:new-peer', handleGroupCallNewPeer);
  socket.on('groupcall:signal', handleGroupCallSignal);
  socket.on('groupcall:peer-left', handleGroupCallPeerLeft);
}

// ---- Chat list ----
function renderChatList() {
  const box = $('chatList'); if (!box) return;
  box.innerHTML = '';
  const group = document.createElement('div');
  group.className = 'chat-item' + (currentPeer === 'group' ? ' active' : '');
  group.innerHTML = '<span class="avatar">G</span><div><b>গ্রুপ চ্যাট</b><br><small>সবাই একসাথে</small></div>';
  group.onclick = () => switchPeer('group');
  box.appendChild(group);
  const others = [...new Set([...users.map(u => u.email), ...guessPeers()])].filter(e => e !== me.email);
  others.forEach(email => {
    const el = document.createElement('div');
    const prof = profileMap[email] || {};
    const displayName = prof.name || email.split('@')[0];
    const avatar = prof.avatar;
    el.className = 'chat-item' + (currentPeer === email ? ' active' : '');
    el.id = 'peer-' + email;
    const avatarHtml = avatar
      ? '<img src="' + avatar + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover">'
      : '<span class="avatar">' + displayName[0].toUpperCase() + '</span>';
    el.innerHTML = avatarHtml + '<div><b>' + escapeHtml(displayName) + '</b><br><small>' + escapeHtml(email) + '</small></div><span class="dot" id="dot-' + CSS.escape(email) + '"></span>';
    el.onclick = () => switchPeer(email);
    box.appendChild(el);
  });
}
let adminCache = null;
async function refreshAdminList() {
  const d = await api('/api/admin/users');
  adminCache = d; users = d.users || users;
  const ac = $('adminCount'); if (ac) ac.textContent = d.count + ' / ' + d.max + ' জন';
  const al = $('adminList');
  if (al) al.innerHTML = d.users.map(u =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px;border-bottom:1px solid #222d34">' +
    '<span>' + (u.online ? '🟢' : '⚪') + ' <b>' + escapeHtml(u.name) + '</b> <small>' + escapeHtml(u.email) + '</small><br><small style="color:#8696a0">🔑 ' + (u.regCode || 'N/A') + '</small></span>' +
    '<span><button onclick="resetPass(\'' + u.email + '\')" title="রিসেট">🔑</button> ' +
    (u.email === ADMIN_EMAIL ? '👑' : '<button onclick="removeUser(\'' + u.email + '\')" title="সরাও">🗑️</button>') +
    '</span></div>'
  ).join('');
  renderChatList();
  return d;
}
function guessPeers() {
  if (adminCache) return adminCache.users.map(u => u.email);
  return users.map(u => u.email);
}
function switchPeer(p) {
  currentPeer = p; replyTo = null;
  const rb = $('replyBar'); if (rb) rb.classList.add('hidden');
  document.querySelectorAll('.chat-item').forEach(x => x.classList.remove('active'));
  const prof = profileMap[p] || {};
  const displayName = prof.name || p.split('@')[0];
  const avatar = prof.avatar;
  const pn = $('peerName'); if (pn) pn.textContent = p === 'group' ? 'গ্রুপ চ্যাট' : displayName;
  const pa = $('peerAvatar');
  if (pa) {
    if (avatar) pa.innerHTML = '<img src="' + avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    else pa.textContent = (p === 'group' ? 'G' : displayName[0]).toUpperCase();
  }
  const msgBox = $('messages'); if (msgBox) msgBox.innerHTML = '';
  api('/api/messages').then(ms => ms.filter(m => p === 'group' ? m.to === 'group' : (m.from === p && m.to === me.email) || (m.from === me.email && m.to === p)).forEach(addMsg));
  renderChatList();
}
function updatePresence(list) {
  const ps = $('peerStatus');
  if (ps) ps.textContent = currentPeer === 'group' ? ('🟢 ' + list.length + ' জন অনলাইন') : (list.includes(currentPeer) ? '🟢 অনলাইন' : '⚪ অফলাইন');
  list.forEach(e => { const d = $('dot-' + CSS.escape(e)); if (d) d.classList.add('on'); });
}

// ---- Messages ----
function getUserInfo(email) {
  const p = profileMap[email] || {};
  const u = users.find(x => x.email === email) || {};
  return { displayName: p.name || u.name || email.split('@')[0], avatar: p.avatar || u.avatar || null };
}
function addMsg(m) {
  if (m.expiresAt && m.expiresAt < Date.now()) return;
  if (m.deleted) return;
  const mine = m.from === me.email;
  const info = getUserInfo(m.from);
  const div = document.createElement('div');
  div.setAttribute('data-msg-id', m.id);

  // Call message — special styling
  if (m.type === 'call') {
    div.className = 'bubble call-bubble';
    div.innerHTML = '<div class="call-msg-icon">📞</div><div class="msg-text">' + escapeHtml(m.text) + '</div><div class="meta">' + new Date(m.at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }) + '</div>';
    const msgBox = $('messages'); if (msgBox) { msgBox.appendChild(div); msgBox.scrollTop = 99999; }
    return;
  }

  div.className = 'bubble' + (mine ? ' me' : '');
  if (m.edited) div.classList.add('was-edited');
  const time = new Date(m.at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
  let inner = '';
  if (m.replyTo) inner += '<div class="reply">↩️ ' + escapeHtml(m.replyTo) + '</div>';
  if (!mine) {
    const avatarHtml = info.avatar
      ? '<img src="' + info.avatar + '" class="sender-avatar">'
      : '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#00a884;color:#fff;font-size:10px;font-weight:800">' + info.displayName[0].toUpperCase() + '</span>';
    inner += '<div class="sender-name">' + avatarHtml + ' ' + escapeHtml(info.displayName) + '</div>';
  }
  if (m.media) {
    const mt = m.media.mimeType || '';
    if (mt.startsWith('image/')) inner += '<img class="media-preview" src="' + m.media.url + '" onclick="window.open(\'' + m.media.url + '\',\'_blank\')">';
    else if (mt.startsWith('video/')) inner += '<video class="media-preview" controls src="' + m.media.url + '"></video>';
    else if (mt.startsWith('audio/')) inner += '<audio controls src="' + m.media.url + '"></audio>';
    else inner += '📄 <a href="' + m.media.url + '" download="' + (m.media.fileName || 'file') + '" style="color:#53bdeb">' + escapeHtml(m.media.fileName || 'ফাইল') + '</a>';
    if (m.text && m.text !== m.media.fileName) inner += '<div class="msg-text">' + escapeHtml(m.text) + '</div>';
  } else if (m.type === 'voice' && m.voice) {
    inner += '🎤 <audio controls src="' + m.voice.url + '"></audio> <small>(' + m.voice.duration + 's)</small>';
  } else {
    inner += '<span class="msg-text">' + escapeHtml(m.text) + '</span>';
  }
  if (m.edited) inner += ' <span class="edited-tag">(edited)</span>';
  inner += '<div class="meta">' + time + (mine ? ' <span class="tick">✓✓</span>' : '') + '</div>';
  div.innerHTML = inner;

  // Right-click / long-press menu for edit/delete (own messages only)
  if (mine) {
    div.oncontextmenu = (e) => {
      e.preventDefault();
      showMsgMenu(e, m);
    };
  } else {
    div.oncontextmenu = (e) => {
      e.preventDefault();
      const r = prompt('রিয়্যাকশন (❤️ 👍 😂 😮 😢):', '❤️');
      if (r) div.innerHTML += ' ' + r;
    };
  }
  div.ondblclick = () => { replyTo = m.text || 'মেসেজ'; const rt = $('replyText'); if (rt) rt.textContent = replyTo.slice(0, 60); const rb = $('replyBar'); if (rb) rb.classList.remove('hidden'); };
  div.oncontextmenu = (e) => { e.preventDefault(); showMsgMenu(e, m); };
  const msgBox = $('messages'); if (msgBox) { msgBox.appendChild(div); msgBox.scrollTop = 99999; }
  if (!mine) socket?.emit('chat:read', { id: m.id });
  if (m.expiresAt) setTimeout(() => div.remove(), m.expiresAt - Date.now());
}

// ---- Message context menu (edit/delete/reaction) ----
function removeMsgMenu() { const old = document.querySelector('.msg-menu'); if (old) old.remove(); }
function showMsgMenu(e, m) {
  removeMsgMenu();
  const mine = m.from === me.email;
  const menu = document.createElement('div');
  menu.className = 'msg-menu';
  let html = '';
  if (mine && m.type !== 'call') html += '<div class="msg-menu-item" data-action="edit">✏️ Edit</div>';
  if (mine && m.type !== 'call') html += '<div class="msg-menu-item delete" data-action="delete">🗑️ Delete</div>';
  html += '<div class="msg-menu-item" data-action="react">❤️ React</div>';
  html += '<div class="msg-menu-item" data-action="reply">↩️ Reply</div>';
  html += '<div class="msg-menu-item" data-action="copy">📋 Copy</div>';
  menu.innerHTML = html;
  menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
  document.body.appendChild(menu);
  menu.querySelector('[data-action="edit"]')?.addEventListener('click', () => { removeMsgMenu(); editMessage(m); });
  menu.querySelector('[data-action="delete"]')?.addEventListener('click', () => { removeMsgMenu(); deleteMessage(m); });
  menu.querySelector('[data-action="react"]')?.addEventListener('click', () => {
    removeMsgMenu();
    const r = prompt('রিয়্যাকশন দিন (❤️ 👍 😂 😮 😢):', '❤️');
    if (r) {
      const el = document.querySelector('[data-msg-id="' + m.id + '"]');
      if (el) el.innerHTML += ' <span class="reaction">' + escapeHtml(r) + '</span>';
    }
  });
  menu.querySelector('[data-action="reply"]')?.addEventListener('click', () => {
    removeMsgMenu();
    replyTo = m.text || 'মেসেজ';
    const rt = $('replyText'); if (rt) rt.textContent = replyTo.slice(0, 60);
    const rb = $('replyBar'); if (rb) rb.classList.remove('hidden');
  });
  menu.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
    removeMsgMenu();
    navigator.clipboard?.writeText(m.text || '').catch(() => {});
  });
  setTimeout(() => document.addEventListener('click', removeMsgMenu, { once: true }), 10);
}
function editMessage(m) {
  const newText = prompt('মেসেজ এডিট করুন:', m.text);
  if (newText === null || newText.trim() === '' || newText === m.text) return;
  api('/api/messages/edit', { method: 'POST', body: JSON.stringify({ id: m.id, text: newText.trim() }) })
    .catch(e => alert('⛔ ' + e.message));
}
function deleteMessage(m) {
  if (!confirm('এই মেসেজ ডিলিট করবেন?\n"OK" = সবার জন্য, "Cancel" = শুধু আপনার জন্য')) return;
  const forEveryone = true; // user pressed OK
  api('/api/messages/delete', { method: 'POST', body: JSON.stringify({ id: m.id, forEveryone }) })
    .catch(e => alert('⛔ ' + e.message));
}

// ---- Upload helper ----
async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  if (!r.ok) throw new Error('Upload failed');
  return r.json();
}
async function uploadBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  return uploadFile(file);
}

// ---- Send ----
async function send() {
  let t = $('msgInput') ? $('msgInput').value.trim() : '';
  if (!t && !pendingMedia.length) return;
  if (/[\u0980-\u09FF]$/.test(t) && !/[।?!]$/.test(t)) t += '।';
  const disappearSec = Number($('disappear') ? $('disappear').value : 0) || null;
  for (const m of pendingMedia) {
    try {
      // Upload file to server, get URL
      const uploaded = await uploadFile(m.file);
      socket.emit('chat:message', { to: currentPeer, text: t || m.fileName, media: { url: uploaded.url, mimeType: uploaded.mimeType, fileName: uploaded.fileName }, replyTo, disappearSec });
    } catch (e) {
      // Fallback: send as base64
      socket.emit('chat:message', { to: currentPeer, text: t || m.fileName, media: { url: m.dataUrl, mimeType: m.mimeType, fileName: m.fileName }, replyTo, disappearSec });
    }
  }
  if (!pendingMedia.length) socket.emit('chat:message', { to: currentPeer, text: t, replyTo, disappearSec });
  if ($('msgInput')) $('msgInput').value = '';
  pendingMedia = []; replyTo = null;
  const bar = document.querySelector('.media-preview-bar'); if (bar) bar.remove();
  const rb = $('replyBar'); if (rb) rb.classList.add('hidden');
  updateSendMic();
}
safeBind('sendBtn', 'onclick', send);
// Toggle send/mic button based on input (WhatsApp-style)
function updateSendMic() {
  const input = $('msgInput');
  const sendBtn = $('sendBtn');
  const micBtn = $('voiceMsgBtn');
  if (!input || !sendBtn || !micBtn) return;
  const hasText = input.value.trim().length > 0 || pendingMedia.length > 0;
  sendBtn.classList.toggle('visible', hasText);
  micBtn.style.display = hasText ? 'none' : 'inline-flex';
}
safeBind('msgInput', 'oninput', updateSendMic);
safeBind('msgInput', 'onkeydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); updateSendMic(); }
  socket?.emit('chat:typing', { to: currentPeer, isTyping: true });
  clearTimeout(window._t); window._t = setTimeout(() => socket?.emit('chat:typing', { to: currentPeer, isTyping: false }), 1200);
});
window.addEventListener('voice-send', () => { send(); updateSendMic(); });
safeBind('replyCancel', 'onclick', () => { replyTo = null; const rb = $('replyBar'); if (rb) rb.classList.add('hidden'); });
safeBind('search', 'oninput', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.bubble').forEach(b => b.style.outline = q && b.textContent.toLowerCase().includes(q) ? '2px solid #ffd60a' : '');
});

function logout() { token = ''; localStorage.removeItem('sc_token'); location.reload(); }
safeBind('logoutBtn', 'onclick', logout);

// ---- Voice typing ----
safeBind('voiceTypeBtn', 'onclick', () => {
  if (!window.VoiceTyper || !VoiceTyper.supported()) { alert('Chrome / Edge-এ 🎙️ ভয়েস টাইপিং সেরা।'); return; }
  VoiceTyper.isListening() ? VoiceTyper.stop() : VoiceTyper.start($('msgInput'));
});
safeBind('voiceStop', 'onclick', () => { if (window.VoiceTyper) VoiceTyper.stop(); });

// ---- Voice message ----
let mr = null, chunks = [], recStart = 0;
safeBind('voiceMsgBtn', 'onclick', async () => {
  if (mr) { mr.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mr = new MediaRecorder(stream); chunks = []; recStart = Date.now();
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = async () => {
      const dur = Math.round((Date.now() - recStart) / 1000);
      const blob = new Blob(chunks, { type: 'audio/webm' });
      try {
        const uploaded = await uploadBlob(blob, 'voice-' + Date.now() + '.webm');
        socket.emit('chat:message', { to: currentPeer, voice: { url: uploaded.url, duration: dur }, text: '🎤' });
      } catch {
        const rd = new FileReader();
        rd.onload = () => { socket.emit('chat:message', { to: currentPeer, voice: { url: rd.result, duration: dur }, text: '🎤' }); };
        rd.readAsDataURL(blob);
      }
      mr = null;
      const btn = $('voiceMsgBtn'); if (btn) btn.textContent = '🎤';
      stream.getTracks().forEach(t => t.stop());
    };
    mr.start();
    const btn = $('voiceMsgBtn'); if (btn) btn.textContent = '⏹️';
    alert('🎤 রেকর্ড হচ্ছে... থামাতে আবার চাপুন।');
  } catch { alert('মাইক্রোফোন অনুমতি দিন।'); }
});

// ---- Status ----
safeBind('statusBtn', 'onclick', () => { $('statusModal')?.classList.remove('hidden'); renderStatus(); });
safeBind('statusClose', 'onclick', () => { $('statusModal')?.classList.add('hidden'); });
safeBind('statusPost', 'onclick', () => {
  const inp = $('statusText');
  const t = inp ? inp.value.trim() : ''; if (!t) return;
  statuses.push({ by: me.email, text: t, at: Date.now() });
  localStorage.setItem('sc_status', JSON.stringify(statuses));
  if (inp) inp.value = ''; renderStatus();
});
function renderStatus() {
  const now = Date.now();
  statuses = statuses.filter(s => now - s.at < 86400000);
  localStorage.setItem('sc_status', JSON.stringify(statuses));
  const sl = $('statusList');
  if (sl) sl.innerHTML = statuses.map(s => '<p>⭕ <b>' + escapeHtml(s.by.split('@')[0]) + '</b>: ' + escapeHtml(s.text) + '</p>').join('') || '<p>কোনো স্ট্যাটাস নেই।</p>';
}

// ---- Admin panel ----
safeBind('adminBtn', 'onclick', async () => { $('adminModal')?.classList.remove('hidden'); try { await refreshAdminList(); } catch (e) { $('adminMsg').textContent = '⛔ ' + e.message; } });
safeBind('adminClose', 'onclick', () => { $('adminModal')?.classList.add('hidden'); });
safeBind('adminRefresh', 'onclick', () => refreshAdminList().catch(e => { $('adminMsg').textContent = '⛔ ' + e.message; }));
safeBind('adminAdd', 'onclick', async () => {
  const msg = $('adminMsg'); if (msg) msg.textContent = 'যোগ হচ্ছে...';
  try {
    await api('/api/admin/add-user', { method: 'POST', body: JSON.stringify({ email: $('adminEmail')?.value.trim(), password: $('adminPass')?.value, name: $('adminName')?.value.trim() }) });
    if (msg) msg.textContent = '✅ যোগ হয়েছে';
    if ($('adminEmail')) $('adminEmail').value = '';
    if ($('adminPass')) $('adminPass').value = '';
    if ($('adminName')) $('adminName').value = '';
    await refreshAdminList();
  } catch (e) { if (msg) msg.textContent = '⛔ ' + e.message; }
});
async function removeUser(email) { if (!confirm(email + ' কে সরাবেন?')) return; try { await api('/api/admin/remove-user', { method: 'POST', body: JSON.stringify({ email }) }); await refreshAdminList(); } catch (e) { alert(e.message); } }
async function resetPass(email) { const p = prompt(email + ' এর নতুন পাসওয়ার্ড (৬+):'); if (!p) return; try { await api('/api/admin/reset-password', { method: 'POST', body: JSON.stringify({ email, password: p }) }); alert('✅ রিসেট হয়েছে'); } catch (e) { alert(e.message); } }
window.removeUser = removeUser; window.resetPass = resetPass;

// ---- 1-1 Calls (WebRTC) ----
let pc = null, localStream = null, callPeer = null;
let callMuted = false, callCamOff = false;
let callStartTime = 0, callKind = 'voice';
let incomingCallFrom = null, incomingCallKind = null;
let ringtone = null;

function createRingtone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 440; osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    return { osc, ctx, stop: () => { osc.stop(); ctx.close(); } };
  } catch { return null; }
}

function showIncomingCall(from, kind) {
  incomingCallFrom = from;
  incomingCallKind = kind;
  $('incomingCallModal')?.classList.remove('hidden');
  const prof = profileMap[from] || {};
  const name = prof.name || from.split('@')[0];
  $('incomingCallerName').textContent = name;
  $('incomingCallKind').textContent = kind === 'voice' ? 'Voice Call' : 'Video Call';
  const av = $('incomingCallerAvatar');
  if (av) {
    if (prof.avatar) av.innerHTML = '<img src="' + prof.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    else av.textContent = name[0].toUpperCase();
  }
  // Play ringtone
  ringtone = createRingtone();
  // Vibrate on mobile
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  // Auto-reject after 30 seconds
  setTimeout(() => { if (incomingCallFrom) rejectIncomingCall(); }, 30000);
}

function rejectIncomingCall() {
  if (incomingCallFrom) {
    socket.emit('call:end', { to: incomingCallFrom });
    // Log missed call
    socket.emit('call:log', { to: incomingCallFrom, kind: incomingCallKind || 'voice', duration: 0, status: 'missed', startedAt: Date.now() });
    incomingCallFrom = null;
  }
  $('incomingCallModal')?.classList.add('hidden');
  if (ringtone) { try { ringtone.stop(); } catch {} ringtone = null; }
}

async function acceptIncomingCall() {
  if (!incomingCallFrom) return;
  const from = incomingCallFrom;
  const kind = incomingCallKind;
  incomingCallFrom = null;
  $('incomingCallModal')?.classList.add('hidden');
  if (ringtone) { try { ringtone.stop(); } catch {} ringtone = null; }
  await acceptCall(from, kind, false);
}

safeBind('incomingCallAccept', 'onclick', acceptIncomingCall);
safeBind('incomingCallReject', 'onclick', rejectIncomingCall);

async function acceptCall(from, kind, isCaller) {
  callPeer = from; callMuted = false; callCamOff = false; callStartTime = Date.now(); callKind = kind;
  $('callModal')?.classList.remove('hidden');
  // Set caller info
  const prof = profileMap[from] || {};
  const name = prof.name || from.split('@')[0];
  $('callTitle').textContent = name;
  const av = $('callAvatar');
  if (av) {
    if (prof.avatar) av.innerHTML = '<img src="' + prof.avatar + '">';
    else av.textContent = name[0].toUpperCase();
  }
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind !== 'voice' }).catch(() => null);
  if (!localStream) { $('callStatus').textContent = 'ক্যামেরা/মাইক পাওয়া যায়নি'; return; }
  const hasVideo = localStream.getVideoTracks().length > 0;
  $('callMute').classList.remove('active');
  $('callCamToggle').classList.remove('active');
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (e) => {
    // Remote stream received
    $('callStatus').textContent = '🔊 Connected';
    // Play remote audio — create or use audio element
    let remoteAudio = $('remoteAudio');
    if (!remoteAudio) {
      remoteAudio = document.createElement('audio');
      remoteAudio.id = 'remoteAudio';
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = e.streams[0];
    remoteAudio.play().catch(() => {});
    // Show remote video in background
    const rBg = $('remoteVideoBg');
    if (rBg) {
      rBg.srcObject = e.streams[0];
      if (e.streams[0].getVideoTracks().length > 0) {
        $('callScreen')?.classList.add('video-active');
      }
    }
  };
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('call:signal', { to: callPeer, signal: { candidate: e.candidate } }); };
  if (isCaller) {
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    socket.emit('call:signal', { to: callPeer, signal: pc.localDescription });
    $('callStatus').textContent = 'Calling...';
  } else {
    $('callStatus').textContent = 'Ringing...';
  }
}

safeBind('callMute', 'onclick', () => {
  if (!localStream) return;
  callMuted = !callMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !callMuted);
  $('callMute').classList.toggle('active', callMuted);
});

safeBind('callCamToggle', 'onclick', () => {
  if (!localStream) return;
  const tracks = localStream.getVideoTracks();
  if (!tracks.length) return;
  callCamOff = !callCamOff;
  tracks.forEach(t => t.enabled = !callCamOff);
  $('callCamToggle').classList.toggle('active', callCamOff);
});

safeBind('voiceCallBtn', 'onclick', () => { if (currentPeer === 'group') return alert('1-1 চ্যাটে গিয়ে কল দিন।'); socket.emit('call:invite', { to: currentPeer, kind: 'voice' }); acceptCall(currentPeer, 'voice', true); });
safeBind('videoCallBtn', 'onclick', () => { if (currentPeer === 'group') return alert('1-1 চ্যাটে গিয়ে কল দিন।'); socket.emit('call:invite', { to: currentPeer, kind: 'video' }); acceptCall(currentPeer, 'video', true); });
safeBind('callHang', 'onclick', () => { logCall('completed'); if (callPeer) socket.emit('call:end', { to: callPeer }); endCallUI(); });
function endCallUI() {
  $('callModal')?.classList.add('hidden');
  $('callScreen')?.classList.remove('video-active');
  $('callStatus').textContent = 'Calling...';
  try { pc?.close(); localStream?.getTracks().forEach(t => t.stop()); } catch {}
  // Stop remote audio/video
  const rBg = $('remoteVideoBg'); if (rBg) rBg.srcObject = null;
  const rAudio = $('remoteAudio'); if (rAudio) rAudio.srcObject = null;
  pc = null; callPeer = null; callMuted = false; callCamOff = false;
}
function logCall(status) {
  if (!callPeer || !callStartTime) return;
  const duration = Math.floor((Date.now() - callStartTime) / 1000);
  // Also add to chat history
  const prof = profileMap[callPeer] || {};
  const name = prof.name || callPeer.split('@')[0];
  const statusText = status === 'completed' ? '✅ উত্তরিত' : '❌ আনসওয়ারড';
  const durText = duration > 0 ? ` — ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}` : '';
  const text = `📞 ${callKind === 'voice' ? 'Voice' : 'Video'} call with ${name}: ${statusText}${durText}`;
  socket.emit('chat:message', { to: callPeer, text, type: 'call' });
  socket.emit('chat:message', { to: 'group', text: `[Call] ${text}`, type: 'call' });
  socket.emit('call:log', { to: callPeer, kind: callKind, duration, status, startedAt: callStartTime });
}

// ---- Group Call (WebRTC Mesh) ----
let groupCallActive = false;
let groupCallMuted = false;
let groupCallCamOff = false;
let groupCallStream = null;
let groupCallRoomId = 'group';
const groupPeers = new Map(); // email -> { pc, videoEl }

safeBind('groupCallBtn', 'onclick', () => {
  if (groupCallActive) return;
  groupCallRoomId = 'group';
  startGroupCall();
});

async function startGroupCall() {
  try {
    groupCallStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch {
    groupCallStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  groupCallActive = true;
  $('groupCallModal')?.classList.remove('hidden');
  $('groupCallTitle').textContent = '👥 গ্রুপ কল — গ্রুপ চ্যাট';
  $('groupCallStatus').textContent = 'যোগদান হচ্ছে...';
  // Show local video
  updateGroupVideoGrid();
  addGroupVideo(me.email, groupCallStream, true);
  socket.emit('groupcall:join', { roomId: groupCallRoomId });
}

function addGroupVideo(email, stream, isLocal) {
  const grid = $('groupVideoGrid');
  if (!grid) return;
  // Remove existing for this email
  const existing = grid.querySelector('[data-email="' + CSS.escape(email) + '"]');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.className = 'group-video-item';
  wrap.setAttribute('data-email', email);
  const vid = document.createElement('video');
  vid.srcObject = stream;
  vid.muted = !!isLocal;
  vid.playsInline = true;
  vid.autoplay = true;
  if (isLocal) vid.style.transform = 'scaleX(-1)';
  const label = document.createElement('div');
  label.className = 'group-video-label';
  const prof = profileMap[email] || {};
  label.textContent = prof.name || email.split('@')[0];
  wrap.appendChild(vid);
  wrap.appendChild(label);
  grid.appendChild(wrap);
}

function updateGroupVideoGrid() {
  const grid = $('groupVideoGrid');
  if (!grid) return;
  // Add local video
  addGroupVideo(me.email, groupCallStream, true);
}

function handleGroupCallPeers(d) {
  // d.peers = array of emails already in the room
  // We need to create peer connections to each
  for (const peerEmail of d.peers) {
    createGroupPeerConnection(peerEmail, true); // we are the initiator
  }
  $('groupCallStatus').textContent = '🔗 ' + d.peers.length + ' জন সংযুক্ত';
}

async function handleGroupCallNewPeer(d) {
  // A new peer joined — they will create the offer, we just wait
  createGroupPeerConnection(d.from, false);
  $('groupCallStatus').textContent = '🔗 ' + (groupPeers.size + 1) + ' জন সংযুক্ত';
}

async function createGroupPeerConnection(peerEmail, isInitiator) {
  if (groupPeers.has(peerEmail)) return;
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  groupPeers.set(peerEmail, { pc });

  groupCallStream.getTracks().forEach(t => pc.addTrack(t, groupCallStream));

  pc.ontrack = (e) => {
    addGroupVideo(peerEmail, e.streams[0], false);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('groupcall:signal', { to: peerEmail, signal: { candidate: e.candidate }, roomId: groupCallRoomId });
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      removeGroupVideo(peerEmail);
      groupPeers.delete(peerEmail);
    }
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('groupcall:signal', { to: peerEmail, signal: pc.localDescription, roomId: groupCallRoomId });
  }
}

async function handleGroupCallSignal(d) {
  const peer = groupPeers.get(d.from);
  if (!peer) {
    // First signal from this peer — create our side
    await createGroupPeerConnection(d.from, false);
  }
  const peer2 = groupPeers.get(d.from);
  if (!peer2) return;
  try {
    if (d.signal.candidate) {
      await peer2.pc.addIceCandidate(d.signal.candidate);
    } else if (d.signal.sdp) {
      await peer2.pc.setRemoteDescription(d.signal);
      if (d.signal.type === 'offer') {
        const answer = await peer2.pc.createAnswer();
        await peer2.pc.setLocalDescription(answer);
        socket.emit('groupcall:signal', { to: d.from, signal: peer2.pc.localDescription, roomId: groupCallRoomId });
      }
    }
  } catch (e) { console.error('Group call signal error:', e); }
}

function handleGroupCallPeerLeft(d) {
  removeGroupVideo(d.from);
  const peer = groupPeers.get(d.from);
  if (peer) { try { peer.pc.close(); } catch {} groupPeers.delete(d.from); }
  $('groupCallStatus').textContent = '🔗 ' + (groupPeers.size + 1) + ' জন সংযুক্ত';
}

function removeGroupVideo(email) {
  const grid = $('groupVideoGrid');
  if (!grid) return;
  const el = grid.querySelector('[data-email="' + CSS.escape(email) + '"]');
  if (el) el.remove();
}

safeBind('groupCallHang', 'onclick', () => {
  socket.emit('groupcall:leave', { roomId: groupCallRoomId });
  endGroupCallUI();
});

safeBind('groupCallMute', 'onclick', () => {
  if (!groupCallStream) return;
  groupCallMuted = !groupCallMuted;
  groupCallStream.getAudioTracks().forEach(t => t.enabled = !groupCallMuted);
  $('groupCallMute').textContent = groupCallMuted ? '🎤 আনমিউট' : '🎤 মিউট';
});

safeBind('groupCallCamToggle', 'onclick', () => {
  if (!groupCallStream) return;
  const videoTracks = groupCallStream.getVideoTracks();
  if (!videoTracks.length) return;
  groupCallCamOff = !groupCallCamOff;
  videoTracks.forEach(t => t.enabled = !groupCallCamOff);
  $('groupCallCamToggle').textContent = groupCallCamOff ? '📷 ক্যাম চালু' : '📷 ক্যাম বন্ধ';
});

function endGroupCallUI() {
  $('groupCallModal')?.classList.add('hidden');
  for (const [email, peer] of groupPeers) { try { peer.pc.close(); } catch {} }
  groupPeers.clear();
  if (groupCallStream) { groupCallStream.getTracks().forEach(t => t.stop()); groupCallStream = null; }
  groupCallActive = false; groupCallMuted = false; groupCallCamOff = false;
  const grid = $('groupVideoGrid'); if (grid) grid.innerHTML = '';
  $('groupCallMute').textContent = '🎤 মিউট';
  $('groupCallCamToggle').textContent = '📷 ক্যাম বন্ধ';
}

// ---- Media Upload ----
safeBind('mediaBtn', 'onclick', (e) => {
  e.preventDefault();
  const inp = $('mediaInput'); if (inp) inp.click();
});
safeBind('mediaInput', 'onchange', (e) => {
  for (const file of e.target.files) {
    const rd = new FileReader();
    rd.onload = () => { pendingMedia.push({ file, dataUrl: rd.result, mimeType: file.type, fileName: file.name }); showMediaPreview(); };
    rd.readAsDataURL(file);
  }
  e.target.value = '';
});
function showMediaPreview() {
  const existing = document.querySelector('.media-preview-bar');
  if (existing) existing.remove();
  if (!pendingMedia.length) { updateSendMic(); return; }
  const bar = document.createElement('div');
  bar.className = 'media-preview-bar';
  pendingMedia.forEach((m, i) => {
    const el = document.createElement('div');
    if (m.mimeType.startsWith('image/')) el.innerHTML = '<img src="' + m.dataUrl + '">';
    else if (m.mimeType.startsWith('video/')) el.innerHTML = '<video src="' + m.dataUrl + '" style="max-height:60px"></video>';
    else el.innerHTML = '<small>📄 ' + escapeHtml(m.fileName) + '</small>';
    const rm = document.createElement('button');
    rm.className = 'remove-media'; rm.textContent = '✕';
    rm.onclick = () => { pendingMedia.splice(i, 1); showMediaPreview(); };
    el.appendChild(rm); bar.appendChild(el);
  });
  const msgBox = $('messages'); if (msgBox) msgBox.before(bar);
}

// ---- Settings ----
safeBind('settingsBtn', 'onclick', async () => {
  $('settingsModal')?.classList.remove('hidden');
  $('profileNameInput').value = me.displayName || me.name || '';
  const ap = $('profileAvatarPreview');
  if (ap) {
    if (me.avatar) ap.innerHTML = '<img src="' + me.avatar + '" style="width:100%;height:100%;object-fit:cover">';
    else ap.textContent = (me.displayName || me.name || 'U')[0].toUpperCase();
  }
  $('twofaStatus').textContent = 'বর্তমান: ' + (me.twofaEnabled ? '✅ চালু' : '❌ বন্ধ');
});
safeBind('settingsClose', 'onclick', () => { $('settingsModal')?.classList.add('hidden'); });

let pendingAvatar = null, avatarRemoved = false;
safeBind('changeAvatarBtn', 'onclick', () => { $('profileAvatarInput')?.click(); });
safeBind('profileAvatarInput', 'onchange', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = () => { pendingAvatar = rd.result; $('profileAvatarPreview').innerHTML = '<img src="' + pendingAvatar + '" style="width:100%;height:100%;object-fit:cover">'; };
  rd.readAsDataURL(file);
});
safeBind('removeAvatarBtn', 'onclick', () => { pendingAvatar = null; avatarRemoved = true; me.avatar = null; $('profileAvatarPreview').textContent = (me.displayName || 'U')[0].toUpperCase(); });

safeBind('saveProfile', 'onclick', async () => {
  const pm = $('profileMsg'); if (pm) pm.textContent = 'সেভ হচ্ছে...';
  try {
    const body = { displayName: $('profileNameInput')?.value.trim() };
    if (avatarRemoved) body.avatar = '';
    else if (pendingAvatar) body.avatar = pendingAvatar;
    const j = await api('/api/profile/update', { method: 'POST', body: JSON.stringify(body) });
    me.displayName = j.displayName; me.avatar = j.avatar;
    const av = $('meAvatar');
    if (av) {
      if (j.avatar) av.innerHTML = '<img src="' + j.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
      else av.textContent = (j.displayName || 'U')[0].toUpperCase();
    }
    $('meName').textContent = j.displayName;
    pendingAvatar = null; avatarRemoved = false;
    if (pm) pm.textContent = '✅ প্রোফাইল সেভ হয়েছে';
    renderChatList();
  } catch (e) { if (pm) pm.textContent = '⛔ ' + e.message; }
});

safeBind('changePassBtn', 'onclick', async () => {
  const pm = $('passMsg'); if (pm) pm.textContent = '';
  try {
    await api('/api/profile/update', { method: 'POST', body: JSON.stringify({ oldPassword: $('oldPassInput')?.value, newPassword: $('newPassInput')?.value }) });
    if (pm) pm.textContent = '✅ পাসওয়ার্ড বদলে গেছে';
    if ($('oldPassInput')) $('oldPassInput').value = '';
    if ($('newPassInput')) $('newPassInput').value = '';
  } catch (e) { if (pm) pm.textContent = '⛔ ' + e.message; }
});

safeBind('toggle2FA', 'onclick', async () => {
  try {
    const j = await api('/api/2fa/enable', { method: 'POST', body: '{}' });
    $('twofaStatus').textContent = '✅ 2FA চালু। OTP: ' + j.message.split('OTP: ')[1];
    me.twofaEnabled = true;
  } catch {
    try {
      await api('/api/2fa/disable', { method: 'POST', body: '{}' });
      $('twofaStatus').textContent = '❌ 2FA বন্ধ।';
      me.twofaEnabled = false;
    } catch (e2) { alert(e2.message); }
  }
});

// ---- Theme ----
(function() {
  const savedTheme = localStorage.getItem('sc_theme') || 'dark';
  document.body.className = savedTheme;
  document.querySelectorAll('.theme-opt').forEach(b => {
    if (b.dataset.theme === savedTheme) b.classList.add('active');
    else b.classList.remove('active');
    b.onclick = () => {
      document.body.className = b.dataset.theme;
      localStorage.setItem('sc_theme', b.dataset.theme);
      document.querySelectorAll('.theme-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
})();
