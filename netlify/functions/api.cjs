const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright-core');

let chromiumLambda;
try {
    chromiumLambda = require('@sparticuz/chromium-min');
} catch (e) {
    // Falls back to local playwright if sparticuz is missing
}

async function getBrowser() {
    console.log(`[Browser] Attempting launch. Environment: ${process.env.NETLIFY ? 'Netlify' : 'Local'}`);

    if (process.env.NETLIFY || process.env.AWS_EXECUTION_ENV || process.env.FUNCTION_NAME || process.env.K_SERVICE) {
        if (!chromiumLambda) {
            console.error('[Browser] chromiumLambda is not defined! Check if @sparticuz/chromium-min is installed.');
            throw new Error('chromiumLambda is not defined');
        }

        console.log('[Browser] Launching with Sparticuz Chromium...');
        return await chromium.launch({
            args: [...(chromiumLambda.args || []), '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            executablePath: await chromiumLambda.executablePath(),
            headless: chromiumLambda.headless,
        });
    }

    console.log('[Browser] Launching local chromium...');
    return await chromium.launch({ headless: true });
}

// --- Scraper Functions ---

async function scrapeEbay(query, location = 'US') {
    let browser;
    try {
        const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
        const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
        const url = `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12`;
        browser = await getBrowser();
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: location.toUpperCase() === 'UK' ? 'en-GB' : 'en-US'
        });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForSelector('.s-item__wrapper', { timeout: 8000 }); } catch (e) { }

        const items = await page.evaluate((currencyCode) => {
            let results = [];
            let cards = Array.from(document.querySelectorAll('li.s-item, .s-item'));
            cards.forEach((card) => {
                let titleEl = card.querySelector('.s-item__title');
                let priceEl = card.querySelector('.s-item__price');
                let linkEl = card.querySelector('.s-item__link');
                let imgEl = card.querySelector('.s-item__image-img');
                let title = titleEl ? titleEl.innerText : '';
                let priceText = priceEl ? priceEl.innerText : '';
                let price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                let link = linkEl ? linkEl.href : '';
                if (link && title && price > 0) {
                    results.push({
                        source: 'eBay',
                        title: title.trim(),
                        price: price,
                        currency: currencyCode,
                        link: link,
                        image: imgEl ? imgEl.src : null
                    });
                }
            });
            return results;
        }, currencyCode);
        return { results: items.slice(0, 10), url };
    } catch (error) {
        if (process.env.NETLIFY) throw error;
        return { results: [], url: '' };
    } finally { if (browser) await browser.close(); }
}

async function scrapeFacebook(query, location = 'US') {
    let browser;
    try {
        const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
        browser = await getBrowser();
        const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' });
        const page = await context.newPage();
        const city = location.toUpperCase() === 'UK' ? 'london' : 'nyc';
        const url = `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        try { await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 5000 }); } catch (e) { }
        const items = await page.evaluate((currencyCode) => {
            const links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
            return links.slice(0, 10).map(link => {
                const lines = link.innerText.split('\n');
                const priceMatch = lines.find(l => l.includes('£') || l.includes('$')) || '0';
                const price = parseFloat(priceMatch.replace(/[^0-9.]/g, ''));
                return {
                    source: 'Facebook',
                    title: lines.find(l => l.length > 10) || 'Facebook Item',
                    price: price,
                    currency: currencyCode,
                    link: 'https://www.facebook.com' + link.getAttribute('href'),
                    image: link.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        }, currencyCode);
        return { results: items, url };
    } catch (error) {
        if (process.env.NETLIFY) throw error;
        return { results: [], url: '' };
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
        await page.waitForSelector('.cx-card-product', { timeout: 5000 }).catch(() => { });
        const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.cx-card-product')).map(card => {
                const titleEl = card.querySelector('.line-clamp');
                const priceEl = card.querySelector('.product-main-price');
                const price = parseFloat(priceEl?.innerText.replace(/[^0-9.]/g, '') || '0');
                return {
                    source: 'CeX',
                    title: titleEl?.innerText.trim(),
                    price,
                    currency: 'GBP',
                    link: card.querySelector('a')?.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        if (process.env.NETLIFY) throw error;
        return { results: [], url };
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
                const titleEl = card.querySelector('h3') || card.querySelector('div[class*="title"]');
                const priceEl = card.innerText.match(/£\d+/);
                const price = priceEl ? parseFloat(priceEl[0].replace('£', '')) : 0;
                return {
                    source: 'Gumtree',
                    title: titleEl?.innerText.trim(),
                    price,
                    currency: 'GBP',
                    link: card.querySelector('a')?.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0 && i.title);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        if (process.env.NETLIFY) throw error;
        return { results: [], url };
    } finally { if (browser) await browser.close(); }
}

async function scrapeBackMarket(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') return { results: [], url: '' };
    let browser;
    const url = `https://www.backmarket.co.uk/en-gb/search?q=${encodeURIComponent(query)}`;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
        if (process.env.NETLIFY) throw error;
        return { results: [], url };
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
                const lines = card.innerText.split('\n');
                const priceMatch = card.innerText.match(/£[\d,]+/);
                return {
                    source: 'MusicMagpie',
                    title: lines[0],
                    price: priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, '')) : 0,
                    currency: 'GBP',
                    link: card.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        if (process.env.NETLIFY) throw error;
        return { results: [], url };
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
                    title: card.querySelector('img')?.alt || 'Item',
                    price: priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, '')) : 0,
                    currency: 'GBP',
                    link: card.href,
                    image: card.querySelector('img')?.src
                };
            }).filter(i => i.price > 0);
        });
        return { results: items.slice(0, 10), url };
    } catch (error) {
        if (process.env.NETLIFY) throw error;
        return { results: [], url };
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
        if (process.env.NETLIFY) throw error;
        return { results: [], url };
    } finally { if (browser) await browser.close(); }
}

// --- Express App ---

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/compare', async (req, res) => {
    const { query, location = 'US' } = req.query;
    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    try {
        const startTime = Date.now();
        const wrapScraper = async (name, scraperFn, ...args) => {
            const sStart = Date.now();
            try {
                const result = await scraperFn(...args);
                return { name, status: 'success', count: result.results.length, data: result };
            } catch (err) {
                return { name, status: 'error', error: err.message, count: 0, data: { results: [], url: '' } };
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

        const getResult = (name) => scraperResults.find(r => r.name === name)?.data || { results: [], url: '' };
        const combinedResults = scraperResults.flatMap(r => r.data.results || []).sort((a, b) => a.price - b.price);

        const cexSellData = getResult('CeXSell');
        let cexCashPriceLow = 0, cexCashPriceHigh = 0;
        if (cexSellData.results.length > 0) {
            const prices = cexSellData.results.map(i => i.cashPrice).filter(p => !isNaN(p));
            cexCashPriceLow = Math.min(...prices);
            cexCashPriceHigh = Math.max(...prices);
        }

        res.json({
            query,
            debug: {
                totalTime: Date.now() - startTime,
                scraperStatus: scraperResults.map(r => ({ name: r.name, status: r.status, error: r.error, count: r.count }))
            },
            results: combinedResults,
            cexSellPriceLow: cexCashPriceLow,
            cexSellPriceHigh: cexCashPriceHigh
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Error' });
    }
});

module.exports.handler = serverless(app);
