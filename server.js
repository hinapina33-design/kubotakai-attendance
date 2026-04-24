const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ==================== PostgreSQL ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const LINE_TOKEN = process.env.LINE_TOKEN;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

// ==================== メンバーリスト ====================
const INITIAL_MEMBERS = [
  '久保田知典', '上嶋佐智恵', '能勢文博', '吉岡真人', '浅岡大介', '津田彰', '松山司', '西野信寿',
  '坂本翼', '秋山淳', '越後谷真人', '廣井騰哉', '加藤博久', '佐藤真', '大橋爪励支', '森川貴之',
  '伊藤義知', '古市巧', '木島裕幸', '中谷護', '高橋祐司', '山田和弘', '瀬片博仁', '杉田翔',
  '今村優', '大野祐樹', '金子泰典', 'エンジェル', '片山翼', '石井克彦', '篠原隆之', '山本将平',
  '小林幸彦', '髙木寿展', '鳥巣大輔', '袴田一人', '福田駿太', '椙山泰丞', '古武家英明', '永田展久',
  '仲里秀仁', '中森康之', '亀井元志', '梶家秀紀', '竹中幸宏', '中西崇', '榎本真幸', '柳田雅生',
  '角田季未裕', '中西広訓', '森田康嗣', '古舘晃', '舘岡大地', '伊藤悟', '立花優樹', '矢口正浩',
  '集崇', '西川洋一'
];

// ==================== DB初期化 ====================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      line_user_id VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      event_date VARCHAR(100),
      deadline VARCHAR(100),
      questions JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
      member_name VARCHAR(100) NOT NULL,
      attendance VARCHAR(20),
      answers JSONB DEFAULT '{}',
      responded_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(event_id, member_name)
    )
  `);

  for (const name of INITIAL_MEMBERS) {
    await pool.query(
      'INSERT INTO members (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name]
    );
  }

  console.log('Database initialized');
}

// ==================== ユーティリティ ====================
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseStyle() {
  return `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Segoe UI', sans-serif; background: #f0f4f8; color: #333; }
      .container { max-width: 620px; margin: 0 auto; padding: 20px; }
      .card { background: white; border-radius: 14px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
      h1 { color: #2c5282; text-align: center; padding: 20px 0 10px; font-size: 1.4em; }
      h2 { color: #2c5282; margin-bottom: 16px; font-size: 1.1em; }
      h3 { color: #4a5568; margin-bottom: 10px; font-size: 1em; }
      label { display: block; font-weight: bold; margin-bottom: 6px; color: #4a5568; font-size: 0.9em; }
      input[type="text"], select, textarea {
        width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0;
        border-radius: 8px; font-size: 0.95em; margin-bottom: 14px;
        font-family: inherit;
      }
      input:focus, select:focus, textarea:focus { outline: none; border-color: #4299e1; }
      .btn { display: inline-block; padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; font-size: 0.9em; text-decoration: none; }
      .btn-primary { background: #4299e1; color: white; }
      .btn-primary:hover { background: #3182ce; }
      .btn-success { background: #48bb78; color: white; }
      .btn-danger { background: #fc8181; color: white; }
      .btn-warning { background: #f6ad55; color: white; }
      .btn-gray { background: #e2e8f0; color: #4a5568; }
      .btn-sm { padding: 6px 12px; font-size: 0.82em; }
      .btn-block { display: block; width: 100%; text-align: center; padding: 14px; font-size: 1em; }
      .alert-success { background: #c6f6d5; border: 2px solid #48bb78; border-radius: 10px; padding: 14px; margin-bottom: 16px; color: #276749; text-align: center; }
      .alert-error { background: #fed7d7; border: 2px solid #fc8181; border-radius: 10px; padding: 14px; margin-bottom: 16px; color: #9b2c2c; text-align: center; }
      .tag { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 0.82em; }
      .tag-yes { background: #c6f6d5; color: #276749; }
      .tag-no { background: #fed7d7; color: #9b2c2c; }
      .tag-maybe { background: #fefcbf; color: #975a16; }
      .tag-none { background: #e2e8f0; color: #718096; }
      .text-muted { color: #718096; font-size: 0.88em; }
      .divider { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
    </style>`;
}

// ==================== LINE ヘルパー ====================
async function pushMessage(userId, messages) {
  if (!userId || !LINE_TOKEN) return;
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      { to: userId, messages: Array.isArray(messages) ? messages : [messages] },
      { headers: { 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('LINE push error:', err.response?.data || err.message);
  }
}

async function replyMessage(replyToken, messages) {
  if (!LINE_TOKEN) return;
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      { replyToken, messages: Array.isArray(messages) ? messages : [messages] },
      { headers: { 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('LINE reply error:', err.response?.data || err.message);
  }
}

// ==================== LINE Webhook ====================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    const userId = event.source.userId;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;
    const memberResult = await pool.query('SELECT * FROM members WHERE name = $1', [text]);
    if (memberResult.rows.length > 0) {
      const member = memberResult.rows[0];
      const isUpdate = member.line_user_id && member.line_user_id !== userId;
      await pool.query('UPDATE members SET line_user_id = $1 WHERE name = $2', [userId, text]);
      await replyMessage(replyToken, {
        type: 'text',
        text: isUpdate
          ? `${text}さんとして再登録しました✅\n今後、イベントのお知らせはこちらに届きます。`
          : `${text}さんとして登録しました✅\n今後、イベントのお知らせはこちらに届きます。`
      });
    } else {
      await replyMessage(replyToken, {
        type: 'text',
        text: `メッセージを受け取りました。\nLINEに名前を登録するには、メンバーリストに登録されているフルネームを送信してください。\n\n例：「久保田知典」`
      });
    }
  }
});

// ==================== トップページ ====================
app.get('/', async (req, res) => {
  try {
    const eventsResult = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
    const events = eventsResult.rows;
    let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>久保田会 出欠確認</title>${baseStyle()}</head><body><div class="container"><h1>🍺 久保田会 出欠確認</h1>`;
    if (events.length === 0) {
      html += `<div class="card" style="text-align:center; color:#a0aec0; padding:40px;">現在イベントはありません</div>`;
    } else {
      for (const event of events) {
        const respResult = await pool.query("SELECT COUNT(*) FILTER (WHERE attendance='yes') AS yes_count, COUNT(*) AS total FROM responses WHERE event_id=$1", [event.id]);
        const stats = respResult.rows[0];
        html += `<div class="card"><div style="font-size:1.1em; font-weight:bold; color:#2d3748; margin-bottom:8px;">${escHtml(event.title)}</div><div class="text-muted" style="margin-bottom:12px;">${event.event_date ? `📅 ${escHtml(event.event_date)}&nbsp;&nbsp;` : ''}${event.deadline ? `⏰ 期限: ${escHtml(event.deadline)}&nbsp;&nbsp;` : ''}参加予定: ${stats.yes_count}名 / 回答済み: ${stats.total}名</div><a href="/attend/${event.id}" class="btn btn-primary btn-sm">📝 出欠を回答する</a> &nbsp; <a href="/results/${event.id}" class="btn btn-success btn-sm">📊 結果を見る</a></div>`;
      }
    }
    html += `</div></body></html>`;
    res.send(html);
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

// ==================== 出欠回答ページ ====================
app.get('/attend/:eventId', async (req, res) => {
  try {
    if (req.query.clearname) { res.clearCookie('member_name'); return res.redirect(`/attend/${req.params.eventId}`); }
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.eventId]);
    if (eventResult.rows.length === 0) return res.status(404).send('イベントが見つかりません');
    const event = eventResult.rows[0];
    const savedName = req.cookies['member_name'] || '';
    const questions = event.questions || [];
    let existingResponse = null;
    if (savedName) {
      const r = await pool.query('SELECT * FROM responses WHERE event_id=$1 AND member_name=$2', [event.id, savedName]);
      if (r.rows.length > 0) existingResponse = r.rows[0];
    }
    const membersResult = await pool.query('SELECT name FROM members ORDER BY id');
    const members = membersResult.rows.map(r => r.name);
    const existingAttendance = existingResponse ? existingResponse.attendance : '';
    const existingAnswers = existingResponse ? (existingResponse.answers || {}) : {};
    let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escHtml(event.title)} - 出欠回答</title>${baseStyle()}<style>.attend-btns{display:flex;gap:10px;margin-bottom:16px;}.attend-btn{flex:1;padding:14px 8px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;font-size:0.95em;background:white;font-weight:bold;transition:all 0.15s;text-align:center;}.attend-btn.sel-yes{background:#48bb78;color:white;border-color:#48bb78;}.attend-btn.sel-no{background:#fc8181;color:white;border-color:#fc8181;}.attend-btn.sel-maybe{background:#f6ad55;color:white;border-color:#f6ad55;}.opt-label{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:6px;}.opt-label input{width:18px;height:18px;flex-shrink:0;}</style></head><body><div class="container"><h1>📋 ${escHtml(event.title)}</h1><div class="card"><div class="text-muted" style="margin-bottom:16px;line-height:1.8;">${event.event_date ? `📅 日時: ${escHtml(event.event_date)}<br>` : ''}${event.deadline ? `⏰ 回答期限: ${escHtml(event.deadline)}` : ''}</div>${existingResponse ? `<div class="alert-success" style="margin-bottom:16px;">✅ 回答済みです。内容を変更する場合は再度送信してください。</div>` : ''}<form id="attendForm" method="POST" action="/attend/${event.id}"><label>お名前 *</label>`;
    if (savedName) {
      html += `<div style="padding:10px 12px;background:#f7fafc;border:2px solid #e2e8f0;border-radius:8px;margin-bottom:14px;font-size:0.95em;">${escHtml(savedName)}<a href="/attend/${event.id}?clearname=1" style="float:right;color:#a0aec0;font-size:0.85em;text-decoration:none;">変更</a></div><input type="hidden" name="memberName" value="${escHtml(savedName)}">`;
    } else {
      html += `<select name="memberName" required><option value="">-- 名前を選んでください --</option>`;
      for (const name of members) { html += `<option value="${escHtml(name)}">${escHtml(name)}</option>`; }
      html += `</select>`;
    }
    html += `<label>出欠 *</label><div class="attend-btns"><button type="button" class="attend-btn" id="btn-yes" onclick="selAttend('yes',this)">✅ 参加</button><button type="button" class="attend-btn" id="btn-no" onclick="selAttend('no',this)">❌ 不参加</button><button type="button" class="attend-btn" id="btn-maybe" onclick="selAttend('maybe',this)">🤔 未定</button></div><input type="hidden" name="attendance" id="attendanceInput">`;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const prevVals = existingAnswers[`q_${i}`] || [];
      html += `<hr class="divider"><div style="margin-bottom:14px;"><label>Q${i+1}. ${escHtml(q.text)}</label>`;
      for (const opt of q.options) {
        const checked = prevVals.includes(opt) ? 'checked' : '';
        if (q.type === 'single') { html += `<label class="opt-label"><input type="radio" name="q_${i}" value="${escHtml(opt)}" ${checked}>${escHtml(opt)}</label>`; }
        else { html += `<label class="opt-label"><input type="checkbox" name="q_${i}" value="${escHtml(opt)}" ${checked}>${escHtml(opt)}</label>`; }
      }
      html += `</div>`;
    }
    html += `<button type="submit" class="btn btn-primary btn-block" style="margin-top:8px;">回答を送信する</button></form></div><p style="text-align:center;margin-top:16px;"><a href="/results/${event.id}" style="color:#4299e1;">📊 結果を見る</a>&nbsp;&nbsp;<a href="/" style="color:#a0aec0;">トップへ戻る</a></p></div><script>const prevAttend=${JSON.stringify(existingAttendance)};function selAttend(val,btn){document.getElementById('attendanceInput').value=val;['yes','no','maybe'].forEach(v=>{document.getElementById('btn-'+v).className='attend-btn';});const cls={yes:'sel-yes',no:'sel-no',maybe:'sel-maybe'};btn.classList.add(cls[val]);}if(prevAttend){const btn=document.getElementById('btn-'+prevAttend);if(btn)selAttend(prevAttend,btn);}document.getElementById('attendForm').addEventListener('submit',function(e){if(!document.getElementById('attendanceInput').value){e.preventDefault();alert('出欠を選択してください');}});</script></body></html>`;
    res.send(html);
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

app.post('/attend/:eventId', async (req, res) => {
  try {
    const { memberName, attendance } = req.body;
    const eventId = req.params.eventId;
    if (!memberName || !attendance) return res.status(400).send('入力が不足しています');
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) return res.status(404).send('イベントが見つかりません');
    const event = eventResult.rows[0];
    const questions = event.questions || [];
    const answers = {};
    for (let i = 0; i < questions.length; i++) {
      const val = req.body[`q_${i}`];
      if (val) { answers[`q_${i}`] = Array.isArray(val) ? val : [val]; }
    }
    await pool.query(`INSERT INTO responses (event_id, member_name, attendance, answers) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id, member_name) DO UPDATE SET attendance = $3, answers = $4, responded_at = NOW()`, [eventId, memberName, attendance, JSON.stringify(answers)]);
    res.cookie('member_name', memberName, { maxAge: 365*24*60*60*1000, httpOnly: false });
    res.redirect(`/results/${eventId}?thankyou=1`);
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

// ==================== 結果ページ ====================
app.get('/results/:eventId', async (req, res) => {
  try {
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.eventId]);
    if (eventResult.rows.length === 0) return res.status(404).send('イベントが見つかりません');
    const event = eventResult.rows[0];
    const responsesResult = await pool.query('SELECT * FROM responses WHERE event_id=$1 ORDER BY responded_at', [event.id]);
    const responses = responsesResult.rows;
    const membersResult = await pool.query('SELECT name FROM members ORDER BY id');
    const allMembers = membersResult.rows.map(r => r.name);
    const respondedNames = new Set(responses.map(r => r.member_name));
    const notResponded = allMembers.filter(n => !respondedNames.has(n));
    const yesMembers = responses.filter(r => r.attendance === 'yes');
    const noMembers = responses.filter(r => r.attendance === 'no');
    const maybeMembers = responses.filter(r => r.attendance === 'maybe');
    const questions = event.questions || [];
    const thankYou = req.query.thankyou === '1';
    const pct = allMembers.length > 0 ? Math.round(responses.length / allMembers.length * 100) : 0;
    let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escHtml(event.title)} - 結果</title>${baseStyle()}<style>.summary{display:flex;gap:10px;margin-bottom:16px;}.summary-item{flex:1;text-align:center;padding:14px 8px;border-radius:10px;}.s-yes{background:#f0fff4;border:2px solid #48bb78;}.s-no{background:#fff5f5;border:2px solid #fc8181;}.s-maybe{background:#fffaf0;border:2px solid #f6ad55;}.s-num{font-size:1.9em;font-weight:bold;}.s-label{font-size:0.82em;color:#718096;}.progress-bar{background:#e2e8f0;border-radius:10px;height:10px;overflow:hidden;margin-bottom:4px;}.progress-fill{height:100%;border-radius:10px;background:#4299e1;}.member-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;min-height:24px;}.q-opt-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:0.9em;}.q-opt-bar{background:#e2e8f0;border-radius:6px;height:8px;margin-bottom:10px;overflow:hidden;}.q-opt-fill{height:100%;background:#68d391;border-radius:6px;}</style></head><body><div class="container"><h1>📊 ${escHtml(event.title)}</h1>${thankYou ? `<div class="alert-success">✅ 回答を受け付けました！ありがとうございます。</div>` : ''}<div class="card"><div class="text-muted" style="margin-bottom:12px;">${event.event_date ? `📅 ${escHtml(event.event_date)}&nbsp;&nbsp;` : ''}${event.deadline ? `⏰ 期限: ${escHtml(event.deadline)}` : ''}</div><div class="summary"><div class="summary-item s-yes"><div class="s-num" style="color:#38a169">${yesMembers.length}</div><div class="s-label">✅ 参加</div></div><div class="summary-item s-no"><div class="s-num" style="color:#e53e3e">${noMembers.length}</div><div class="s-label">❌ 不参加</div></div><div class="summary-item s-maybe"><div class="s-num" style="color:#dd6b20">${maybeMembers.length}</div><div class="s-label">🤔 未定</div></div></div><div class="text-muted" style="margin-bottom:6px;">回答済み: ${responses.length}名 / 全${allMembers.length}名 (${pct}%)</div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div><div class="card"><h3>✅ 参加 (${yesMembers.length}名)</h3><div class="member-tags">${yesMembers.map(r=>`<span class="tag tag-yes">${escHtml(r.member_name)}</span>`).join('')||'<span class="text-muted">なし</span>'}</div><hr class="divider"><h3>❌ 不参加 (${noMembers.length}名)</h3><div class="member-tags">${noMembers.map(r=>`<span class="tag tag-no">${escHtml(r.member_name)}</span>`).join('')||'<span class="text-muted">なし</span>'}</div><hr class="divider"><h3>🤔 未定 (${maybeMembers.length}名)</h3><div class="member-tags">${maybeMembers.map(r=>`<span class="tag tag-maybe">${escHtml(r.member_name)}</span>`).join('')||'<span class="text-muted">なし</span>'}</div><hr class="divider"><h3>⏳ 未回答 (${notResponded.length}名)</h3><div class="member-tags">${notResponded.map(n=>`<span class="tag tag-none">${escHtml(n)}</span>`).join('')||'<span class="text-muted" style="color:#38a169;">全員回答済み 🎉</span>'}</div></div>`;
    if (questions.length > 0) {
      html += `<div class="card"><h2>💬 追加質問の結果</h2>`;
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const optCounts = {};
        for (const opt of q.options) optCounts[opt] = 0;
        for (const resp of responses) { const vals = (resp.answers||{})[`q_${i}`]||[]; for (const v of vals) { if (optCounts[v]!==undefined) optCounts[v]++; } }
        html += `<div style="margin-bottom:16px;"><div style="font-weight:bold;margin-bottom:10px;color:#4a5568;">Q${i+1}. ${escHtml(q.text)}</div>`;
        for (const [opt,count] of Object.entries(optCounts)) { const p=responses.length>0?Math.round(count/responses.length*100):0; html+=`<div class="q-opt-row"><span>${escHtml(opt)}</span><span class="text-muted">${count}名 (${p}%)</span></div><div class="q-opt-bar"><div class="q-opt-fill" style="width:${p}%"></div></div>`; }
        html += `</div>`;
        if (i < questions.length-1) html += `<hr class="divider">`;
      }
      html += `</div>`;
    }
    html += `<p style="text-align:center;margin-top:8px;margin-bottom:24px;"><a href="/attend/${event.id}" class="btn btn-primary btn-sm">📝 回答・変更する</a> &nbsp; <a href="/" class="btn btn-gray btn-sm">トップへ戻る</a></p></div></body></html>`;
    res.send(html);
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

// ==================== 管理者認証 ====================
app.get('/admin', (req, res) => {
  if (req.cookies['admin_auth'] === ADMIN_PASSWORD) return res.redirect('/admin/dashboard');
  res.send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>管理者ログイン</title>${baseStyle()}<style>body{display:flex;justify-content:center;align-items:center;min-height:100vh;}.login-card{background:white;padding:40px 36px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12);width:100%;max-width:360px;}.login-card h1{margin-bottom:24px;}</style></head><body><div class="login-card"><h1>🔐 管理者ログイン</h1>${req.query.error?`<div class="alert-error" style="margin-bottom:16px;">パスワードが違います</div>`:''}<form method="POST" action="/admin/login"><label>パスワード</label><input type="password" name="password" placeholder="パスワードを入力" required autofocus><button type="submit" class="btn btn-primary btn-block">ログイン</button></form></div></body></html>`);
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) { res.cookie('admin_auth', ADMIN_PASSWORD, { maxAge: 24*60*60*1000, httpOnly: true }); res.redirect('/admin/dashboard'); }
  else { res.redirect('/admin?error=1'); }
});

app.get('/admin/logout', (req, res) => { res.clearCookie('admin_auth'); res.redirect('/admin'); });

function requireAdmin(req, res, next) {
  if (req.cookies['admin_auth'] === ADMIN_PASSWORD) return next();
  res.redirect('/admin');
}

// ==================== 管理者ダッシュボード ====================
function adminLayout(title, content, activeTab) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escHtml(title)} - 久保田会管理</title>${baseStyle()}<style>.admin-header{background:#2c5282;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;}.admin-header h1{font-size:1.1em;}.admin-header a{color:rgba(255,255,255,0.8);font-size:0.85em;text-decoration:none;}.admin-nav{background:#2a4a7f;display:flex;gap:0;}.nav-tab{padding:12px 20px;color:rgba(255,255,255,0.75);text-decoration:none;font-size:0.9em;font-weight:bold;border-bottom:3px solid transparent;}.nav-tab:hover,.nav-tab.active{color:white;border-bottom-color:#63b3ed;background:rgba(255,255,255,0.05);}.event-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #e2e8f0;gap:10px;}.event-row:last-child{border-bottom:none;}.event-info{flex:1;min-width:0;}.event-actions{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;}.q-add-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;background:#f7fafc;border-radius:8px;padding:12px;}.q-fields{flex:1;}.q-fields input,.q-fields select{margin-bottom:6px;}</style></head><body><div class="admin-header"><h1>⚙️ 久保田会 管理画面</h1><a href="/admin/logout">ログアウト</a></div><div class="admin-nav"><a href="/admin/dashboard" class="nav-tab ${activeTab==='events'?'active':''}">📋 イベント管理</a><a href="/admin/members" class="nav-tab ${activeTab==='members'?'active':''}">👥 メンバー管理</a></div><div class="container" style="margin-top:16px;">${content}</div></body></html>`;
}

app.get('/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const eventsResult = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
    const events = eventsResult.rows;
    let eventRows = '';
    for (const event of events) {
      const r = await pool.query("SELECT COUNT(*) FILTER (WHERE attendance='yes') AS yes_c, COUNT(*) AS total FROM responses WHERE event_id=$1", [event.id]);
      const s = r.rows[0];
      eventRows += `<div class="event-row"><div class="event-info"><div style="font-weight:bold;color:#2d3748;font-size:0.95em;">${escHtml(event.title)}</div><div class="text-muted">${event.event_date||''} | 参加: ${s.yes_c}名 / 回答: ${s.total}名</div></div><div class="event-actions"><a href="/results/${event.id}" class="btn btn-success btn-sm">結果</a><form method="POST" action="/admin/events/${event.id}/remind" style="display:inline"><button type="submit" class="btn btn-warning btn-sm">リマインド</button></form><form method="POST" action="/admin/events/${event.id}/delete" style="display:inline" onsubmit="return confirm('削除しますか？')"><button type="submit" class="btn btn-danger btn-sm">削除</button></form></div></div>`;
    }
    const content = `${req.query.msg?`<div class="alert-success">${escHtml(req.query.msg)}</div>`:''}<div class="card"><h2>➕ 新規イベント作成</h2><form method="POST" action="/admin/events/create" onsubmit="prepareQ()"><label>イベント名 *</label><input type="text" name="title" placeholder="例: 2025年 忘年会" required><label>日時</label><input type="text" name="event_date" placeholder="例: 2025年12月20日 (土) 19:00〜"><label>回答期限</label><input type="text" name="deadline" placeholder="例: 12月15日 (月) まで"><label>追加質問（任意）</label><div id="qContainer"></div><button type="button" onclick="addQ()" style="padding:8px 16px;background:#edf2f7;border:none;border-radius:6px;cursor:pointer;margin-bottom:14px;font-size:0.85em;font-weight:bold;">＋ 質問を追加する</button><input type="hidden" name="questions" id="questionsData" value="[]"><button type="submit" class="btn btn-primary btn-block">✉️ イベントを作成してLINEで通知する</button></form></div><div class="card"><h2>📋 イベント一覧</h2>${events.length===0?`<p class="text-muted" style="text-align:center;padding:20px;">イベントはまだありません</p>`:eventRows}</div><script>let qIdx=0;function addQ(){const container=document.getElementById('qContainer');const div=document.createElement('div');div.className='q-add-row';div.innerHTML='<div class="q-fields"><input type="text" class="qt" placeholder="質問文"><select class="qq" style="padding:8px;border:2px solid #e2e8f0;border-radius:8px;width:100%;"><option value="single">単一選択</option><option value="multiple">複数選択</option></select><input type="text" class="qo" placeholder="選択肢をカンマ区切りで 例: はい,いいえ"></div><button type="button" onclick="this.parentElement.remove()" style="padding:8px 12px;background:#fed7d7;color:#9b2c2c;border:none;border-radius:6px;cursor:pointer;flex-shrink:0;">✕</button>';container.appendChild(div);qIdx++;}function prepareQ(){const qs=[];document.querySelectorAll('.q-add-row').forEach(row=>{const text=row.querySelector('.qt').value.trim();const type=row.querySelector('.qq').value;const opts=row.querySelector('.qo').value.split(',').map(s=>s.trim()).filter(s=>s);if(text&&opts.length)qs.push({text,type,options:opts});});document.getElementById('questionsData').value=JSON.stringify(qs);}</script>`;
    res.send(adminLayout('イベント管理', content, 'events'));
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

app.post('/admin/events/create', requireAdmin, async (req, res) => {
  try {
    const { title, event_date, deadline, questions } = req.body;
    const id = 'evt_' + Date.now();
    let parsedQ = [];
    try { parsedQ = JSON.parse(questions || '[]'); } catch (e) {}
    await pool.query('INSERT INTO events (id, title, event_date, deadline, questions) VALUES ($1,$2,$3,$4,$5)', [id, title, event_date||'', deadline||'', JSON.stringify(parsedQ)]);
    const membersResult = await pool.query('SELECT * FROM members WHERE line_user_id IS NOT NULL');
    const attendUrl = `${APP_URL}/attend/${id}`;
    let lines = [`【久保田会 出欠確認】\n\n📣 ${title}`];
    if (event_date) lines.push(`📅 ${event_date}`);
    if (deadline) lines.push(`⏰ 回答期限: ${deadline}`);
    lines.push(`\n▶️ 出欠回答はこちら\n${attendUrl}`);
    const message = lines.join('\n');
    let sentCount = 0;
    for (const member of membersResult.rows) { await pushMessage(member.line_user_id, { type: 'text', text: message }); sentCount++; await new Promise(r => setTimeout(r, 50)); }
    res.redirect('/admin/dashboard?msg=' + encodeURIComponent(`「${title}」を作成しました（${sentCount}名にLINE通知済み）`));
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

app.post('/admin/events/:eventId/remind', requireAdmin, async (req, res) => {
  try {
    const eventResult = await pool.query('SELECT * FROM events WHERE id=$1', [req.params.eventId]);
    if (eventResult.rows.length === 0) return res.status(404).send('イベントが見つかりません');
    const event = eventResult.rows[0];
    const respResult = await pool.query('SELECT member_name FROM responses WHERE event_id=$1', [event.id]);
    const respondedNames = respResult.rows.map(r => r.member_name);
    const membersResult = await pool.query('SELECT * FROM members WHERE line_user_id IS NOT NULL AND name != ALL($1)', [respondedNames.length > 0 ? respondedNames : ['']]);
    const attendUrl = `${APP_URL}/attend/${event.id}`;
    const message = `【リマインド】久保田会\n\n📣 ${event.title}\n\nまだ出欠が未回答です。ご回答をよろしくお願いします🙏\n\n▶️ ${attendUrl}`;
    let sentCount = 0;
    for (const member of membersResult.rows) { await pushMessage(member.line_user_id, { type: 'text', text: message }); sentCount++; await new Promise(r => setTimeout(r, 50)); }
    res.redirect('/admin/dashboard?msg=' + encodeURIComponent(`${sentCount}名の未回答者にリマインドを送信しました`));
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

app.post('/admin/events/:eventId/delete', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM events WHERE id=$1 RETURNING title', [req.params.eventId]);
    res.redirect('/admin/dashboard?msg=' + encodeURIComponent(`「${r.rows[0]?.title||''}」を削除しました`));
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

// ==================== メンバー管理 ====================
app.get('/admin/members', requireAdmin, async (req, res) => {
  try {
    const membersResult = await pool.query('SELECT * FROM members ORDER BY id');
    const members = membersResult.rows;
    const regCount = members.filter(m => m.line_user_id).length;
    let memberRows = '';
    for (const m of members) {
      const statusBadge = m.line_user_id ? `<span class="tag tag-yes" style="font-size:0.78em;">✅ LINE登録済</span>` : `<span class="tag tag-none" style="font-size:0.78em;">⬜ 未登録</span>`;
      memberRows += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #e2e8f0;gap:8px;"><span style="font-weight:bold;font-size:0.95em;">${escHtml(m.name)}</span><div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">${statusBadge}${m.line_user_id?`<form method="POST" action="/admin/members/${m.id}/unlink" style="display:inline" onsubmit="return confirm('LINE登録を解除しますか？')"><button type="submit" class="btn btn-sm" style="background:#fef3c7;color:#92400e;padding:4px 10px;">解除</button></form>`:''}<form method="POST" action="/admin/members/${m.id}/delete" style="display:inline" onsubmit="return confirm('削除しますか？')"><button type="submit" class="btn btn-danger btn-sm" style="padding:4px 10px;">削除</button></form></div></div>`;
    }
    const content = `${req.query.msg?`<div class="alert-success">${escHtml(req.query.msg)}</div>`:''}<div class="card"><div style="display:flex;gap:12px;margin-bottom:16px;"><div style="flex:1;text-align:center;padding:14px;background:#f7fafc;border-radius:8px;"><div style="font-size:1.8em;font-weight:bold;color:#2c5282;">${members.length}</div><div class="text-muted">総メンバー数</div></div><div style="flex:1;text-align:center;padding:14px;background:#f0fff4;border-radius:8px;"><div style="font-size:1.8em;font-weight:bold;color:#38a169;">${regCount}</div><div class="text-muted">LINE登録済み</div></div><div style="flex:1;text-align:center;padding:14px;background:#f7fafc;border-radius:8px;"><div style="font-size:1.8em;font-weight:bold;color:#a0aec0;">${members.length-regCount}</div><div class="text-muted">未登録</div></div></div></div><div class="card"><h2>➕ メンバーを追加</h2><form method="POST" action="/admin/members/add" style="display:flex;gap:8px;"><input type="text" name="name" placeholder="フルネームを入力" required style="margin-bottom:0;flex:1;"><button type="submit" class="btn btn-primary" style="white-space:nowrap;">追加</button></form></div><div class="card"><h2>📋 メンバー一覧</h2>${memberRows}</div>`;
    res.send(adminLayout('メンバー管理', content, 'members'));
  } catch (err) { console.error(err); res.status(500).send('エラーが発生しました'); }
});

app.post('/admin/members/add', requireAdmin, async (req, res) => {
  try {
    const name = req.body.name.trim();
    await pool.query('INSERT INTO members (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
    res.redirect('/admin/members?msg=' + encodeURIComponent(`「${name}」を追加しました`));
  } catch (err) { res.status(500).send('エラーが発生しました'); }
});

app.post('/admin/members/:id/unlink', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('UPDATE members SET line_user_id=NULL WHERE id=$1 RETURNING name', [req.params.id]);
    res.redirect('/admin/members?msg=' + encodeURIComponent(`「${r.rows[0]?.name||''}」のLINE登録を解除しました`));
  } catch (err) { res.status(500).send('エラーが発生しました'); }
});

app.post('/admin/members/:id/delete', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM members WHERE id=$1 RETURNING name', [req.params.id]);
    res.redirect('/admin/members?msg=' + encodeURIComponent(`「${r.rows[0]?.name||''}」を削除しました`));
  } catch (err) { res.status(500).send('エラーが発生しました'); }
});

// ==================== サーバー起動 ====================
const PORT = process.env.PORT || 3000;
initDB()
  .then(() => { app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); }); })
  .catch(err => { console.error('DB initialization failed:', err); process.exit(1); });
