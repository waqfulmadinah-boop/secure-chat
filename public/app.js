// ===== Secure Chat Frontend =====
const $ = (id) => document.getElementById(id);
let token = localStorage.getItem('sc_token') || '';
let me = null, socket = null, users = [], currentPeer = 'group';
let replyTo = null, statuses = JSON.parse(localStorage.getItem('sc_status') || '[]');
let pendingMedia = []; // for image/video upload

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}

// ---- Show/Hide password ----
function bindToggle(btnId, inputId){
  const b=$(btnId), inp=$(inputId);
  if(!b||!inp) return;
  b.onclick=()=>{ const isPass=inp.type==='password'; inp.type=isPass?'text':'password'; b.textContent=isPass?'🙈':'👁️'; };
}
bindToggle('togglePass','password');
bindToggle('toggleAdminPass','adminPass');

// ---- Login ----
let loginEmail = '';
$('loginBtn').onclick = doLogin;
$('password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  $('loginError').textContent = '';
  const email = $('email').value.trim(), password = $('password').value;
  if (!email || !password) { $('loginError').textContent = 'Gmail ও পাসওয়ার্ড দিন।'; return; }
  $('loginBtn').textContent = 'যাচাই হচ্ছে...';
  try {
    const j = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (j.require2FA) {
      loginEmail = email;
      $('otpSection').classList.remove('hidden');
      $('loginError').textContent = '📱 OTP আপনার কনসোল/সার্ভার লগে দেখুন।';
      $('loginBtn').textContent = 'প্রবেশ করুন';
      return;
    }
    token = j.token; localStorage.setItem('sc_token', token);
    me = { email: j.email, name: j.name }; users = j.allowedUsers || [];
    enterApp();
  } catch (e) { $('loginError').textContent = '⛔ ' + e.message; }
  $('loginBtn').textContent = 'প্রবেশ করুন';
}
// 2FA OTP verify
$('otpVerify').onclick = async () => {
  const otp = $('otpInput').value.trim();
  if (!otp || otp.length !== 6) { $('loginError').textContent = '৬ ডিজিট OTP দিন।'; return; }
  try {
    const j = await api('/api/verify-otp', { method: 'POST', body: JSON.stringify({ email: loginEmail, otp }) });
    token = j.token; localStorage.setItem('sc_token', token);
    me = { email: j.email, name: j.name }; users = j.allowedUsers || [];
    $('otpSection').classList.add('hidden');
    enterApp();
  } catch (e) { $('loginError').textContent = '⛔ ' + e.message; }
};
$('otpInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('otpVerify').click(); });
if (token) api('/api/me').then(m => { me = m; return api('/api/login', { method: 'POST', body: JSON.stringify({ email: m.email, password: '__token__' }) }).catch(() => m); }).catch(() => { token = ''; localStorage.removeItem('sc_token'); });

// auto-login with saved token info
(async () => {
  if (!token) return;
  try {
    const m = await api('/api/me');
    me = m; enterApp(true);
  } catch { token = ''; localStorage.removeItem('sc_token'); }
})();

const ADMIN_EMAIL = 'waqfulmadinah@gmail.com';
async function enterApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('meName').textContent = me.name; $('meEmail').textContent = me.email;
  $('meAvatar').textContent = me.name[0].toUpperCase();
  if (me.email.toLowerCase() === ADMIN_EMAIL) $('adminBtn').classList.remove('hidden');
  connectSocket();
  renderChatList();
  const msgs = await api('/api/messages').catch(() => []);
  msgs.forEach(addMsg);
  // অ্যাডমিন হলে ইউজার লিস্ট তাজা করো
  if (me.email.toLowerCase() === ADMIN_EMAIL) refreshAdminList().catch(()=>{});
}

// ---- Socket ----
function connectSocket() {
  socket = io({ auth: { token } });
  socket.on('connect_error', () => { alert('⛔ প্রবেশাধিকার নেই / সেশন শেষ।'); logout(); });
  socket.on('force-logout', (d) => { alert(d.reason || 'লগআউট'); logout(); });
  socket.on('chat:message', (m) => { if (m.to === 'group' || m.from === me.email || m.to === me.email) addMsg(m); });
  socket.on('chat:typing', (d) => {
    if (d.from === me.email) return;
    $('typingLine').textContent = d.isTyping ? '✍️ ' + d.from + ' লিখছে...' : '';
    if (d.isTyping) setTimeout(() => $('typingLine').textContent = '', 2500);
  });
  socket.on('presence', (d) => { updatePresence(d.onlineList || []); });
  // calls
  socket.on('call:invite', (d) => {
    if (confirm('📞 ' + d.from + ' (' + d.kind + ' কল) — ধরবেন?')) acceptCall(d.from, d.kind, false);
  });
  socket.on('call:signal', async (d) => { if (pc) try { await pc.setRemoteDescription(d.signal); } catch {} });
  socket.on('call:end', () => endCallUI());
}

// ---- Chat list (group + allowed users) ----
function renderChatList() {
  const box = $('chatList'); box.innerHTML = '';
  const group = document.createElement('div');
  group.className = 'chat-item' + (currentPeer === 'group' ? ' active' : '');
  group.innerHTML = `<span class="avatar">G</span><div><b>গ্রুপ চ্যাট</b><br><small>সবাই একসাথে</small></div>`;
  group.onclick = () => switchPeer('group');
  box.appendChild(group);
  // allowed users (from .env — বাইরের কেউ এখানে আসবে না)
  const others = [...new Set([...users.map(u => u.email), ...guessPeers()])].filter(e => e !== me.email);
  others.forEach(email => {
    const el = document.createElement('div');
    el.className = 'chat-item' + (currentPeer === email ? ' active' : '');
    el.id = 'peer-' + email;
    el.innerHTML = `<span class="avatar">${email[0].toUpperCase()}</span><div><b>${email.split('@')[0]}</b><br><small>${email}</small></div><span class="dot" id="dot-${email}"></span>`;
    el.onclick = () => switchPeer(email);
    box.appendChild(el);
  });
}
let adminCache = null;
async function refreshAdminList() {
  const d = await api('/api/admin/users');
  adminCache = d; users = d.users || users;
  $('adminCount').textContent = `${d.count} / ${d.max} জন`;
  $('adminList').innerHTML = d.users.map(u => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;border-bottom:1px solid #222d34">
      <span>${u.online?'🟢':'⚪'} <b>${escapeHtml(u.name)}</b> <small>${escapeHtml(u.email)}</small></span>
      <span>
        <button onclick="resetPass('${u.email}')" title="পাসওয়ার্ড রিসেট">🔑</button>
        ${u.email===ADMIN_EMAIL?'👑':'<button onclick="removeUser(\''+u.email+'\')" title="সরাও">🗑️</button>'}
      </span>
    </div>`).join('');
  renderChatList();
  return d;
}
function guessPeers() {
  if (adminCache) return adminCache.users.map(u=>u.email);
  return users.map(u=>u.email);
}
function switchPeer(p) {
  currentPeer = p; replyTo = null; $('replyBar').classList.add('hidden');
  document.querySelectorAll('.chat-item').forEach(x => x.classList.remove('active'));
  $('peerName').textContent = p === 'group' ? 'গ্রুপ চ্যাট' : p;
  $('peerAvatar').textContent = (p === 'group' ? 'G' : p[0]).toUpperCase();
  $('messages').innerHTML = '';
  api('/api/messages').then(ms => ms.filter(m => p === 'group' ? m.to === 'group' : (m.from === p && m.to === me.email) || (m.from === me.email && m.to === p)).forEach(addMsg));
  renderChatList();
}
function updatePresence(list) {
  $('peerStatus').textContent = currentPeer === 'group' ? `🟢 ${list.length} জন অনলাইন` : (list.includes(currentPeer) ? '🟢 অনলাইন' : '⚪ অফলাইন');
  list.forEach(e => { const d = $('dot-' + CSS.escape(e)); if (d) d.classList.add('on'); });
}

// ---- Messages ----
function addMsg(m) {
  if (m.expiresAt && m.expiresAt < Date.now()) return;
  const mine = m.from === me.email;
  const div = document.createElement('div');
  div.className = 'bubble' + (mine ? ' me' : '');
  const time = new Date(m.at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
  let inner = '';
  if (m.replyTo) inner += `<div class="reply">↩️ ${escapeHtml(m.replyTo)}</div>`;
  // Media display
  if (m.media) {
    const mt = m.media.mimeType || '';
    if (mt.startsWith('image/')) inner += `<img class="media-preview" src="${m.media.dataUrl}" onclick="window.open('${m.media.dataUrl}','_blank')">`;
    else if (mt.startsWith('video/')) inner += `<video class="media-preview" controls src="${m.media.dataUrl}"></video>`;
    else if (mt.startsWith('audio/')) inner += `<audio controls src="${m.media.dataUrl}"></audio>`;
    else inner += `📄 <a href="${m.media.dataUrl}" download="${m.media.fileName || 'file'}" style="color:#53bdeb">${escapeHtml(m.media.fileName || 'ফাইল')}</a>`;
    if (m.text && m.text !== m.media.fileName) inner += `<div>${escapeHtml(m.text)}</div>`;
  } else if (m.type === 'voice' && m.voice) {
    inner += `🎤 <audio controls src="${m.voice.dataUrl}"></audio> <small>(${m.voice.duration}s)</small>`;
  } else {
    inner += escapeHtml(m.text);
  }
  inner += `<div class="meta">${mine ? '' : escapeHtml(m.from.split('@')[0]) + ' • '}${time} ${mine ? '<span class="tick">✓✓</span>' : ''}</div>`;
  div.innerHTML = inner;
  div.ondblclick = () => { replyTo = m.text || 'মেসেজ'; $('replyText').textContent = replyTo.slice(0, 60); $('replyBar').classList.remove('hidden'); };
  div.oncontextmenu = (e) => { e.preventDefault(); const r = prompt('রিয়্যাকশন দিন (❤️ 👍 😂 😮 😢):', '❤️'); if (r) div.innerHTML += ' ' + r; };
  $('messages').appendChild(div);
  $('messages').scrollTop = 99999;
  if (!mine) socket?.emit('chat:read', { id: m.id });
  if (m.expiresAt) setTimeout(() => div.remove(), m.expiresAt - Date.now());
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- Send ----
$('sendBtn').onclick = send;
$('msgInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') send();
  socket?.emit('chat:typing', { to: currentPeer, isTyping: true });
  clearTimeout(window._t); window._t = setTimeout(() => socket?.emit('chat:typing', { to: currentPeer, isTyping: false }), 1200);
});
window.addEventListener('voice-send', send);
function send() {
  let t = $('msgInput').value.trim();
  if (!t) return;
  // বাংলা বাক্যে শেষে দাঁড়ি না থাকলে যোগ করো
  if (/[\u0980-\u09FF]$/.test(t) && !/[।?!]$/.test(t)) t += '।';
  socket.emit('chat:message', { to: currentPeer, text: t, replyTo, disappearSec: Number($('disappear').value) || null });
  $('msgInput').value = ''; replyTo = null; $('replyBar').classList.add('hidden');
}
$('replyCancel').onclick = () => { replyTo = null; $('replyBar').classList.add('hidden'); };
// search
$('search').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.bubble').forEach(b => b.style.outline = q && b.textContent.toLowerCase().includes(q) ? '2px solid #ffd60a' : '');
};
// theme
$('themeBtn').onclick = () => document.body.classList.toggle('light');
// logout
function logout() { token = ''; localStorage.removeItem('sc_token'); location.reload(); }
$('logoutBtn').onclick = logout;

// ---- Voice typing button ----
$('voiceTypeBtn').onclick = () => {
  if (!window.VoiceTyper || !VoiceTyper.supported()) { alert('Chrome / Edge-এ 🎙️ ভয়েস টাইপিং সবচেয়ে ভালো চলে।'); return; }
  VoiceTyper.isListening() ? VoiceTyper.stop() : VoiceTyper.start($('msgInput'));
};
$('voiceStop').onclick = () => VoiceTyper.stop();

// ---- Voice message (record & send) ----
let mr = null, chunks = [], recStart = 0;
$('voiceMsgBtn').onclick = async () => {
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
      mr = null; $('voiceMsgBtn').textContent = '🎤';
      stream.getTracks().forEach(t => t.stop());
    };
    mr.start(); $('voiceMsgBtn').textContent = '⏹️';
    alert('🎤 রেকর্ড হচ্ছে... থামাতে আবার চাপুন।');
  } catch { alert('মাইক্রোফোন অনুমতি দিন।'); }
};

// ---- Status ----
$('statusBtn').onclick = () => { $('statusModal').classList.remove('hidden'); renderStatus(); };
$('statusClose').onclick = () => $('statusModal').classList.add('hidden');
$('statusPost').onclick = () => {
  const t = $('statusText').value.trim(); if (!t) return;
  statuses.push({ by: me.email, text: t, at: Date.now() });
  localStorage.setItem('sc_status', JSON.stringify(statuses));
  $('statusText').value = ''; renderStatus();
};
function renderStatus() {
  const now = Date.now();
  statuses = statuses.filter(s => now - s.at < 86400000);
  localStorage.setItem('sc_status', JSON.stringify(statuses));
  $('statusList').innerHTML = statuses.map(s => `<p>⭕ <b>${escapeHtml(s.by.split('@')[0])}</b>: ${escapeHtml(s.text)}</p>`).join('') || '<p>কোনো স্ট্যাটাস নেই।</p>';
}

// ---- Admin panel ----
$('adminBtn').onclick = async () => { $('adminModal').classList.remove('hidden'); try{ await refreshAdminList(); }catch(e){ $('adminMsg').textContent='⛔ '+e.message; } };
$('adminClose').onclick = () => $('adminModal').classList.add('hidden');
$('adminRefresh').onclick = () => refreshAdminList().catch(e=>$('adminMsg').textContent='⛔ '+e.message);
$('adminAdd').onclick = async () => {
  $('adminMsg').textContent='যোগ হচ্ছে...';
  try{
    await api('/api/admin/add-user',{method:'POST',body:JSON.stringify({email:$('adminEmail').value.trim(),password:$('adminPass').value,name:$('adminName').value.trim()})});
    $('adminMsg').textContent='✅ যোগ হয়েছে'; $('adminEmail').value=''; $('adminPass').value=''; $('adminName').value='';
    await refreshAdminList();
  }catch(e){ $('adminMsg').textContent='⛔ '+e.message; }
};
async function removeUser(email){ if(!confirm(email+' কে সরাবেন?')) return; try{ await api('/api/admin/remove-user',{method:'POST',body:JSON.stringify({email})}); await refreshAdminList(); }catch(e){ alert(e.message); } }
async function resetPass(email){ const p=prompt(email+' এর নতুন পাসওয়ার্ড (৬+):'); if(!p) return; try{ await api('/api/admin/reset-password',{method:'POST',body:JSON.stringify({email,password:p})}); alert('✅ পাসওয়ার্ড রিসেট হয়েছে'); }catch(e){ alert(e.message); } }
window.removeUser=removeUser; window.resetPass=resetPass;

// ---- Calls (WebRTC 1-1) ----
let pc = null, localStream = null, callPeer = null;
async function acceptCall(from, kind, isCaller) {
  callPeer = from; $('callModal').classList.remove('hidden');
  $('callTitle').textContent = (kind === 'voice' ? '📞 ভয়েস কল: ' : '🎥 ভিডিও কল: ') + from;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind !== 'voice' }).catch(() => null);
  if (!localStream) { $('callStatus').textContent = 'ক্যামেরা/মাইক পাওয়া যায়নি'; return; }
  if (kind === 'voice') { $('localVideo').style.display = 'none'; $('remoteVideo').style.display = 'none'; }
  $('localVideo').srcObject = localStream;
  pc = new RTCPeerConnection();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (e) => $('remoteVideo').srcObject = e.streams[0];
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('call:signal', { to: callPeer, signal: { candidate: e.candidate } }); };
  if (isCaller) {
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    socket.emit('call:signal', { to: callPeer, signal: pc.localDescription });
  }
  $('callStatus').textContent = '🔊 সংযুক্ত...';
}
$('voiceCallBtn').onclick = () => { if (currentPeer === 'group') return alert('1-1 চ্যাটে গিয়ে কল দিন।'); socket.emit('call:invite', { to: currentPeer, kind: 'voice' }); acceptCall(currentPeer, 'voice', true); };
$('videoCallBtn').onclick = () => { if (currentPeer === 'group') return alert('1-1 চ্যাটে গিয়ে কল দিন।'); socket.emit('call:invite', { to: currentPeer, kind: 'video' }); acceptCall(currentPeer, 'video', true); };
$('callHang').onclick = () => { if (callPeer) socket.emit('call:end', { to: callPeer }); endCallUI(); };
function endCallUI() {
  $('callModal').classList.add('hidden'); $('callStatus').textContent = 'সংযোগ হচ্ছে...';
  try { pc?.close(); localStream?.getTracks().forEach(t => t.stop()); } catch {}
  pc = null; callPeer = null;
}

// ---- Media Upload (ছবি/ভিডিও/ফাইল) ----
$('mediaInput').onchange = async (e) => {
  for (const file of e.target.files) {
    const rd = new FileReader();
    rd.onload = () => {
      pendingMedia.push({ dataUrl: rd.result, mimeType: file.type, fileName: file.name });
      showMediaPreview();
    };
    rd.readAsDataURL(file);
  }
  e.target.value = '';
};
function showMediaPreview() {
  const existing = document.querySelector('.media-preview-bar');
  if (existing) existing.remove();
  if (!pendingMedia.length) return;
  const bar = document.createElement('div');
  bar.className = 'media-preview-bar';
  pendingMedia.forEach((m, i) => {
    const el = document.createElement('div');
    if (m.mimeType.startsWith('image/')) el.innerHTML = `<img src="${m.dataUrl}">`;
    else if (m.mimeType.startsWith('video/')) el.innerHTML = `<video src="${m.dataUrl}" style="max-height:60px"></video>`;
    else el.innerHTML = `<small>📄 ${escapeHtml(m.fileName)}</small>`;
    const rm = document.createElement('button');
    rm.className = 'remove-media'; rm.textContent = '✕';
    rm.onclick = () => { pendingMedia.splice(i, 1); showMediaPreview(); };
    el.appendChild(rm); bar.appendChild(el);
  });
  $('messages').before(bar);
}
// Override send to include media
const origSend = send;
send = function() {
  let t = $('msgInput').value.trim();
  if (!t && !pendingMedia.length) return;
  if (/[\u0980-\u09FF]$/.test(t) && !/[।?!]$/.test(t)) t += '।';
  for (const m of pendingMedia) {
    socket.emit('chat:message', { to: currentPeer, text: t || m.fileName, media: m, replyTo, disappearSec: Number($('disappear').value) || null });
  }
  if (!pendingMedia.length) socket.emit('chat:message', { to: currentPeer, text: t, replyTo, disappearSec: Number($('disappear').value) || null });
  $('msgInput').value = ''; pendingMedia = []; replyTo = null;
  const bar = document.querySelector('.media-preview-bar'); if (bar) bar.remove();
  $('replyBar').classList.add('hidden');
};

// ---- Settings (2FA + Theme) ----
$('settingsBtn').onclick = async () => {
  $('settingsModal').classList.remove('hidden');
  try {
    const j = await api('/api/me');
    // check 2FA status from last login
    $('twofaStatus').textContent = 'বর্তমান স্ট্যাটাস: ' + (me.twofaEnabled ? '✅ চালু' : '❌ বন্ধ');
  } catch {}
};
$('settingsClose').onclick = () => $('settingsModal').classList.add('hidden');
$('toggle2FA').onclick = async () => {
  try {
    const j = await api('/api/2fa/enable', { method: 'POST', body: '{}' });
    $('twofaStatus').textContent = '✅ 2FA চালু হয়েছে। OTP: ' + j.message.split('OTP: ')[1];
    me.twofaEnabled = true;
  } catch (e) {
    try {
      await api('/api/2fa/disable', { method: 'POST', body: '{}' });
      $('twofaStatus').textContent = '❌ 2FA বন্ধ হয়েছে।';
      me.twofaEnabled = false;
    } catch (e2) { alert(e2.message); }
  }
};

// ---- Theme ----
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
