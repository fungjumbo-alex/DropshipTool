const express = require('express');
const cors = require('cors');
const {
    scrapeEbay,
    scrapeFacebook,
    scrapeCex,
    scrapeGumtree,
    scrapeBackMarket,
    scrapeMusicMagpie,
    scrapeCashConverters,
    scrapeCexSell,
    scrapePopularProducts
} = require('./scrapers');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/popular', async (req, res) => {
    const { query = 'apple', location = 'UK', count = 50 } = req.query;
    console.log(`[API] Fetching popular products for: "${query}" in ${location}`);

    try {
        const products = await scrapePopularProducts(query, location, parseInt(count));
        res.json({ products });
    } catch (error) {
        console.error('[API] Popular Products Error:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/compare', async (req, res) => {
    const { query, location = 'US', source } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`[API] Searching: "${query}" in ${location} (Source: ${source || 'ALL'})`);

    // Check if we are running in a serverless environment (Linux) or locally (Mac/Win)
    const isServerless = process.env.FUNCTION_NAME || process.env.K_SERVICE || process.platform === 'linux';

    // Option to skip Facebook on Firebase (set SKIP_FACEBOOK_ON_FIREBASE=true in environment)
    const skipFacebookOnFirebase = process.env.SKIP_FACEBOOK_ON_FIREBASE === 'true';

    try {
        const allScrapers = [
            { id: 'ebay', name: 'eBay', fn: () => scrapeEbay(query, location) },
            { id: 'cex', name: 'CeX', fn: () => scrapeCex(query, location) },
            { id: 'gumtree', name: 'Gumtree', fn: () => scrapeGumtree(query, location) },
            {
                id: 'facebook',
                name: 'Facebook',
                fn: () => {
                    // Skip Facebook on Firebase if configured
                    if (isServerless && skipFacebookOnFirebase) {
                        console.log('[Facebook] Skipped on Firebase (SKIP_FACEBOOK_ON_FIREBASE=true)');
                        return Promise.resolve({
                            results: [],
                            url: `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(query)}`,
                            error: 'Facebook disabled on Firebase (datacenter IP blocking)'
                        });
                    }
                    return scrapeFacebook(query, location);
                }
            },
            { id: 'backmarket', name: 'BackMarket', fn: () => scrapeBackMarket(query, location) },
            { id: 'musicmagpie', name: 'MusicMagpie', fn: () => scrapeMusicMagpie(query, location) },
            { id: 'cashconverters', name: 'CashConverters', fn: () => scrapeCashConverters(query, location) },
            { id: 'cexsell', name: 'CeXSell', fn: () => (location === 'UK' ? scrapeCexSell(query) : Promise.resolve({ results: [], url: '' })) }
        ];

        // Filter by source if requested
        const targetScrapers = source
            ? allScrapers.filter(s => s.id.toLowerCase() === source.toLowerCase())
            : allScrapers;

        if (targetScrapers.length === 0) {
            return res.status(400).json({ error: `Invalid source: ${source}` });
        }

        const executeBatch = async (batch) => {
            if (isServerless) {
                // SEQUENTIAL for production to avoid IP blocking
                const resBatch = [];
                for (const scraper of batch) {
                    const res = await scraper.fn().catch(e => ({ results: [], error: e.message }));
                    resBatch.push({ ...res, scraperName: scraper.name, scraperId: scraper.id });
                }
                return resBatch;
            } else {
                return await Promise.all(batch.map(s =>
                    s.fn().catch(e => ({ results: [], error: e.message }))
                )).then(results => results.map((r, i) => ({ ...r, scraperName: batch[i].name, scraperId: batch[i].id })));
            }
        };

        const batchResults = await executeBatch(targetScrapers);

        // Construct standard response
        const responseData = {
            query,
            timestamp: new Date().toISOString(),
            results: batchResults.flatMap(r => r.results || []),
            debug: {
                counts: {},
                errors: {},
                scraperStatus: batchResults.map(r => ({
                    name: r.scraperName,
                    id: r.scraperId,
                    count: r.results?.length || 0,
                    status: r.error ? 'error' : 'success',
                    error: r.error
                }))
            }
        };

        batchResults.forEach(r => {
            responseData[`${r.scraperId}Url`] = r.url;
            responseData.debug.counts[r.scraperId] = r.results?.length || 0;
            if (r.error) responseData.debug.errors[r.scraperId] = r.error;

            if (r.scraperId === 'cexsell' && r.results?.length > 0) {
                const prices = r.results.map(i => i.cashPrice).filter(p => !isNaN(p));
                if (prices.length > 0) {
                    responseData.cexSellPriceLow = Math.min(...prices);
                    responseData.cexSellPriceHigh = Math.max(...prices);
                }
            }
        });

        res.json(responseData);

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
    minInstances: 0,
    concurrency: 1 // CRITICAL: Only 1 request per container to prevent resource contention (spawn EFAULT)
}, app);
