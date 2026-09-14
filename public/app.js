// ===== Secure Chat Frontend =====
const $ = (id) => document.getElementById(id);
function safeBind(id, evt, fn) { const el = $(id); if (el) el[evt] = fn; }
let token = '';
let me = null, socket = null, users = [], currentPeer = 'group';
let replyTo = null, statuses = JSON.parse(localStorage.getItem('sc_status') || '[]');
let pendingMedia = [];

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- Show/Hide password ----
function bindToggle(btnId, inputId) {
  const b = $(btnId), inp = $(inputId);
  if (!b || !inp) return;
  b.onclick = () => { const isPass = inp.type === 'password'; inp.type = isPass ? 'text' : 'password'; b.textContent = isPass ? '🙈' : '👁️'; };
}
bindToggle('togglePass', 'password');
bindToggle('toggleAdminPass', 'adminPass');

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
      if (errEl) errEl.textContent = '📱 OTP আপনার কনসোল/সার্ভার লগে দেখুন।';
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
  const ls = $('loginScreen'); if (ls) ls.classList.add('hidden');
  const app = $('app'); if (app) app.classList.remove('hidden');
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
  const msgs = await api('/api/messages').catch(() => []);
  msgs.forEach(addMsg);
  if (me && me.email && me.email.toLowerCase() === ADMIN_EMAIL) refreshAdminList().catch(() => {});
}

// ---- Socket ----
function connectSocket() {
  socket = io({ auth: { token } });
  socket.on('connect_error', () => { alert('⛔ প্রবেশাধিকার নেই / সেশন শেষ।'); logout(); });
  socket.on('force-logout', (d) => { alert(d.reason || 'লগআউট'); logout(); });
  socket.on('chat:message', (m) => { if (m.to === 'group' || m.from === me.email || m.to === me.email) addMsg(m); });
  socket.on('chat:typing', (d) => {
    if (d.from === me.email) return;
    const fromName = (users.find(u => u.email === d.from) || {}).name || d.from.split('@')[0];
    const tl = $('typingLine'); if (tl) { tl.textContent = d.isTyping ? '✍️ ' + fromName + ' লিখছে...' : ''; }
    if (d.isTyping) setTimeout(() => { const tl2 = $('typingLine'); if (tl2) tl2.textContent = ''; }, 2500);
  });
  socket.on('presence', (d) => { updatePresence(d.onlineList || []); });
  socket.on('call:invite', (d) => {
    if (confirm('📞 ' + d.from + ' (' + d.kind + ' কল) — ধরবেন?')) acceptCall(d.from, d.kind, false);
  });
  socket.on('call:signal', async (d) => { if (pc) try { await pc.setRemoteDescription(d.signal); } catch {} });
  socket.on('call:end', () => endCallUI());
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
    const peer = (adminCache?.users || []).find(u => u.email === email) || {};
    const avatar = peer.avatar;
    const displayName = peer.name || email.split('@')[0];
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
    '<span><button onclick="resetPass(\'' + u.email + '\')" title="পাসওয়ার্ড রিসেট">🔑</button> ' +
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
  const peerInfo = (adminCache?.users || []).find(u => u.email === p) || {};
  const pn = $('peerName'); if (pn) pn.textContent = p === 'group' ? 'গ্রুপ চ্যাট' : (peerInfo.name || p.split('@')[0]);
  const pa = $('peerAvatar');
  if (pa) {
    if (peerInfo.avatar) pa.innerHTML = '<img src="' + peerInfo.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    else pa.textContent = (p === 'group' ? 'G' : (peerInfo.name || p)[0]).toUpperCase();
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
  const u = users.find(x => x.email === email) || adminCache?.users?.find(x => x.email === email) || {};
  return { displayName: u.name || email.split('@')[0], avatar: u.avatar || null };
}
function addMsg(m) {
  if (m.expiresAt && m.expiresAt < Date.now()) return;
  const mine = m.from === me.email;
  const info = getUserInfo(m.from);
  const div = document.createElement('div');
  div.className = 'bubble' + (mine ? ' me' : '');
  const time = new Date(m.at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
  let inner = '';
  if (m.replyTo) inner += '<div class="reply">↩️ ' + escapeHtml(m.replyTo) + '</div>';
  if (!mine) {
    const avatarHtml = info.avatar
      ? '<img src="' + info.avatar + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px">'
      : '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#00a884;color:#fff;font-size:11px;font-weight:800;vertical-align:middle;margin-right:4px">' + info.displayName[0].toUpperCase() + '</span>';
    inner += '<div style="font-size:12px;font-weight:700;color:#00e676;margin-bottom:2px">' + avatarHtml + ' ' + escapeHtml(info.displayName) + '</div>';
  }
  if (m.media) {
    const mt = m.media.mimeType || '';
    if (mt.startsWith('image/')) inner += '<img class="media-preview" src="' + m.media.dataUrl + '" onclick="window.open(\'' + m.media.dataUrl + '\',\'_blank\')">';
    else if (mt.startsWith('video/')) inner += '<video class="media-preview" controls src="' + m.media.dataUrl + '"></video>';
    else if (mt.startsWith('audio/')) inner += '<audio controls src="' + m.media.dataUrl + '"></audio>';
    else inner += '📄 <a href="' + m.media.dataUrl + '" download="' + (m.media.fileName || 'file') + '" style="color:#53bdeb">' + escapeHtml(m.media.fileName || 'ফাইল') + '</a>';
    if (m.text && m.text !== m.media.fileName) inner += '<div>' + escapeHtml(m.text) + '</div>';
  } else if (m.type === 'voice' && m.voice) {
    inner += '🎤 <audio controls src="' + m.voice.dataUrl + '"></audio> <small>(' + m.voice.duration + 's)</small>';
  } else {
    inner += escapeHtml(m.text);
  }
  inner += '<div class="meta">' + time + (mine ? ' <span class="tick">✓✓</span>' : '') + '</div>';
  div.innerHTML = inner;
  div.ondblclick = () => { replyTo = m.text || 'মেসেজ'; const rt = $('replyText'); if (rt) rt.textContent = replyTo.slice(0, 60); const rb = $('replyBar'); if (rb) rb.classList.remove('hidden'); };
  div.oncontextmenu = (e) => { e.preventDefault(); const r = prompt('রিয়্যাকশন দিন (❤️ 👍 😂 😮 😢):', '❤️'); if (r) div.innerHTML += ' ' + r; };
  const msgBox = $('messages'); if (msgBox) { msgBox.appendChild(div); msgBox.scrollTop = 99999; }
  if (!mine) socket?.emit('chat:read', { id: m.id });
  if (m.expiresAt) setTimeout(() => div.remove(), m.expiresAt - Date.now());
}

// ---- Send ----
function send() {
  let t = $('msgInput') ? $('msgInput').value.trim() : '';
  if (!t && !pendingMedia.length) return;
  if (/[\u0980-\u09FF]$/.test(t) && !/[।?!]$/.test(t)) t += '।';
  for (const m of pendingMedia) {
    socket.emit('chat:message', { to: currentPeer, text: t || m.fileName, media: m, replyTo, disappearSec: Number($('disappear') ? $('disappear').value : 0) || null });
  }
  if (!pendingMedia.length) socket.emit('chat:message', { to: currentPeer, text: t, replyTo, disappearSec: Number($('disappear') ? $('disappear').value : 0) || null });
  if ($('msgInput')) $('msgInput').value = '';
  pendingMedia = []; replyTo = null;
  const bar = document.querySelector('.media-preview-bar'); if (bar) bar.remove();
  const rb = $('replyBar'); if (rb) rb.classList.add('hidden');
}
safeBind('sendBtn', 'onclick', send);
safeBind('msgInput', 'onkeydown', function(e) {
  if (e.key === 'Enter') send();
  socket?.emit('chat:typing', { to: currentPeer, isTyping: true });
  clearTimeout(window._t); window._t = setTimeout(() => socket?.emit('chat:typing', { to: currentPeer, isTyping: false }), 1200);
});
window.addEventListener('voice-send', send);
safeBind('replyCancel', 'onclick', () => { replyTo = null; const rb = $('replyBar'); if (rb) rb.classList.add('hidden'); });
safeBind('search', 'oninput', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.bubble').forEach(b => b.style.outline = q && b.textContent.toLowerCase().includes(q) ? '2px solid #ffd60a' : '');
});

function logout() { token = ''; localStorage.removeItem('sc_token'); location.reload(); }
safeBind('logoutBtn', 'onclick', logout);

// ---- Voice typing ----
safeBind('voiceTypeBtn', 'onclick', () => {
  if (!window.VoiceTyper || !VoiceTyper.supported()) { alert('Chrome / Edge-এ 🎙️ ভয়েস টাইপিং সবচেয়ে ভালো চলে।'); return; }
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
    mr.onstop = () => {
      const dur = Math.round((Date.now() - recStart) / 1000);
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const rd = new FileReader();
      rd.onload = () => { socket.emit('chat:message', { to: currentPeer, voice: { dataUrl: rd.result, duration: dur }, text: '🎤' }); };
      rd.readAsDataURL(blob);
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
safeBind('statusBtn', 'onclick', () => { const m = $('statusModal'); if (m) m.classList.remove('hidden'); renderStatus(); });
safeBind('statusClose', 'onclick', () => { const m = $('statusModal'); if (m) m.classList.add('hidden'); });
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
safeBind('adminBtn', 'onclick', async () => { const m = $('adminModal'); if (m) m.classList.remove('hidden'); try { await refreshAdminList(); } catch (e) { const msg = $('adminMsg'); if (msg) msg.textContent = '⛔ ' + e.message; } });
safeBind('adminClose', 'onclick', () => { const m = $('adminModal'); if (m) m.classList.add('hidden'); });
safeBind('adminRefresh', 'onclick', () => refreshAdminList().catch(e => { const msg = $('adminMsg'); if (msg) msg.textContent = '⛔ ' + e.message; }));
safeBind('adminAdd', 'onclick', async () => {
  const msg = $('adminMsg'); if (msg) msg.textContent = 'যোগ হচ্ছে...';
  try {
    await api('/api/admin/add-user', { method: 'POST', body: JSON.stringify({ email: $('adminEmail') ? $('adminEmail').value.trim() : '', password: $('adminPass') ? $('adminPass').value : '', name: $('adminName') ? $('adminName').value.trim() : '' }) });
    if (msg) msg.textContent = '✅ যোগ হয়েছে';
    if ($('adminEmail')) $('adminEmail').value = '';
    if ($('adminPass')) $('adminPass').value = '';
    if ($('adminName')) $('adminName').value = '';
    await refreshAdminList();
  } catch (e) { if (msg) msg.textContent = '⛔ ' + e.message; }
});
async function removeUser(email) { if (!confirm(email + ' কে সরাবেন?')) return; try { await api('/api/admin/remove-user', { method: 'POST', body: JSON.stringify({ email }) }); await refreshAdminList(); } catch (e) { alert(e.message); } }
async function resetPass(email) { const p = prompt(email + ' এর নতুন পাসওয়ার্ড (৬+):'); if (!p) return; try { await api('/api/admin/reset-password', { method: 'POST', body: JSON.stringify({ email, password: p }) }); alert('✅ পাসওয়ার্ড রিসেট হয়েছে'); } catch (e) { alert(e.message); } }
window.removeUser = removeUser; window.resetPass = resetPass;

// ---- Calls (WebRTC) ----
let pc = null, localStream = null, callPeer = null;
async function acceptCall(from, kind, isCaller) {
  callPeer = from;
  const cm = $('callModal'); if (cm) cm.classList.remove('hidden');
  const ct = $('callTitle'); if (ct) ct.textContent = (kind === 'voice' ? '📞 ভয়েস কল: ' : '🎥 ভিডিও কল: ') + from;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind !== 'voice' }).catch(() => null);
  if (!localStream) { const cs = $('callStatus'); if (cs) cs.textContent = 'ক্যামেরা/মাইক পাওয়া যায়নি'; return; }
  if (kind === 'voice') { const lv = $('localVideo'); const rv = $('remoteVideo'); if (lv) lv.style.display = 'none'; if (rv) rv.style.display = 'none'; }
  const lv = $('localVideo'); if (lv) lv.srcObject = localStream;
  pc = new RTCPeerConnection();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (e) => { const rv = $('remoteVideo'); if (rv) rv.srcObject = e.streams[0]; };
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('call:signal', { to: callPeer, signal: { candidate: e.candidate } }); };
  if (isCaller) {
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    socket.emit('call:signal', { to: callPeer, signal: pc.localDescription });
  }
  const cs = $('callStatus'); if (cs) cs.textContent = '🔊 সংযুক্ত...';
}
safeBind('voiceCallBtn', 'onclick', () => { if (currentPeer === 'group') return alert('1-1 চ্যাটে গিয়ে কল দিন।'); socket.emit('call:invite', { to: currentPeer, kind: 'voice' }); acceptCall(currentPeer, 'voice', true); });
safeBind('videoCallBtn', 'onclick', () => { if (currentPeer === 'group') return alert('1-1 চ্যাটে গিয়ে কল দিন।'); socket.emit('call:invite', { to: currentPeer, kind: 'video' }); acceptCall(currentPeer, 'video', true); });
safeBind('callHang', 'onclick', () => { if (callPeer) socket.emit('call:end', { to: callPeer }); endCallUI(); });
function endCallUI() {
  const cm = $('callModal'); if (cm) cm.classList.add('hidden');
  const cs = $('callStatus'); if (cs) cs.textContent = 'সংযোগ হচ্ছে...';
  try { pc?.close(); localStream?.getTracks().forEach(t => t.stop()); } catch {}
  pc = null; callPeer = null;
}

// ---- Media Upload ----
safeBind('mediaInput', 'onchange', async (e) => {
  for (const file of e.target.files) {
    const rd = new FileReader();
    rd.onload = () => { pendingMedia.push({ dataUrl: rd.result, mimeType: file.type, fileName: file.name }); showMediaPreview(); };
    rd.readAsDataURL(file);
  }
  e.target.value = '';
});
function showMediaPreview() {
  const existing = document.querySelector('.media-preview-bar');
  if (existing) existing.remove();
  if (!pendingMedia.length) return;
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

// ---- Settings (Profile + 2FA + Theme) ----
safeBind('settingsBtn', 'onclick', async () => {
  const m = $('settingsModal'); if (m) m.classList.remove('hidden');
  const ni = $('profileNameInput'); if (ni) ni.value = me.displayName || me.name || '';
  const ap = $('profileAvatarPreview');
  if (ap) {
    if (me.avatar) ap.innerHTML = '<img src="' + me.avatar + '" style="width:100%;height:100%;object-fit:cover">';
    else ap.textContent = (me.displayName || me.name || 'U')[0].toUpperCase();
  }
  const ts = $('twofaStatus'); if (ts) ts.textContent = 'বর্তমান স্ট্যাটাস: ' + (me.twofaEnabled ? '✅ চালু' : '❌ বন্ধ');
});
safeBind('settingsClose', 'onclick', () => { const m = $('settingsModal'); if (m) m.classList.add('hidden'); });

let pendingAvatar = null, avatarRemoved = false;
safeBind('changeAvatarBtn', 'onclick', () => { const inp = $('profileAvatarInput'); if (inp) inp.click(); });
safeBind('profileAvatarInput', 'onchange', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = () => { pendingAvatar = rd.result; const ap = $('profileAvatarPreview'); if (ap) ap.innerHTML = '<img src="' + pendingAvatar + '" style="width:100%;height:100%;object-fit:cover">'; };
  rd.readAsDataURL(file);
});
safeBind('removeAvatarBtn', 'onclick', () => { pendingAvatar = null; avatarRemoved = true; me.avatar = null; const ap = $('profileAvatarPreview'); if (ap) ap.textContent = (me.displayName || 'U')[0].toUpperCase(); });

safeBind('saveProfile', 'onclick', async () => {
  const pm = $('profileMsg'); if (pm) pm.textContent = 'সেভ হচ্ছে...';
  try {
    const body = { displayName: $('profileNameInput') ? $('profileNameInput').value.trim() : '' };
    if (avatarRemoved) body.avatar = '';
    else if (pendingAvatar) body.avatar = pendingAvatar;
    const j = await api('/api/profile/update', { method: 'POST', body: JSON.stringify(body) });
    me.displayName = j.displayName; me.avatar = j.avatar;
    const av = $('meAvatar');
    if (av) {
      if (j.avatar) av.innerHTML = '<img src="' + j.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
      else av.textContent = (j.displayName || 'U')[0].toUpperCase();
    }
    const mn = $('meName'); if (mn) mn.textContent = j.displayName;
    pendingAvatar = null; avatarRemoved = false;
    if (pm) pm.textContent = '✅ প্রোফাইল সেভ হয়েছে';
    renderChatList();
  } catch (e) { if (pm) pm.textContent = '⛔ ' + e.message; }
});

safeBind('changePassBtn', 'onclick', async () => {
  const pm = $('passMsg'); if (pm) pm.textContent = '';
  try {
    await api('/api/profile/update', { method: 'POST', body: JSON.stringify({ oldPassword: $('oldPassInput') ? $('oldPassInput').value : '', newPassword: $('newPassInput') ? $('newPassInput').value : '' }) });
    if (pm) pm.textContent = '✅ পাসওয়ার্ড বদলে গেছে';
    if ($('oldPassInput')) $('oldPassInput').value = '';
    if ($('newPassInput')) $('newPassInput').value = '';
  } catch (e) { if (pm) pm.textContent = '⛔ ' + e.message; }
});

safeBind('toggle2FA', 'onclick', async () => {
  try {
    const j = await api('/api/2fa/enable', { method: 'POST', body: '{}' });
    const ts = $('twofaStatus'); if (ts) ts.textContent = '✅ 2FA চালু হয়েছে। OTP: ' + j.message.split('OTP: ')[1];
    me.twofaEnabled = true;
  } catch (e) {
    try {
      await api('/api/2fa/disable', { method: 'POST', body: '{}' });
      const ts = $('twofaStatus'); if (ts) ts.textContent = '❌ 2FA বন্ধ হয়েছে।';
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
