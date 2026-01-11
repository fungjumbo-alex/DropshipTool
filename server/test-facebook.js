const { scrapeFacebook } = require('./scrapers');

async function testFacebookDetection() {
    console.log('Testing Facebook scraper with enhanced error detection...\n');

    const query = 'ipad';
    const location = 'UK';

    console.log(`Query: "${query}"`);
    console.log(`Location: ${location}`);
    console.log(`Environment: ${process.env.FUNCTION_NAME ? 'Firebase' : 'Local'}\n`);

    try {
        const result = await scrapeFacebook(query, location);

        console.log('✓ Facebook scraper completed');
        console.log(`  Items found: ${result.results?.length || 0}`);
        console.log(`  URL: ${result.url}`);

        if (result.error) {
            console.log(`  ⚠️  Error: ${result.error}`);
        }

        if (result.results && result.results.length > 0) {
            console.log('\n  Sample items:');
            result.results.slice(0, 3).forEach((item, i) => {
                console.log(`    ${i + 1}. ${item.title}`);
                console.log(`       Price: ${item.currency} ${item.price}`);
            });
        }

    } catch (error) {
        console.log('✗ Facebook scraper failed');
        console.log(`  Error: ${error.message}`);
    }
}

testFacebookDetection().catch(console.error);
