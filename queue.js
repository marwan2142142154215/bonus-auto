const { getQueue, markQueueProcessed, updateResult } = require('./db');
const { scrapeTransaction } = require('./scraper');

let activeCount = 0;
const MAX_CONCURRENT = 1; // Process one at a time to prevent memory issues
let isProcessing = false;

async function processQueue() {
  // Prevent concurrent processing
  if (isProcessing) {
    return;
  }
  
  isProcessing = true;
  
  try {
    const pending = await getQueue();
    
    if (pending.length === 0) {
      return;
    }
    
    console.log(`📋 Queue has ${pending.length} pending items, active: ${activeCount}`);
    
    const availableSlots = MAX_CONCURRENT - activeCount;
    if (availableSlots <= 0) return;
    
    const toProcess = pending.slice(0, availableSlots);
    activeCount += toProcess.length;
    
    // Process sequentially to avoid memory issues
    for (const item of toProcess) {
      try {
        console.log(`🔄 Processing queue item ${item.id} for user ${item.userId}`);
        const result = await scrapeTransaction(item.userId, item.transactionId, item.betting);
        await updateResult(item.userId, item.transactionId, result);
        await markQueueProcessed(item.id);
        
        // Small delay between items
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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
    }
    
    // Process more if available
    if (pending.length > toProcess.length) {
      setTimeout(() => processQueue().catch(console.error), 2000);
    }
    
  } catch (err) {
    console.error('Queue processing error:', err);
  } finally {
    isProcessing = false;
  }
}

module.exports = { processQueue };
