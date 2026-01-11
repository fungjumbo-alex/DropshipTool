const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright-core');

// Attempt to load chromium-min for serverless environment
let chromiumLambda;
let browserInitError = null;
try {
    chromiumLambda = require('@sparticuz/chromium-min');
    console.log('[Netlify] @sparticuz/chromium-min loaded successfully');
} catch (e) {
    browserInitError = `@sparticuz/chromium-min load error: ${e.message}`;
    console.log('[Netlify] @sparticuz/chromium-min not found:', e.message);
}

// Helper to launch browser
async function getBrowser() {
    // If the lambda package is available, we assume we are in a serverless environment or want to use it
    if (chromiumLambda) {
        console.log('[Browser] Launching with Sparticuz Chromium...');
        try {
            const executablePath = await chromiumLambda.executablePath();
            console.log(`[Browser] Using executable at: ${executablePath}`);

            return await chromium.launch({
                args: [...(chromiumLambda.args || []), '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
                executablePath: executablePath,
                headless: chromiumLambda.headless,
            });
        } catch (err) {
            console.error('[Browser] Cloud Launch Failed:', err.message);
            throw new Error(`Cloud Browser Launch Failed: ${err.message}`);
        }
    }

    console.log('[Browser] Launching local chromium fallback...');
    try {
        return await chromium.launch({ headless: true });
    } catch (err) {
        console.error('[Browser] Local Launch Failed:', err.message);
        throw new Error(`Local Browser Launch Failed: ${err.message}. Make sure playwright browsers are installed.`);
    }
}

// --- Scraper Implementations ---

async function scrapeEbay(query, location = 'US') {
    let browser;
    const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
    const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
    const url = `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12`;

    try {
        browser = await getBrowser();
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: location.toUpperCase() === 'UK' ? 'en-GB' : 'en-US'
        });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForSelector('.s-item__wrapper', { timeout: 8000 }); } catch (e) { }

        const items = await page.evaluate((currency) => {
            const results = [];
            const cards = Array.from(document.querySelectorAll('li.s-item, .s-item'));
            cards.forEach(card => {
                const titleEl = card.querySelector('.s-item__title');
                const priceEl = card.querySelector('.s-item__price');
                const linkEl = card.querySelector('.s-item__link');
                const imgEl = card.querySelector('.s-item__image-img');
                const priceMatch = (priceEl?.innerText || '0').match(/[\d.]+/);
                const price = priceMatch ? parseFloat(priceMatch[0]) : 0;
                if (titleEl && price > 0) {
                    results.push({
                        source: 'eBay',
                        title: titleEl.innerText.trim(),
                        price,
                        currency,
                        link: linkEl?.href,
                        image: imgEl?.src
                    });
                }
            });
            return results;
        }, currencyCode);
        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('[eBay] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

async function scrapeFacebook(query, location = 'US') {
    let browser;
    const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
    const city = location.toUpperCase() === 'UK' ? 'london' : 'nyc';
    const url = `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}`;

    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        try { await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 8000 }); } catch (e) { }

        const items = await page.evaluate((currency) => {
            const links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
            return links.slice(0, 10).map(link => {
                const text = link.innerText;
                const lines = text.split('\n');
                const priceMatch = lines.find(l => l.includes('£') || l.includes('$'));
                const priceValueMatch = (priceMatch || '0').match(/[\d.]+/);
                const price = priceValueMatch ? parseFloat(priceValueMatch[0]) : 0;
                return {
                    source: 'Facebook',
                    title: lines.find(l => l.length > 10) || 'Generic Listing',
                    price,
                    currency,
                    link: 'https://www.facebook.com' + link.getAttribute('href'),
                    image: link.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        }, currencyCode);
        return { results: items, url };
    } catch (error) {
        console.error('[Facebook] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

async function scrapeCex(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') return { results: [], url: '' };
    let browser;
    const url = `https://uk.webuy.com/search?stext=${encodeURIComponent(query)}`;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        try { await page.waitForSelector('.cx-card-product', { timeout: 8000 }); } catch (e) { }
        const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.cx-card-product')).map(card => {
                const title = card.querySelector('.line-clamp')?.innerText;
                const priceEl = card.querySelector('.product-main-price');
                const priceValueMatch = (priceEl?.innerText || '0').match(/[\d.]+/);
                const price = priceValueMatch ? parseFloat(priceValueMatch[0]) : 0;
                return {
                    source: 'CeX',
                    title,
                    price,
                    currency: 'GBP',
                    link: card.querySelector('a')?.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('[CeX] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

async function scrapeGumtree(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') return { results: [], url: '' };
    let browser;
    const url = `https://www.gumtree.com/search?search_category=all&q=${encodeURIComponent(query)}`;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('article')).map(card => {
                const title = card.querySelector('h3')?.innerText || card.querySelector('div[class*="title"]')?.innerText;
                const priceMatch = card.innerText.match(/£[\d,]+/);
                const price = priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, '')) : 0;
                return {
                    source: 'Gumtree',
                    title,
                    price,
                    currency: 'GBP',
                    link: card.querySelector('a')?.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0 && i.title);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('[Gumtree] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

async function scrapeBackMarket(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') return { results: [], url: '' };
    let browser;
    const url = `https://www.backmarket.co.uk/en-gb/search?q=${encodeURIComponent(query)}`;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[data-test="product-item"]')).map(card => {
                const title = card.querySelector('h2')?.innerText;
                const priceMatch = card.innerText.match(/£[\d,]+/);
                const price = priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, '')) : 0;
                return {
                    source: 'BackMarket',
                    title,
                    price,
                    currency: 'GBP',
                    link: card.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('[BackMarket] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

async function scrapeMusicMagpie(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') return { results: [], url: '' };
    let browser;
    const url = `https://store.musicmagpie.co.uk/store/search?q=${encodeURIComponent(query)}`;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).filter(a => a.innerText.includes('£')).map(card => {
                const text = card.innerText;
                const priceMatch = text.match(/£[\d,]+/);
                return {
                    source: 'MusicMagpie',
                    title: text.split('\n')[0],
                    price: priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, '')) : 0,
                    currency: 'GBP',
                    link: card.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('[MusicMagpie] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

async function scrapeCashConverters(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') return { results: [], url: '' };
    let browser;
    const url = `https://www.cashconverters.co.uk/shop?search=${encodeURIComponent(query)}`;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).filter(a => a.innerText.includes('£')).map(card => {
                const priceMatch = card.innerText.match(/£[\d,]+/);
                return {
                    source: 'CashConverters',
                    title: card.querySelector('img')?.alt || 'Used Item',
                    price: priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, '')) : 0,
                    currency: 'GBP',
                    link: card.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('[CashConverters] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

async function scrapeCexSell(query) {
    let browser;
    const url = `https://uk.webuy.com/sell/search?stext=${encodeURIComponent(query)}`;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.cx-card-product')).map(card => {
                const cashMatch = card.innerText.match(/Cash[:\s]+£([\d,]+)/i);
                return {
                    title: card.querySelector('.line-clamp')?.innerText,
                    cashPrice: cashMatch ? parseFloat(cashMatch[1].replace(/,/g, '')) : 0,
                    currency: 'GBP'
                };
            }).filter(i => i.cashPrice > 0);
        });
        return { results: items, url };
    } catch (error) {
        console.error('[CeXSell] Error:', error.message);
        throw error;
    } finally { if (browser) await browser.close(); }
}

// --- Express App ---

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/compare', async (req, res) => {
    const { query, location = 'US' } = req.query;
    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    console.log(`[Netlify] Comparison requested: "${query}" in ${location}`);

    try {
        const startTime = Date.now();
        const wrapScraper = async (name, scraperFn, ...args) => {
            const sStart = Date.now();
            try {
                if (typeof scraperFn !== 'function') throw new Error('Scraper function is not defined');
                const result = await scraperFn(...args);
                return { name, status: 'success', shadowError: null, count: (result.results || []).length, data: result };
            } catch (err) {
                console.error(`[Netlify] ${name} error:`, err.message);
                const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
                let fallbackUrl = '';
                if (name === 'eBay') fallbackUrl = `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}`;
                else if (name === 'Facebook') fallbackUrl = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(query)}`;
                else if (name === 'CeX') fallbackUrl = `https://uk.webuy.com/search?stext=${encodeURIComponent(query)}`;
                else if (name === 'Gumtree') fallbackUrl = `https://www.gumtree.com/search?q=${encodeURIComponent(query)}`;

                return {
                    name,
                    status: 'error',
                    error: err.message,
                    count: 0,
                    data: { results: [], url: fallbackUrl }
                };
            }
        };

        const scraperResults = await Promise.all([
            wrapScraper('eBay', scrapeEbay, query, location),
            wrapScraper('Facebook', scrapeFacebook, query, location),
            wrapScraper('CeX', scrapeCex, query, location),
            wrapScraper('Gumtree', scrapeGumtree, query, location),
            wrapScraper('BackMarket', scrapeBackMarket, query, location),
            wrapScraper('MusicMagpie', scrapeMusicMagpie, query, location),
            wrapScraper('CashConverters', scrapeCashConverters, query, location),
            location === 'UK' ? wrapScraper('CeXSell', scrapeCexSell, query) : Promise.resolve({ name: 'CeXSell', status: 'skipped', data: { results: [], url: '' } })
        ]);

        const combinedResults = scraperResults.flatMap(r => r.data.results || []).sort((a, b) => a.price - b.price);
        const getResult = (name) => scraperResults.find(r => r.name === name)?.data || { results: [], url: '' };

        const cexSellData = getResult('CeXSell');
        let cexCashPriceLow = 0, cexCashPriceHigh = 0;
        if (cexSellData.results && cexSellData.results.length > 0) {
            const prices = cexSellData.results.map(i => i.cashPrice).filter(p => !isNaN(p));
            if (prices.length > 0) {
                cexCashPriceLow = Math.min(...prices);
                cexCashPriceHigh = Math.max(...prices);
            }
        }

        res.json({
            query,
            debug: {
                totalTime: Date.now() - startTime,
                scraperStatus: scraperResults.map(r => ({ name: r.name, status: r.status, error: r.error, count: r.count })),
                lambdaLoaded: !!chromiumLambda,
                browserInitError
            },
            results: combinedResults,
            ebayUrl: getResult('eBay').url,
            facebookUrl: getResult('Facebook').url,
            cexUrl: getResult('CeX').url,
            gumtreeUrl: getResult('Gumtree').url,
            backmarketUrl: getResult('BackMarket').url,
            musicmagpieUrl: getResult('MusicMagpie').url,
            cashconvertersUrl: getResult('CashConverters').url,
            cexSellUrl: getResult('CeXSell').url,
            cexSellPriceLow: cexCashPriceLow,
            cexSellPriceHigh: cexCashPriceHigh
        });
    } catch (error) {
        console.error('[Netlify] Fatal error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports.handler = serverless(app);
