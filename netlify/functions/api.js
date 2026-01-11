const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { scrapeEbay, scrapeFacebook, scrapeCex, scrapeGumtree, scrapeBackMarket, scrapeMusicMagpie, scrapeCashConverters, scrapeCexSell } = require('./scrapers');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/compare', async (req, res) => {
    const { query, location = 'US' } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`[Netlify] Searching for: ${query} in ${location}`);
    console.log('[Netlify] Functions available:', {
        scrapeEbay: typeof scrapeEbay,
        scrapeFacebook: typeof scrapeFacebook,
        scrapeCex: typeof scrapeCex,
        scrapeGumtree: typeof scrapeGumtree,
        scrapeBackMarket: typeof scrapeBackMarket,
        scrapeMusicMagpie: typeof scrapeMusicMagpie,
        scrapeCashConverters: typeof scrapeCashConverters,
        scrapeCexSell: typeof scrapeCexSell
    });

    try {
        const startTime = Date.now();

        // Wrap each scraper to catch individual timeouts/errors
        const wrapScraper = async (name, scraperFn, ...args) => {
            const sStart = Date.now();
            try {
                console.log(`[Netlify] Starting ${name}...`);
                if (typeof scraperFn !== 'function') {
                    throw new Error(`Scraper function for ${name} is not defined (type: ${typeof scraperFn})`);
                }
                const result = await scraperFn(...args);
                console.log(`[Netlify] Finished ${name} in ${Date.now() - sStart}ms. Found ${result.results.length} items.`);
                return { name, status: 'success', count: result.results.length, data: result };
            } catch (err) {
                console.error(`[Netlify] ${name} Failed after ${Date.now() - sStart}ms:`, err);
                return {
                    name,
                    status: 'error',
                    error: err.message || String(err),
                    count: 0,
                    data: { results: [], url: '', error: err.message }
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

        const getResult = (name) => scraperResults.find(r => r.name === name)?.data || { results: [], url: '' };

        const ebayData = getResult('eBay');
        const facebookData = getResult('Facebook');
        const cexData = getResult('CeX');
        const gumtreeData = getResult('Gumtree');
        const backmarketData = getResult('BackMarket');
        const musicmagpieData = getResult('MusicMagpie');
        const cashconvertersData = getResult('CashConverters');
        const cexSellData = getResult('CeXSell');

        const combinedResults = [
            ...ebayData.results,
            ...facebookData.results,
            ...cexData.results,
            ...gumtreeData.results,
            ...backmarketData.results,
            ...musicmagpieData.results,
            ...cashconvertersData.results
        ].sort((a, b) => a.price - b.price);

        // Get CeX Cash Price Range
        let cexCashPriceLow = 0;
        let cexCashPriceHigh = 0;
        if (cexSellData.results.length > 0) {
            const prices = cexSellData.results.map(i => i.cashPrice).filter(p => !isNaN(p));
            if (prices.length > 0) {
                cexCashPriceLow = Math.min(...prices);
                cexCashPriceHigh = Math.max(...prices);
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`[Netlify] All scrapers completed in ${totalTime}ms`);

        res.json({
            query,
            timestamp: new Date().toISOString(),
            debug: {
                totalTime,
                scraperStatus: scraperResults.map(r => ({ name: r.name, status: r.status, error: r.error, count: r.count }))
            },
            ebayUrl: ebayData.url,
            facebookUrl: facebookData.url,
            cexUrl: cexData.url,
            gumtreeUrl: gumtreeData.url,
            backmarketUrl: backmarketData.url,
            musicmagpieUrl: musicmagpieData.url,
            cashconvertersUrl: cashconvertersData.url,
            cexSellUrl: cexSellData.url,
            cexSellPriceLow: cexCashPriceLow,
            cexSellPriceHigh: cexCashPriceHigh,
            results: combinedResults
        });
    } catch (error) {
        console.error('Comparison Error:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

module.exports.handler = serverless(app);
