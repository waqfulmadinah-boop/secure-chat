# 🔒 Secure Chat — প্রাইভেট হোয়াটসঅ্যাপ

নির্দিষ্ট Gmail + Password ছাড়া কেউ ঢুকতে পারবে না। উন্নত বাংলা ভয়েস টাইপিং সহ।

## চালানো
```bash
cd secure-chat
npm install
npm start
```
তারপর ব্রাউজারে: http://localhost:3000

## ডেমো লগইন
- amar@gmail.com / Amar1234
- srity@gmail.com / Srity1234

## নতুন Gmail যোগ করা (.env)
```
ALLOWED_EMAILS=amar@gmail.com,srity@gmail.com,notun@gmail.com
DEFAULT_PASSWORDS=amar@gmail.com:Amar1234,srity@gmail.com:Srity1234,notun@gmail.com:Notun1234
```
- users.json ডিলিট করে সার্ভার রিস্টার্ট দিলে নতুন পাসওয়ার্ড hash হয়ে যাবে।
- লিস্টের বাইরের Gmail → 403 "প্রবেশাধিকার নেই"।

## উন্নত ভয়েস টাইপিং 🎙️
1. চ্যাটে 🎙️ বাটন চাপুন → মাইক্রোফোন Allow করুন
2. ভাষা বেছে নিন: বাংলা (BD) / English / हिन्दी
3. কথা বলুন → লাইভ লেখা উঠবে (হলুদ = interim, সাদা = ফাইনাল)
4. ভয়েস কমান্ড:
   - "পাঠাও" → (অটো-সেন্ড অন থাকলে) মেসেজ চলে যাবে
   - "মুছে ফেলো" → লেখা মুছবে
   - "নতুন লাইন" → নিচের লাইনে যাবে
5. Chrome / Edge-এ সেরা চলে।

## ফিচার
- ✅ Allowlist Gmail login + bcrypt + JWT + rate-limit
- ✅ Realtime chat (Socket.io), typing..., ✓✓ টিক, reply (ডাবল-ক্লিক), reaction (রাইট-ক্লিক)
- ✅ 1-1 + গ্রুপ চ্যাট, Disappearing message, ডার্ক/লাইট, সার্চ
- ✅ ভয়েস মেসেজ (🎤 রেকর্ড), স্ট্যাটাস (24h), ভয়েস/ভিডিও কল (WebRTC)
