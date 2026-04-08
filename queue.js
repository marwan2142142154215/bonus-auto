const { getQueue, markQueueProcessed, updateResult } = require('./db');
const { scrapeTransaction } = require('./scraper');

let activeCount = 0;
const MAX_CONCURRENT = 3;

async function processQueue() {
  const pending = await getQueue();
  if (pending.length === 0) return;
  const availableSlots = MAX_CONCURRENT - activeCount;
  if (availableSlots <= 0) return;
  const toProcess = pending.slice(0, availableSlots);
  activeCount += toProcess.length;
  const promises = toProcess.map(async (item) => {
    try {
      const result = await scrapeTransaction(item.userId, item.transactionId, item.betting);
      await updateResult(item.userId, item.transactionId, result);
      await markQueueProcessed(item.id);
    } catch (err) {
      console.error('Queue item error:', err);
      await updateResult(item.userId, item.transactionId, {
        debetValue: 'N/A',
        scatterTitle: `Error: ${err.message}`,
        statusCek: 'Cek gagal',
        bonussmbStatus: '',
        detail: err.message
      });
      await markQueueProcessed(item.id);
    } finally {
      activeCount--;
    }
  });
  await Promise.all(promises);
  if (pending.length > toProcess.length) {
    setTimeout(() => processQueue().catch(console.error), 1000);
  }
}

module.exports = { processQueue };