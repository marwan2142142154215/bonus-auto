require('dotenv').config();
const express = require('express');
const session = require('express-session');
const admin = require('firebase-admin');
const { initDb, addToQueue, getQueue, updateResult, getResults, clearAll, getQueueStatus } = require('./db');
const { processQueue } = require('./queue');
const { setAdminUrl } = require('./scraper'); // untuk update dinamis

// Inisialisasi Firebase Admin SDK
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('FIREBASE_SERVICE_ACCOUNT environment variable is required');
  process.exit(1);
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Railway menggunakan HTTPS, bisa set true jika perlu
}));

// Melayani file statis dari root folder (index.html, style.css, dll)
app.use(express.static(__dirname));

// Variabel dinamis untuk ADMIN_URL (bisa diubah runtime)
let dynamicAdminUrl = process.env.ADMIN_URL || 'https://agent.png777.com';
// Set awal ke scraper
setAdminUrl(dynamicAdminUrl);

// ======================= MIDDLEWARE AUTHENTIKASI =======================
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const idToken = authHeader.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ======================= ENDPOINT ADMIN URL (GET & POST) =======================
app.get('/api/admin-url', authenticate, (req, res) => {
  res.json({ adminUrl: dynamicAdminUrl });
});

app.post('/api/admin-url', authenticate, (req, res) => {
  const { adminUrl } = req.body;
  if (adminUrl && typeof adminUrl === 'string' && adminUrl.trim().length > 0) {
    dynamicAdminUrl = adminUrl.trim();
    setAdminUrl(dynamicAdminUrl); // update scraper
    console.log(`Admin URL updated to: ${dynamicAdminUrl}`);
    res.json({ status: 'updated', adminUrl: dynamicAdminUrl });
  } else {
    res.status(400).json({ error: 'Invalid adminUrl' });
  }
});

// ======================= ENDPOINT ANTRIAN =======================
app.post('/api/queue', authenticate, async (req, res) => {
  const { txQueue } = req.body;
  if (!Array.isArray(txQueue) || txQueue.length === 0) {
    return res.status(400).json({ error: 'txQueue harus array non-kosong' });
  }
  await addToQueue(txQueue);
  // Panggil processQueue secara async (tidak perlu await)
  processQueue().catch(err => console.error('Queue processing error:', err));
  res.json({ status: 'accepted', count: txQueue.length });
});

// ======================= ENDPOINT HASIL =======================
app.get('/api/results', authenticate, async (req, res) => {
  const results = await getResults();
  res.json(results);
});

// ======================= ENDPOINT STATUS ANTRIAN =======================
app.get('/api/queue/status', authenticate, async (req, res) => {
  const pending = await getQueueStatus();
  res.json({ pending });
});

// ======================= ENDPOINT HAPUS SEMUA DATA =======================
app.delete('/api/clear', authenticate, async (req, res) => {
  await clearAll();
  res.json({ status: 'cleared' });
});

// ======================= ENDPOINT RETRY BONUSSMB (placeholder) =======================
app.post('/api/retry-bonussmb', authenticate, async (req, res) => {
  const { userId, transactionId } = req.body;
  if (!userId || !transactionId) {
    return res.status(400).json({ error: 'userId dan transactionId diperlukan' });
  }
  // Di sini nanti bisa diimplementasikan logika retry input ke bonussmb
  // Untuk sementara hanya mengembalikan ok
  res.json({ ok: true, message: 'Retry not fully implemented yet' });
});

// ======================= START SERVER & INIT DB =======================
async function start() {
  await initDb();
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  // Jalankan queue processor setiap 5 detik (sebagai fallback jika tidak ada trigger)
  setInterval(() => processQueue().catch(console.error), 5000);
}
start();