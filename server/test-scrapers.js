const { scrapeEbay, scrapeFacebook, scrapeCex, scrapeGumtree, scrapeBackMarket, scrapeMusicMagpie, scrapeCashConverters, scrapeCexSell } = require('./scrapers');

async function testScraper(name, scraperFn, query, location) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${name}`);
    console.log(`Query: "${query}", Location: ${location}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    try {
        const result = await scraperFn(query, location);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`✓ ${name} completed in ${duration}s`);
        console.log(`  Items found: ${result.results?.length || 0}`);
        console.log(`  URL: ${result.url}`);

        if (result.error) {
            console.log(`  ⚠️  Error: ${result.error}`);
        }

        if (result.results && result.results.length > 0) {
            console.log(`  Sample item: ${result.results[0].title}`);
            console.log(`  Sample price: ${result.results[0].currency} ${result.results[0].price}`);
        }

        return { name, success: true, count: result.results?.length || 0, duration, error: result.error };
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✗ ${name} failed in ${duration}s`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Stack: ${error.stack}`);

        return { name, success: false, count: 0, duration, error: error.message };
    }
}

async function runTests() {
    const query = 'ipad';
    const location = 'UK';

    console.log('\n🔍 SCRAPER DIAGNOSTIC TEST');
    console.log(`Query: "${query}"`);
    console.log(`Location: ${location}`);
    console.log(`Started: ${new Date().toISOString()}\n`);

    const scrapers = [
        { name: 'eBay', fn: scrapeEbay },
        { name: 'Facebook', fn: scrapeFacebook },
        { name: 'CeX', fn: scrapeCex },
        { name: 'Gumtree', fn: scrapeGumtree },
        { name: 'BackMarket', fn: scrapeBackMarket },
        { name: 'MusicMagpie', fn: scrapeMusicMagpie },
        { name: 'CashConverters', fn: scrapeCashConverters },
        { name: 'CeXSell', fn: scrapeCexSell }
    ];

    const results = [];

    // Test each scraper sequentially
    for (const scraper of scrapers) {
        const result = await testScraper(scraper.name, scraper.fn, query, location);
        results.push(result);
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));

    results.forEach(r => {
        const status = r.success ? '✓' : '✗';
        const items = r.count > 0 ? `${r.count} items` : 'no items';
        const error = r.error ? ` (${r.error})` : '';
        console.log(`${status} ${r.name.padEnd(20)} ${items.padEnd(15)} ${r.duration}s${error}`);
    });

    const successCount = results.filter(r => r.success && r.count > 0).length;
    const totalCount = results.length;

    console.log(`\nWorking: ${successCount}/${totalCount}`);
    console.log(`Completed: ${new Date().toISOString()}\n`);
}

runTests().catch(console.error);
