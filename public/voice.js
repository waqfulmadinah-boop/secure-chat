// ===== উন্নত ভয়েস টাইপিং ইঞ্জিন (Web Speech API) =====
// ফিচার: continuous + interim, বাংলা/English, অটো-দাঁড়ি, ভয়েস কমান্ড, confidence
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, finalText = '', baseInputValue = '';

  const $ = (id) => document.getElementById(id);

  function supported() { return !!SR; }

  function autoPunctuate(text, lang) {
    if (!$('autoPunct')?.checked) return text;
    let t = text.trim();
    if (!t) return t;
    // প্রশ্ন শব্দ থাকলে ? যোগ করা
    if (/^(কি|কী|কেন|কবে|কোথায়|কোথায়|কেমন|কত|who|what|when|where|why|how)\b/i.test(t) && !/[?؟।.!]$/.test(t)) {
      t += (lang.startsWith('bn') ? '?' : '?');
    } else if (!/[।?!.…]$/.test(t)) {
      // বাংলা হলে দাঁড়ি, ইংরেজি হলে ফুলস্টপ — বাক্যের শেষে শুধু preview-এ দেখানো হয়, পাঠানোর সময় যোগ হয়
    }
    // প্রথম অক্ষর বড় হাতের (ইংরেজি)
    if (lang.startsWith('en')) t = t.charAt(0).toUpperCase() + t.slice(1);
    return t;
  }

  function handleCommand(spoken, input) {
    const s = spoken.trim().toLowerCase();
    const autoSend = $('autoSend')?.checked;
    if (/(পাঠাও|পাঠিয়ে দাও|পাঠিয়ে দাও|send it|send)$/.test(s)) {
      if (autoSend) { setTimeout(() => window.dispatchEvent(new CustomEvent('voice-send')), 300); return true; }
    }
    if (/(মুছে ফেলো|মুছে ফেল|ডিলিট করো|clear|delete all)$/.test(s)) {
      input.value = ''; finalText = ''; $('voiceInterim').textContent = 'মুছে ফেলা হয়েছে'; return true;
    }
    if (/(নতুন লাইন|নতুন লাইন দাও|new line|next line)$/.test(s)) {
      input.value += '\n'; finalText = input.value; return true;
    }
    return false;
  }

  function start(input) {
    if (!supported()) { alert('এই ব্রাউজারে ভয়েস টাইপিং সাপোর্ট নেই। Chrome / Edge ব্যবহার করুন।'); return; }
    if (listening) { stop(); return; }
    const lang = $('voiceLang')?.value || 'bn-BD';
    rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    baseInputValue = input.value ? input.value + ' ' : '';
    finalText = baseInputValue;

    rec.onstart = () => {
      listening = true;
      $('voicePanel').classList.remove('hidden');
      $('voiceTypeBtn').classList.add('listening');
      $('voiceState').textContent = '🎙️ শুনছি... বলুন (' + lang + ')';
    };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0].transcript;
        if (r.isFinal) {
          const conf = r[0].confidence;
          if (conf && conf < 0.4) continue; // খুব কম confidence বাদ
          if (!handleCommand(txt, input)) {
            finalText += autoPunctuate(txt, lang) + ' ';
            input.value = finalText;
            input.focus();
          }
        } else interim += txt;
      }
      $('voiceInterim').textContent = interim;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') $('voiceState').textContent = '❌ মাইক্রোফোন অনুমতি দিন (🔒 আইকনে ক্লিক করে Allow)';
      else if (e.error === 'no-speech') $('voiceState').textContent = '🔇 কথা শোনা যাচ্ছে না, আবার বলুন...';
      else $('voiceState').textContent = '⚠️ ' + e.error;
    };
    rec.onend = () => {
      // continuous রাখতে নিজে থেকে বন্ধ হলে আবার চালু (যতক্ষণ user থামায়নি)
      if (listening) { try { rec.start(); } catch {} }
      else { $('voicePanel').classList.add('hidden'); $('voiceTypeBtn').classList.remove('listening'); }
    };
    try { rec.start(); } catch {}
  }

  function stop() {
    listening = false;
    try { rec && rec.stop(); } catch {}
    $('voicePanel').classList.add('hidden');
    $('voiceTypeBtn').classList.remove('listening');
  }

  function isListening() { return listening; }

  window.VoiceTyper = { start, stop, isListening, supported };
})();
