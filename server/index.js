const express = require('express');
const cors = require('cors');
const { scrapeEbay, scrapeFacebook, scrapeCex, scrapeGumtree, scrapeBackMarket, scrapeMusicMagpie, scrapeCashConverters, scrapeCexSell } = require('./scrapers');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/compare', async (req, res) => {
    const { query, location = 'US' } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`[API] Searching: "${query}" in ${location}`);
    const resultsMap = {};

    try {
        // We run in batches to avoid OOM (Out Of Memory)
        // Each browser instance uses ~300-500MB. 4 instances = 2GB.
        // With 4GiB total memory, 4 at once is safe.

        const scrapers = [
            { id: 'ebay', name: 'eBay', fn: () => scrapeEbay(query, location) },
            { id: 'cex', name: 'CeX', fn: () => scrapeCex(query, location) },
            { id: 'gumtree', name: 'Gumtree', fn: () => scrapeGumtree(query, location) },
            { id: 'facebook', name: 'Facebook', fn: () => scrapeFacebook(query, location) },
            { id: 'backmarket', name: 'BackMarket', fn: () => scrapeBackMarket(query, location) },
            { id: 'musicmagpie', name: 'MusicMagpie', fn: () => scrapeMusicMagpie(query, location) },
            { id: 'cashconverters', name: 'CashConverters', fn: () => scrapeCashConverters(query, location) },
            { id: 'cexsell', name: 'CeXSell', fn: () => (location === 'UK' ? scrapeCexSell(query) : Promise.resolve({ results: [], url: '' })) }
        ];

        const executeBatch = async (batch) => {
            return await Promise.all(batch.map(s =>
                s.fn().catch(e => {
                    console.error(`[API] ${s.name} failed:`, e.message);
                    return { results: [], url: '', error: e.message };
                })
            ));
        };

        console.log(`[API] Starting Batch 1 (eBay, Facebook, CeX, Gumtree)...`);
        const batch1 = await executeBatch(scrapers.slice(0, 4));

        // Wait slightly between batches to prevent CPU/Memory spikes
        await new Promise(r => setTimeout(r, 2000));

        console.log(`[API] Starting Batch 2 (Others)...`);
        const batch2 = await executeBatch(scrapers.slice(4));

        const [ebayData, cexData, gumtreeData, facebookData] = batch1;
        const [backmarketData, musicmagpieData, cashconvertersData, cexSellData] = batch2;

        const combinedResults = [
            ...(ebayData.results || []),
            ...(cexData.results || []),
            ...(gumtreeData.results || []),
            ...(facebookData.results || []),
            ...(backmarketData.results || []),
            ...(musicmagpieData.results || []),
            ...(cashconvertersData.results || [])
        ].sort((a, b) => a.price - b.price);

        // Get CeX Cash Price Range
        let cexCashPriceLow = 0;
        let cexCashPriceHigh = 0;
        if (cexSellData.results && cexSellData.results.length > 0) {
            const prices = cexSellData.results.map(i => i.cashPrice).filter(p => !isNaN(p));
            if (prices.length > 0) {
                cexCashPriceLow = Math.min(...prices);
                cexCashPriceHigh = Math.max(...prices);
            }
        }

        res.json({
            query,
            timestamp: new Date().toISOString(),
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
            results: combinedResults,
            debug: {
                counts: {
                    ebay: ebayData.results?.length || 0,
                    facebook: facebookData.results?.length || 0,
                    cex: cexData.results?.length || 0,
                    gumtree: gumtreeData.results?.length || 0,
                    backmarket: backmarketData.results?.length || 0,
                    musicmagpie: musicmagpieData.results?.length || 0,
                    cashconverters: cashconvertersData.results?.length || 0,
                    cexSell: cexSellData.results?.length || 0
                },
                errors: {
                    ebay: ebayData.error,
                    facebook: facebookData.error,
                    cex: cexData.error,
                    gumtree: gumtreeData.error,
                    backmarket: backmarketData.error,
                    musicmagpie: musicmagpieData.error,
                    cashconverters: cashconvertersData.error,
                    cexSell: cexSellData.error
                }
            }
        });
    } catch (error) {
        console.error('[API] Comparison Error:', error);
        res.status(500).json({ error: 'Failed to fetch results', message: error.message });
    }
});

const functions = require('firebase-functions/v2/https');

// Only start the server locally if not in a Firebase environment
if (!process.env.FUNCTION_NAME && !process.env.K_SERVICE) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

exports.api = functions.onRequest({
    memory: "4GiB",
    timeoutSeconds: 300,
    region: 'us-central1',
    cpu: 2, // 2 CPUs for better browser performance
    minInstances: 0
}, app);
