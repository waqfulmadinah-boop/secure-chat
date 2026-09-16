// ===== Madani IT Frontend =====
const $ = (id) => document.getElementById(id);
function safeBind(id, evt, fn) { const el = $(id); if (el) el[evt] = fn; }
let token = '';
let me = null, socket = null, users = [], currentPeer = null;
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
  socket.on('chat:message', (m) => {
    if (m.from === me.email || m.to === me.email) {
      if (m.from === currentPeer || m.to === currentPeer) {
        addMsg(m);
      } else {
        // Show unread indicator on sidebar
        const dot = $('dot-' + CSS.escape(m.from));
        if (dot) dot.classList.add('on');
      }
    }
  });
  socket.on('chat:typing', (d) => {
    if (d.from === me.email) return;
    const fromName = (users.find(u => u.email === d.from) || {}).name || d.from.split('@')[0];
    const tl = $('typingLine'); if (tl) { tl.textContent = d.isTyping ? '✍️ ' + fromName + ' লিখছে...' : ''; }
    if (d.isTyping) setTimeout(() => { const tl2 = $('typingLine'); if (tl2) tl2.textContent = ''; }, 2500);
  });
  socket.on('presence', (d) => { updatePresence(d.onlineList || []); });

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
}

// ---- Chat list ----
function renderChatList() {
  const box = $('chatList'); if (!box) return;
  box.innerHTML = '';
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
  const pn = $('peerName'); if (pn) pn.textContent = displayName;
  const pa = $('peerAvatar');
  if (pa) {
    if (avatar) pa.innerHTML = '<img src="' + avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    else pa.textContent = displayName[0].toUpperCase();
  }
  const msgBox = $('messages'); if (msgBox) msgBox.innerHTML = '';
  api('/api/messages').then(ms => ms.filter(m => (m.from === p && m.to === me.email) || (m.from === me.email && m.to === p)).forEach(addMsg));
  renderChatList();
}
function updatePresence(list) {
  const ps = $('peerStatus');
  if (ps) ps.textContent = list.includes(currentPeer) ? '🟢 অনলাইন' : '⚪ অফলাইন';
  list.forEach(e => { const d = $('dot-' + CSS.escape(e)); if (d) d.classList.add('on'); });
}

// ---- Messages ----
function getUserInfo(email) {
  const p = profileMap[email] || {};
  const u = users.find(x => x.email === email) || {};
  return { displayName: p.name || u.name || email.split('@')[0], avatar: p.avatar || u.avatar || null };
}
function addMsg(m) {
  if (m.deleted) return;
  const mine = m.from === me.email;
  const info = getUserInfo(m.from);
  const div = document.createElement('div');
  div.setAttribute('data-msg-id', m.id);

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
}

// ---- Message context menu (edit/delete/reaction) ----
function removeMsgMenu() { const old = document.querySelector('.msg-menu'); if (old) old.remove(); }
function showMsgMenu(e, m) {
  removeMsgMenu();
  const mine = m.from === me.email;
  const menu = document.createElement('div');
  menu.className = 'msg-menu';
  let html = '';
  if (mine) html += '<div class="msg-menu-item" data-action="edit">✏️ Edit</div>';
  if (mine) html += '<div class="msg-menu-item delete" data-action="delete">🗑️ Delete</div>';
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
  for (const m of pendingMedia) {
    try {
      const uploaded = await uploadFile(m.file);
      socket.emit('chat:message', { to: currentPeer, text: t || m.fileName, media: { url: uploaded.url, mimeType: uploaded.mimeType, fileName: uploaded.fileName }, replyTo });
    } catch (e) {
      socket.emit('chat:message', { to: currentPeer, text: t || m.fileName, media: { url: m.dataUrl, mimeType: m.mimeType, fileName: m.fileName }, replyTo });
    }
  }
  if (!pendingMedia.length) socket.emit('chat:message', { to: currentPeer, text: t, replyTo });
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
