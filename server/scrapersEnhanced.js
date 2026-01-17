/**
 * Example: Enhanced scrapers using Browser-Use Agent
 * 
 * This demonstrates how to integrate browser-use with existing scrapers
 * for improved reliability and bot detection bypass.
 */

const { scrapeWithFallback, searchWithBrowserUse, isBrowserUseAvailable } = require('./browserUseIntegration');
const {
    scrapeEbay,
    scrapeFacebook,
    scrapeGumtree,
    scrapeBackMarket,
    scrapeCashConverters
} = require('./scrapers');

/**
 * Enhanced eBay scraper with AI fallback
 */
async function scrapeEbayEnhanced(query, location = 'US') {
    return await scrapeWithFallback(query, 'ebay', location, scrapeEbay);
}

/**
 * Enhanced Facebook scraper with AI fallback
 * This is especially useful since Facebook often blocks datacenter IPs
 */
async function scrapeFacebookEnhanced(query, location = 'US') {
    return await scrapeWithFallback(query, 'facebook', location, scrapeFacebook);
}

/**
 * Enhanced Gumtree scraper with AI fallback
 */
async function scrapeGumtreeEnhanced(query, location = 'US') {
    return await scrapeWithFallback(query, 'gumtree', location, scrapeGumtree);
}

/**
 * Enhanced BackMarket scraper with AI fallback
 * Helps bypass Cloudflare challenges
 */
async function scrapeBackMarketEnhanced(query, location = 'US') {
    return await scrapeWithFallback(query, 'backmarket', location, scrapeBackMarket);
}

/**
 * Enhanced Cash Converters scraper with AI fallback
 */
async function scrapeCashConvertersEnhanced(query, location = 'US') {
    return await scrapeWithFallback(query, 'cashconverters', location, scrapeCashConverters);
}

/**
 * Use browser-use for ALL scrapers
 * This is useful when you want maximum reliability and don't mind the cost
 */
async function scrapeAllWithBrowserUse(query, location = 'UK') {
    const marketplaces = ['ebay', 'facebook', 'gumtree', 'backmarket', 'cex', 'cashconverters'];

    console.log(`[Browser-Use] Searching all marketplaces for "${query}"...`);

    const results = await Promise.allSettled(
        marketplaces.map(marketplace =>
            searchWithBrowserUse(query, marketplace, location)
        )
    );

    // Combine all successful results
    const allResults = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.results) {
            allResults.push(...result.value.results);
        } else {
            console.log(`[Browser-Use] ${marketplaces[index]} failed:`, result.reason?.message);
        }
    });

    return {
        results: allResults,
        totalMarketplaces: marketplaces.length,
        successfulMarketplaces: results.filter(r => r.status === 'fulfilled').length
    };
}

/**
 * Smart scraper that chooses strategy based on marketplace
 * Uses browser-use for problematic sites, traditional scrapers for reliable ones
 */
async function scrapeSmartStrategy(query, location = 'UK') {
    // Check if browser-use is available
    const browserUseAvailable = await isBrowserUseAvailable();

    // Marketplaces that work well with traditional scraping
    const reliableMarketplaces = ['ebay', 'cex'];

    // Marketplaces that often get blocked (use browser-use if available)
    const problematicMarketplaces = ['facebook', 'backmarket', 'gumtree'];

    const results = [];

    // Use traditional scrapers for reliable marketplaces
    console.log('[Smart] Using traditional scrapers for reliable marketplaces...');
    const reliableResults = await Promise.allSettled([
        scrapeEbay(query, location),
        // Add other reliable scrapers here
    ]);

    reliableResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.results) {
            results.push(...result.value.results);
        }
    });

    // Use browser-use for problematic marketplaces if available
    if (browserUseAvailable) {
        console.log('[Smart] Using browser-use for problematic marketplaces...');
        const browserUseResults = await Promise.allSettled(
            problematicMarketplaces.map(marketplace =>
                searchWithBrowserUse(query, marketplace, location)
            )
        );

        browserUseResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value.results) {
                results.push(...result.value.results);
            }
        });
    } else {
        console.log('[Smart] Browser-use not available, skipping problematic marketplaces');
    }

    return {
        results,
        strategy: 'smart',
        browserUseUsed: browserUseAvailable
    };
}

// Example usage
async function example() {
    const query = 'ipad pro';
    const location = 'UK';

    console.log('\n=== Example 1: Enhanced eBay (with fallback) ===');
    const ebayResults = await scrapeEbayEnhanced(query, location);
    console.log(`Found ${ebayResults.results.length} results`);

    console.log('\n=== Example 2: Enhanced Facebook (with fallback) ===');
    const facebookResults = await scrapeFacebookEnhanced(query, location);
    console.log(`Found ${facebookResults.results.length} results`);

    console.log('\n=== Example 3: All marketplaces with Browser-Use ===');
    const allResults = await scrapeAllWithBrowserUse(query, location);
    console.log(`Found ${allResults.results.length} total results from ${allResults.successfulMarketplaces}/${allResults.totalMarketplaces} marketplaces`);

    console.log('\n=== Example 4: Smart Strategy ===');
    const smartResults = await scrapeSmartStrategy(query, location);
    console.log(`Found ${smartResults.results.length} results using smart strategy`);
}

// Uncomment to run examples
// example().catch(console.error);

module.exports = {
    scrapeEbayEnhanced,
    scrapeFacebookEnhanced,
    scrapeGumtreeEnhanced,
    scrapeBackMarketEnhanced,
    scrapeCashConvertersEnhanced,
    scrapeAllWithBrowserUse,
    scrapeSmartStrategy
};
