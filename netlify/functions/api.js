const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { scrapeEbay, scrapeFacebook, scrapeCex, scrapeGumtree, scrapeBackMarket, scrapeMusicMagpie, scrapeCashConverters, scrapeCexSell } = require('../../server/scrapers');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/compare', async (req, res) => {
    const { query, location = 'US' } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`[Netlify] Searching for: ${query} in ${location}`);

    try {
        // Run all scrapers in parallel
        // NOTE: Netlify functions have a timeout (usually 10s-26s). 
        // 8 scrapers in parallel might exceed this if they are slow.
        const [ebayData, facebookData, cexData, gumtreeData, backmarketData, musicmagpieData, cashconvertersData, cexSellData] = await Promise.all([
            scrapeEbay(query, location),
            scrapeFacebook(query, location),
            scrapeCex(query, location),
            scrapeGumtree(query, location),
            scrapeBackMarket(query, location),
            scrapeMusicMagpie(query, location),
            scrapeCashConverters(query, location),
            location === 'UK' ? scrapeCexSell(query) : Promise.resolve({ results: [], url: '' })
        ]);

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
            results: combinedResults
        });
    } catch (error) {
        console.error('Comparison Error:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

module.exports.handler = serverless(app);
