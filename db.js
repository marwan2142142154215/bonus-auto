const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

let db;

async function initDb() {
  db = await open({
    filename: './data.db',
    driver: sqlite3.Database
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      transactionId TEXT NOT NULL,
      betting TEXT,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS results (
      userId TEXT NOT NULL,
      transactionId TEXT NOT NULL,
      debetValue TEXT,
      scatterTitle TEXT,
      statusCek TEXT,
      bonussmbStatus TEXT,
      detail TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (userId, transactionId)
    );
    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
    CREATE INDEX IF NOT EXISTS idx_results_userId ON results(userId);
    CREATE INDEX IF NOT EXISTS idx_results_updated ON results(updatedAt DESC);
  `);
  console.log('Database tables created/verified');
}

async function addToQueue(tickets) {
  const insert = await db.prepare(`INSERT INTO queue (userId, transactionId, betting) VALUES (?, ?, ?)`);
  for (const t of tickets) {
    await insert.run(t.userId, t.transactionId, t.betting || '');
  }
  await insert.finalize();
  console.log(`Added ${tickets.length} tickets to queue`);
}

async function getQueue() {
  return await db.all(`SELECT * FROM queue WHERE status = 'pending' ORDER BY id ASC`);
}

async function getQueueStatus() {
  const row = await db.get(`SELECT COUNT(*) as count FROM queue WHERE status = 'pending'`);
  return row.count;
}

async function markQueueProcessed(id) {
  await db.run(`UPDATE queue SET status = 'processed' WHERE id = ?`, id);
}

async function updateResult(userId, transactionId, data) {
  await db.run(
    `INSERT OR REPLACE INTO results (userId, transactionId, debetValue, scatterTitle, statusCek, bonussmbStatus, detail, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [userId, transactionId, data.debetValue, data.scatterTitle, data.statusCek, data.bonussmbStatus, data.detail || '']
  );
}

async function getResults() {
  return await db.all(`SELECT * FROM results ORDER BY updatedAt DESC`);
}

async function clearAll() {
  await db.run(`DELETE FROM queue`);
  await db.run(`DELETE FROM results`);
  console.log('All data cleared');
}

module.exports = { initDb, addToQueue, getQueue, getQueueStatus, markQueueProcessed, updateResult, getResults, clearAll };
