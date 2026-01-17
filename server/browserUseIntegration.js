/**
 * Browser Use Agent Integration
 * Connects Node.js server to Python browser-use agent via HTTP
 */

const axios = require('axios');

const BROWSER_USE_API_URL = process.env.BROWSER_USE_API_URL || 'http://localhost:8001';

/**
 * Search using AI-powered browser automation
 * @param {string} query - Product search query
 * @param {string} marketplace - Marketplace name (ebay, facebook, gumtree, etc.)
 * @param {string} location - Location/region (UK, US, etc.)
 * @returns {Promise<Object>} Search results
 */
async function searchWithBrowserUse(query, marketplace, location = 'UK') {
    try {
        console.log(`[Browser-Use] Searching ${marketplace} for "${query}" in ${location}`);

        const response = await axios.get(`${BROWSER_USE_API_URL}/search/${marketplace}`, {
            params: {
                query,
                location
            },
            timeout: 120000 // 2 minute timeout for AI agent
        });

        if (response.data.success) {
            console.log(`[Browser-Use] Found ${response.data.results.length} results from ${marketplace}`);
            return {
                results: response.data.results,
                url: `${marketplace} (AI Agent)`,
                scraperName: `${marketplace} (Browser-Use)`,
                scraperId: `browseruse-${marketplace.toLowerCase()}`
            };
        } else {
            console.error(`[Browser-Use] Search failed: ${response.data.error}`);
            return {
                results: [],
                url: `${marketplace} (AI Agent)`,
                error: response.data.error
            };
        }
    } catch (error) {
        console.error(`[Browser-Use] Error: ${error.message}`);

        // Check if browser-use service is running
        if (error.code === 'ECONNREFUSED') {
            console.error('[Browser-Use] Service not running. Start it with: cd browser-use-agent && python server.py');
        }

        return {
            results: [],
            url: `${marketplace} (AI Agent)`,
            error: error.message
        };
    }
}

/**
 * Check if browser-use service is available
 * @returns {Promise<boolean>}
 */
async function isBrowserUseAvailable() {
    // Skip if in production and using localhost (unreachable)
    const isProduction = process.env.FUNCTION_NAME || process.env.K_SERVICE || process.env.VERCEL || process.env.NET_LIFY;
    if (isProduction && BROWSER_USE_API_URL.includes('localhost')) {
        return false;
    }

    try {
        const response = await axios.get(`${BROWSER_USE_API_URL}/`, {
            timeout: 2000 // Reduced from 5s to 2s
        });
        return response.data.status === 'online';
    } catch (error) {
        return false;
    }
}

/**
 * Enhanced scraper that tries browser-use first, falls back to traditional scraping
 * @param {string} query - Product search query
 * @param {string} marketplace - Marketplace name
 * @param {string} location - Location/region
 * @param {Function} fallbackScraper - Traditional scraper function to fall back to
 * @returns {Promise<Object>} Search results
 */
async function scrapeWithFallback(query, marketplace, location, fallbackScraper) {
    // Try browser-use first if available
    const browserUseAvailable = await isBrowserUseAvailable();

    if (browserUseAvailable) {
        console.log(`[Hybrid] Trying browser-use for ${marketplace}...`);
        const results = await searchWithBrowserUse(query, marketplace, location);

        // If browser-use succeeded with results, return them
        if (results.results && results.results.length > 0) {
            console.log(`[Hybrid] Browser-use succeeded with ${results.results.length} results`);
            return results;
        }

        console.log(`[Hybrid] Browser-use returned no results, falling back to traditional scraper`);
    } else {
        console.log(`[Hybrid] Browser-use not available, using traditional scraper`);
    }

    // Fall back to traditional scraper
    return await fallbackScraper(query, location);
}

module.exports = {
    searchWithBrowserUse,
    isBrowserUseAvailable,
    scrapeWithFallback
};
