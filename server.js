require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let currentNote = '—';
// Нові налаштування шторок: ease = плавність (false by default), duration = мс (600 by default)
let shutterConfig = { ease: false, duration: 600 };

function broadcast(payload){
  const msg = JSON.stringify(payload);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function broadcastNote(note){ broadcast({ type: 'note', note }); }
function broadcastConfig(){ broadcast({ type: 'config', config: shutterConfig }); }

app.get('/', (_,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Швидке оновлення тех-строки
app.get('/set', (req,res)=>{
  const { token, note } = req.query;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });
  const str = Array.from((note ?? '').toString()).slice(0,25).join('');
  currentNote = str || '—';
  broadcastNote(currentNote);
  res.json({ ok:true, note: currentNote });
});

// Отримати конфіг (для адмінки)
app.get('/get-config', (req,res)=>{
  const { token } = req.query;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });
  res.json({ ok:true, config: shutterConfig, note: currentNote });
});

// Встановити конфіг (ease/duration)
app.post('/set-config', (req,res)=>{
  const token = req.query.token || req.body.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });

  const ease = typeof req.body.ease !== 'undefined'
    ? !!(req.body.ease === true || req.body.ease === 'true' || req.body.ease === 1 || req.body.ease === '1')
    : shutterConfig.ease;

  let duration = parseInt(req.body.duration ?? shutterConfig.duration, 10);
  if (!Number.isFinite(duration) || duration < 60) duration = 60;     // мінімум 60 мс
  if (duration > 5000) duration = 5000;                               // максимум 5 с

  shutterConfig = { ease, duration };
  broadcastConfig();
  res.json({ ok:true, config: shutterConfig });
});

// Тригер "блимнути" (адмін-дія)
app.post('/blink', (req, res) => {
  const token = req.query.token || req.body?.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });
  broadcast({ type: 'blink' });
  res.json({ ok:true });
});

// === COUNTDOWN (адмін-дія) ===
// Виклик: POST /countdown?token=XXX  body: { start: 5, final: "GO!" }
app.post('/countdown', (req, res) => {
  const token = req.query.token || req.body?.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });

  let start = parseInt(req.body.start ?? 5, 10);
  if (!Number.isFinite(start) || start < 1) start = 5;

  const final = (req.body.final ?? 'GO!').toString().slice(0, 32);

  broadcast({ type: 'countdown', start, final });
  res.json({ ok:true, start, final });
});

// Дуже проста адмінка з контролами
app.get('/admin', (req,res)=>{
  if (req.query.token !== ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// WS: на підключенні шлемо актуальні note + config
wss.on('connection', (ws)=>{
  ws.send(JSON.stringify({ type:'note', note: currentNote }));
  ws.send(JSON.stringify({ type:'config', config: shutterConfig }));
});

server.listen(PORT, ()=> console.log('SlateClock listening on :'+PORT));

