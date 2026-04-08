const puppeteer = require('puppeteer');

// Variabel admin url yang bisa diubah runtime
let ADMIN_URL = process.env.ADMIN_URL || 'https://agent.png777.com';

// Fungsi untuk mengupdate admin url dari server
function setAdminUrl(url) {
  ADMIN_URL = url;
  console.log(`[Scraper] Admin URL updated to: ${ADMIN_URL}`);
}

// Header tambahan dari environment (opsional)
let AGENT_HEADERS = {};
if (process.env.AGENT_HEADERS) {
  try {
    AGENT_HEADERS = JSON.parse(process.env.AGENT_HEADERS);
  } catch(e) {
    console.warn('Invalid AGENT_HEADERS JSON');
  }
}

async function scrapeTransaction(userId, transactionId, expectedBetting) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders(AGENT_HEADERS);
    
    const url = `${ADMIN_URL}/transaction-record.html`;
    console.log(`[Scraper] Browsing to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Isi form
    await page.type('[name="userId"]', userId, { delay: 50 });
    await page.type('[name="transactionId"]', transactionId, { delay: 50 });
    await page.click('.success-button.langWord.jq-after-search');
    await page.waitForSelector('tbody tr', { timeout: 15000 });
    
    // Ekstrak data dari baris tabel
    const rowData = await page.evaluate((txId) => {
      const rows = document.querySelectorAll('tbody tr');
      for (let row of rows) {
        const keteranganId = row.querySelector('[data-changekey="keteranganId"]')?.innerText || '';
        if (!keteranganId.includes(txId)) continue;
        const status = row.querySelector('[data-changekey="status"]')?.innerText.toLowerCase() || '';
        if (status.includes('pertaruhan') || status.includes('betting')) {
          const debet = row.querySelector('[data-changekey="debet"]')?.innerText || '0';
          const link = row.querySelector('.jq-keterangan-link');
          const gameName = link?.dataset?.gamename || null;
          const href = link?.getAttribute('href') || null;
          return { debet, gameName, href };
        }
      }
      return null;
    }, transactionId.slice(0,19));
    
    if (!rowData) {
      throw new Error('Transaksi tidak ditemukan atau bukan status betting');
    }
    
    // Buka halaman detail
    let detailPage;
    let detailUrl = rowData.href;
    if (!detailUrl && rowData.gameName) {
      const shortId = transactionId.slice(0,19);
      detailUrl = `https://public.u2uyu876x.com/history/${rowData.gameName}.html?psid=${shortId}&sid=${shortId}&api=public-api.u2uyu876x.com%252Fweb-api%252Foperator-proxy%252Fv1%252FHistory%252FGetBetHistory&lang=en`;
    }
    if (!detailUrl) {
      throw new Error('Tidak ada link detail atau game name');
    }
    detailPage = await browser.newPage();
    await detailPage.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    
    // Ekstrak scatter
    const scatterResult = await detailPage.evaluate(() => {
      const scatterEl = document.querySelector('.sprite-symbol.payout_scatter');
      if (scatterEl) {
        const container = scatterEl.closest('.payout-item-container');
        let title = container?.querySelector('.payout-item-title')?.innerText || '';
        let countMatch = title.match(/\d+/);
        let count = countMatch ? countMatch[0] : '1';
        return { found: true, title: `Scatter: ${count}`, count };
      }
      const body = document.body.innerText;
      const match = body.match(/scatter\s*[:=]?\s*(\d+)/i);
      if (match) {
        return { found: true, title: `Scatter: ${match[1]}`, count: match[1] };
      }
      return { found: false, title: 'Scatter tidak ditemukan', count: '' };
    });
    
    const statusCek = scatterResult.found ? 'Sukses cek' : 'Cek gagal';
    const bonussmbStatus = statusCek === 'Sukses cek' ? 'Pending input' : '';
    
    return {
      userId,
      transactionId,
      debetValue: rowData.debet,
      scatterTitle: scatterResult.title,
      statusCek,
      bonussmbStatus,
      detail: ''
    };
  } catch (err) {
    console.error(`Scrape error for ${userId}/${transactionId}:`, err.message);
    return {
      userId,
      transactionId,
      debetValue: 'N/A',
      scatterTitle: `Error: ${err.message}`,
      statusCek: 'Cek gagal',
      bonussmbStatus: '',
      detail: err.message
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeTransaction, setAdminUrl };