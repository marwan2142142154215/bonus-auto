require('dotenv').config();
const express = require('express');
const session = require('express-session');
const admin = require('firebase-admin');
const path = require('path');
const { initDb, addToQueue, getQueue, updateResult, getResults, clearAll, getQueueStatus } = require('./db');
const { processQueue } = require('./queue');
const { setAdminUrl } = require('./scraper');

// Increase timeouts for Railway
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Inisialisasi Firebase Admin SDK
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('FIREBASE_SERVICE_ACCOUNT environment variable is required');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase initialized successfully');
} catch (err) {
  console.error('❌ Failed to initialize Firebase:', err.message);
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Melayani file statis dari root folder
app.use(express.static(__dirname));

// Variabel dinamis untuk ADMIN_URL
let dynamicAdminUrl = process.env.ADMIN_URL || 'https://agent.png777.com';
setAdminUrl(dynamicAdminUrl);

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    adminUrl: dynamicAdminUrl,
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

// ======================= ENDPOINT ADMIN URL =======================
app.get('/api/admin-url', authenticate, (req, res) => {
  res.json({ adminUrl: dynamicAdminUrl });
});

app.post('/api/admin-url', authenticate, (req, res) => {
  const { adminUrl } = req.body;
  if (adminUrl && typeof adminUrl === 'string' && adminUrl.trim().length > 0) {
    dynamicAdminUrl = adminUrl.trim();
    setAdminUrl(dynamicAdminUrl);
    console.log(`✅ Admin URL updated to: ${dynamicAdminUrl}`);
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
  
  // Limit queue size to prevent overload
  if (txQueue.length > 100) {
    return res.status(400).json({ error: 'Max 100 tickets per request' });
  }
  
  try {
    await addToQueue(txQueue);
    // Trigger processing but don't wait
    processQueue().catch(err => console.error('Queue processing error:', err));
    res.json({ status: 'accepted', count: txQueue.length });
  } catch (err) {
    console.error('Error adding to queue:', err);
    res.status(500).json({ error: 'Failed to add to queue' });
  }
});

// ======================= ENDPOINT HASIL =======================
app.get('/api/results', authenticate, async (req, res) => {
  try {
    const results = await getResults();
    // Limit results to prevent large responses
    const limitedResults = results.slice(0, 500);
    res.json(limitedResults);
  } catch (err) {
    console.error('Error fetching results:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================= ENDPOINT STATUS ANTRIAN =======================
app.get('/api/queue/status', authenticate, async (req, res) => {
  try {
    const pending = await getQueueStatus();
    res.json({ pending });
  } catch (err) {
    console.error('Error getting queue status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================= ENDPOINT HAPUS SEMUA DATA =======================
app.delete('/api/clear', authenticate, async (req, res) => {
  try {
    await clearAll();
    res.json({ status: 'cleared' });
  } catch (err) {
    console.error('Error clearing data:', err);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

// ======================= ENDPOINT RETRY BONUSSMB =======================
app.post('/api/retry-bonussmb', authenticate, async (req, res) => {
  const { userId, transactionId } = req.body;
  if (!userId || !transactionId) {
    return res.status(400).json({ error: 'userId dan transactionId diperlukan' });
  }
  res.json({ ok: true, message: 'Retry not fully implemented yet' });
});

// ======================= START SERVER & INIT DB =======================
async function start() {
  try {
    await initDb();
    console.log('✅ Database initialized');
    
    const PORT = process.env.PORT || 8000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
    });
    
    // Set server timeout to prevent Railway from killing long requests
    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    
    // Jalankan queue processor setiap 10 detik (less frequent)
    setInterval(() => {
      processQueue().catch(err => console.error('Queue interval error:', err));
    }, 10000);
    
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

start();
