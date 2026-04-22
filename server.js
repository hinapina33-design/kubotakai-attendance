const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const APP_URL = process.env.APP_URL || '';
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) {}
  return { members: [], events: [], responses: {}, sentReminders: {} };
}

function save(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data)); } catch(e) { console.error(e); }
}

async function broadcast(msg) {
  if (!LINE_TOKEN) { console.log('LINE_TOKEN未設定、送信スキップ'); return; }
  try {
    await axios.post('https://api.line.me/v2/bot/message/broadcast', {
      messages: [{ type: 'text', text: msg }]
    }, { headers: { 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' } });
    console.log('LINE送信成功:', msg.substring(0, 30));
  } catch(e) {
    console.error('LINE送信エラー:', e.response?.data || e.message);
  }
}

app.get('/api/data', (req, res) => res.json(load()));

app.post('/api/members', (req, res) => {
  const d = load(); d.members = req.body.members; save(d); res.json({ ok: true });
});

app.post('/api/events', (req, res) => {
  const d = load(); d.events = req.body.events; save(d); res.json({ ok: true });
});

app.post('/api/response', (req, res) => {
  const { eventId, memberId, answer } = req.body;
  const d = load();
  if (!d.responses[eventId]) d.responses[eventId] = {};
  d.responses[eventId][memberId] = answer;
  save(d); res.json({ ok: true });
});

app.post('/api/verify-password', (req, res) => {
  res.json({ ok: req.body.password === ADMIN_PASSWORD });
});

app.post('/api/send-reminder', async (req, res) => {
  const { eventTitle, deadline, url } = req.body;
  const msg = `【出欠確認リマインド】\n${eventTitle}\n\n期限：${deadline}\n\nまだ回答されていない方はこちらからご回答ください👇\n${url || APP_URL}`;
  await broadcast(msg);
  res.json({ ok: true });
});

// 30分ごとにリマインドチェック
cron.schedule('*/30 * * * *', async () => {
  console.log('リマインドチェック実行:', new Date().toLocaleString('ja-JP'));
  const d = load();
  const now = new Date();
  if (!d.sentReminders) d.sentReminders = {};

  for (const event of (d.events || [])) {
    if (!event.dDate) continue;
    const deadline = new Date(`${event.dDate}T${event.dTime || '23:59'}`);
    if (deadline < now) continue;

    const responses = d.responses[event.id] || {};
    const unanswered = (d.members || []).filter(m => !responses[m.id]);
    if (unanswered.length === 0) continue;

    for (const rem of (event.rems || [])) {
      const remTime = new Date(deadline.getTime() - rem.h * 60 * 60 * 1000);
      const key = `${event.id}_${rem.h}`;
      const window = 30 * 60 * 1000;

      if (remTime <= now && remTime > new Date(now.getTime() - window) && !d.sentReminders[key]) {
        const names = unanswered.map(m => m.name).join('、');
        const msg = `【出欠確認リマインド】\n${event.title}\n\n期限：${event.dDate} ${event.dTime || ''}\n未回答：${unanswered.length}名\n（${names}）\n\nこちらから回答してください👇\n${APP_URL}`;
        await broadcast(msg);
        d.sentReminders[key] = now.toISOString();
        save(d);
      }
    }
  }
});

app.listen(PORT, () => console.log(`サーバー起動: port ${PORT}`));
