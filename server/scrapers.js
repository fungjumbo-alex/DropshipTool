const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright-core');

// Attempt to load chromium for serverless environment
let chromiumLambda;
try {
    chromiumLambda = require('@sparticuz/chromium');
} catch (e) {
    // Falls back to local playwright if sparticuz is missing
}

async function getBrowser() {
    const isProduction = process.platform === 'linux';
    const isServerless = process.env.FUNCTION_NAME || process.env.K_SERVICE || isProduction;

    if (isServerless && chromiumLambda) {
        try {
            const executablePath = await chromiumLambda.executablePath();
            if (!executablePath) throw new Error('Chromium executable path not found');

            console.log(`[Browser] Launching v131 (Sparticuz) from ${executablePath}`);

            const launchBrowser = async (attempt = 1) => {
                try {
                    // Start with sparticuz default args
                    const stabilityArgs = [...chromiumLambda.args];

                    // Add/Ensure critical flags if not present
                    if (!stabilityArgs.includes('--no-sandbox')) stabilityArgs.push('--no-sandbox');
                    if (!stabilityArgs.includes('--disable-setuid-sandbox')) stabilityArgs.push('--disable-setuid-sandbox');
                    if (!stabilityArgs.includes('--disable-dev-shm-usage')) stabilityArgs.push('--disable-dev-shm-usage');

                    return await chromium.launch({
                        args: stabilityArgs,
                        executablePath: executablePath,
                        headless: true,
                        timeout: 30000
                    });
                } catch (err) {
                    if (attempt < 3 && (err.message.includes('EFAULT') || err.message.includes('closed') || err.message.includes('spawn') || err.message.includes('signal') || err.message.includes('SIGTRAP'))) {
                        console.warn(`[Browser] Launch attempt ${attempt} failed: ${err.message}. Retrying...`);
                        await new Promise(r => setTimeout(r, 2000));
                        return launchBrowser(attempt + 1);
                    }
                    throw err;
                }
            };

            return await launchBrowser();
        } catch (e) {
            console.error(`[Browser] Production launch failed: ${e.message}`);
            if (isProduction) throw new Error(`Production Browser Error: ${e.message}`);
        }
    }

    // Local Mac/Windows launch
    console.log('[Browser] Launching Local Chromium...');
    try {
        return await chromium.launch({ headless: true });
    } catch (e) {
        console.error('Local browser launch failed:', e.message);
        throw new Error('Could not launch browser. Ensure playwright is installed: npx playwright install chromium');
    }
}

// Helper to create a stealth browser context with anti-detection
async function createStealthContext(browser, location = 'UK', options = {}) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    ];

    const userAgent = options.userAgent || userAgents[Math.floor(Math.random() * userAgents.length)];
    const viewport = options.viewport || { width: 1440, height: 900 };

    const context = await browser.newContext({
        userAgent: userAgent,
        viewport: viewport,
        locale: location.toUpperCase() === 'UK' ? 'en-GB' : 'en-US',
        timezoneId: location.toUpperCase() === 'UK' ? 'Europe/London' : 'America/New_York',
        colorScheme: 'light',
        deviceScaleFactor: 1,
        hasTouch: !!options.hasTouch,
        isMobile: !!options.isMobile,
        extraHTTPHeaders: {
            'Accept-Language': location.toUpperCase() === 'UK' ? 'en-GB,en;q=0.9' : 'en-US,en;q=0.9',
            'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-CH-UA-Mobile': options.isMobile ? '?1' : '?0',
            'Sec-CH-UA-Platform': userAgent.includes('Windows') ? '"Windows"' : '"macOS"'
        }
    });

    const page = await context.newPage();

    // Advanced anti-detection script
    await page.addInitScript(() => {
        // Modern bot detection removal
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // Chrome Runtime mock
        window.chrome = {
            runtime: {},
            loadTimes: function () { },
            csi: function () { },
            app: {}
        };

        // Permissions mock
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );

        // WebGL Spoofing
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return 'Intel Open Source Technology Center';
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return 'Mesa DRI Intel(R) HD Graphics 5500 (Broadwell GT2)';
            return getParameter.apply(this, arguments);
        };
    });

    return page;
}

async function scrapeEbay(query, location = 'US') {
    let browser;
    try {
        const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
        const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
        const url = `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12`;

        console.log(`eBay Search URL (${location}): ${url}`);

        browser = await getBrowser();
        // Use a mobile-like context for eBay, often bypasses desktop bot checks
        const page = await createStealthContext(browser, location, {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);

        // Check for bot wall
        const title = await page.title();
        if (title.includes('Attention Required') || title.includes('Checking your browser') || title.includes('Access Denied')) {
            console.warn(`eBay: Bot protection or access denied. Title: ${title}`);
        }

        try {
            await Promise.race([
                page.waitForSelector('.s-item__wrapper, .s-item, li[data-view], div.s-item__info, li.s-card', { timeout: 15000 }),
                page.waitForTimeout(5000) // At least wait 5s for slower loads
            ]);
        } catch (e) {
            console.warn('eBay: Timeout waiting for main selectors');
        }

        // Scroll to trigger lazy content
        await page.evaluate(() => window.scrollBy(0, 1500));
        await page.waitForTimeout(2000);

        const items = await page.evaluate((currencyCode) => {
            const results = [];

            // Strategy 1: Mobile Specific Selectors (found via recent analysis)
            let cards = Array.from(document.querySelectorAll('li.s-card, .s-card, .s-item, .s-item__wrapper'));

            // Strategy 2: Absolute generic fallback
            const allLinks = Array.from(document.querySelectorAll('a'));
            const potentialCards = allLinks.filter(link => {
                const text = link.innerText;
                // Look for price symbols and enough text to be a product
                return (text.includes('£') || text.includes('$')) && text.length > 25;
            });

            // Combine and unique
            const combined = [...cards, ...potentialCards];

            combined.forEach((card, index) => {
                const text = card.innerText;
                if (text.includes('Shop on eBay') || text.includes('eBay Store') || text.includes('Shop by Category')) return;

                let title = '';
                let price = 0;
                let link = card.tagName === 'A' ? card.href : (card.querySelector('a')?.href || '');
                let img = null;

                // Mobile Selectors
                const mobileTitleEl = card.querySelector('.s-card__title');
                const mobilePriceEl = card.querySelector('.s-card__price');
                const mobileImgEl = card.querySelector('.s-card__image img, .s-card__image, img');

                // Desktop Selectors (fallback)
                const desktopTitleEl = card.querySelector('.s-item__title');
                const desktopPriceEl = card.querySelector('.s-item__price');
                const desktopImgEl = card.querySelector('.s-item__image-img');

                // Title Extraction
                if (mobileTitleEl) {
                    // Filter out hidden "clipped" spans
                    const span = mobileTitleEl.querySelector('span:not(.clipped)');
                    title = span ? span.innerText : mobileTitleEl.innerText;
                } else if (desktopTitleEl) {
                    title = desktopTitleEl.innerText;
                }

                // Price Extraction
                const priceEl = mobilePriceEl || desktopPriceEl;
                if (priceEl) {
                    const priceText = priceEl.textContent.trim();
                    const match = priceText.match(/[\£\$]\s?([\d,]+(\.\d{2})?)/);
                    price = match ? parseFloat(match[1].replace(/,/g, '')) : 0;
                } else {
                    const priceMatch = text.match(/[\£\$]\s?(\d{1,3}(,\d{3})*(\.\d{2})?)/);
                    if (priceMatch) price = parseFloat(priceMatch[1].replace(/,/g, ''));
                }

                // Link & Img Extraction
                if (mobileImgEl) img = mobileImgEl.src || mobileImgEl.getAttribute('data-src');
                else if (desktopImgEl) img = desktopImgEl.src;

                // Final cleanup
                if (!title || title.length < 5) {
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
                    title = lines.find(l => !l.includes('£') && !l.includes('$')) || 'eBay Item';
                }

                if (link && title && price > 0) {
                    results.push({
                        source: 'eBay',
                        title: title.replace('Opens in a new window or tab', '').trim(),
                        price: price,
                        currency: currencyCode,
                        link: link,
                        image: img,
                        condition: text.toLowerCase().includes('refurbished') ? 'Refurbished' : 'Used',
                        originalPrice: price.toString(),
                        shipping: null
                    });
                }
            });
            return results;
        }, currencyCode);

        // Deduplicate by link
        const unique = items.filter((v, i, a) => a.findIndex(v2 => (v2.link === v.link)) === i);
        return { results: unique.slice(0, 10), url, pageTitle: title };

    } catch (error) {
        console.error('eBay Scrape Error:', error.message);
        const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
        return { results: [], url: `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}`, error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeFacebook(query, location = 'US') {
    let browser;
    try {
        const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
        const isProduction = process.env.FUNCTION_NAME || process.env.K_SERVICE || process.platform === 'linux';

        browser = await getBrowser();
        // Use mobile for Facebook, often has much lower bot security
        const page = await createStealthContext(browser, location, {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true
        });

        const city = location.toUpperCase() === 'UK' ? 'london' : 'nyc';
        // Force mobile domain for better consistency and bypass
        const url = `https://m.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}`;
        console.log(`Facebook Search URL (Mobile): ${url}`);

        // Reduced timeouts for serverless consistency
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(2000);

        // Check for blocking/login walls
        const pageContent = await page.content();
        const pageTitle = await page.title();
        const pageUrl = page.url();

        // Detect various blocking scenarios
        if (pageUrl.includes('/login') || pageUrl.includes('/checkpoint')) {
            console.warn(`Facebook: Redirected to login/checkpoint page - ${pageUrl}`);
            throw new Error('Facebook requires login (datacenter IP blocked)');
        }

        if (pageTitle.toLowerCase().includes('log in') || pageTitle.toLowerCase().includes('log into')) {
            console.warn(`Facebook: Login wall detected - Title: ${pageTitle}`);
            throw new Error('Facebook login wall detected (likely blocked)');
        }

        if (pageContent.includes('Please log in to continue') ||
            pageContent.includes('You must log in') ||
            pageContent.includes('Create new account')) {
            console.warn('Facebook: Login required message found in page content');
            throw new Error('Facebook requires authentication (blocked)');
        }

        // More aggressive dismissal of multiple overlay types
        try {
            await page.evaluate(() => {
                const closeSelectors = [
                    'div[aria-label="Close"]',
                    'div[aria-label="Dismiss"]',
                    'div[role="button"]:has-text("Close")',
                    'div[role="button"]:has-text("Not now")',
                    'i[class*="close"]'
                ];

                // Try to find and click any close-like button
                const buttons = Array.from(document.querySelectorAll('div[role="button"], span, i, div'));
                const dismissBtn = buttons.find(b => {
                    const label = (b.getAttribute('aria-label') || '').toLowerCase();
                    const text = (b.innerText || '').toLowerCase();
                    return label.includes('close') || label.includes('dismiss') ||
                        text === 'close' || text === 'not now' || text === '✕';
                });

                if (dismissBtn) dismissBtn.click();
            });
        } catch (e) { }

        // One quick scroll for production speed
        await page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 500));
        });

        try {
            await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 4000 }).catch(() => { });
        } catch (e) {
            console.warn('Facebook: Timeout waiting for item links');
        }

        const heuristic = (currencyCode) => {
            const results = [];
            // Look for both m.facebook and www style links
            const links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));

            links.forEach(link => {
                const text = link.innerText || '';
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                if (lines.length < 2) return;

                // On mobile: Price is usually first, but we search all lines for safety
                let priceText = '';
                let title = '';

                const priceIdx = lines.findIndex(l => l.includes('£') || l.includes('$'));
                if (priceIdx !== -1) {
                    priceText = lines[priceIdx];
                    // Title is usually the next substantial line
                    title = lines.find((l, idx) => idx !== priceIdx && l.length > 5) || lines[priceIdx + 1] || 'Facebook Item';
                }

                if (!priceText) return;

                const match = priceText.match(/[\£\$]\s?([\d,]+(\.\d{2})?)/);
                const parsedPrice = match ? parseFloat(match[1].replace(/,/g, '')) : 0;

                if (parsedPrice > 0) {
                    results.push({
                        source: 'Facebook',
                        title: title.replace(/,.*$/, '').trim(), // Clean up location if it's appended
                        price: parsedPrice,
                        currency: currencyCode,
                        link: link.href.startsWith('http') ? link.href : 'https://www.facebook.com' + link.getAttribute('href'),
                        image: link.querySelector('img')?.getAttribute('src'),
                        condition: 'Used',
                        originalPrice: priceText,
                        location: 'Marketplace'
                    });
                }
            });
            return results;
        };

        const items = await page.evaluate(heuristic, currencyCode);
        return { results: items.slice(0, 25), url, pageTitle: await page.title() };
    } catch (error) {
        console.error('Facebook Scrape Error:', error.message);
        const city = location.toUpperCase() === 'UK' ? 'london' : 'nyc';
        return { results: [], url: `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}`, error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeCex(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') {
        return { results: [], url: '' };
    }

    let browser;
    const url = `https://uk.webuy.com/search?stext=${encodeURIComponent(query)}`;

    try {
        browser = await getBrowser();
        const page = await createStealthContext(browser, 'UK');

        console.log(`CeX Search URL: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        // Wait for results
        try {
            await page.waitForSelector('.cx-card-product, .wrapper-box, .product-card', { timeout: 15000 });
        } catch (e) {
            console.warn('CeX Buy: Timeout waiting for product cards');
        }

        const items = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.cx-card-product, .wrapper-box, .product-card');

            cards.forEach(card => {
                const titleEl = card.querySelector('.line-clamp, h3, .product-title');
                const priceEl = card.querySelector('.product-main-price, .cash-price, .price');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a[href*="product-detail"], a');
                const stockEl = card.querySelector('.product-stock-availability');

                if (titleEl && priceEl) {
                    const priceText = priceEl.textContent.trim();
                    const match = priceText.match(/[\£\$]\s?([\d,]+(\.\d{2})?)/);
                    const price = match ? parseFloat(match[1].replace(/,/g, '')) : 0;

                    if (price > 0 && price < 100000) {
                        results.push({
                            source: 'CeX',
                            title: titleEl.textContent.trim(),
                            price: price,
                            currency: 'GBP',
                            link: linkEl ? linkEl.href : 'https://uk.webuy.com',
                            image: imgEl ? imgEl.src : null,
                            condition: 'Used (Refurbished)',
                            originalPrice: priceText,
                            warranty: '24 Month Warranty',
                            stock: stockEl ? stockEl.textContent.trim() : 'In Stock'
                        });
                    }
                }
            });
            return results;
        });

        return { results: items.slice(0, 10), url, pageTitle: await page.title() };
    } catch (error) {
        console.error('CeX Scrape Error:', error.message);
        return { results: [], url: `https://uk.webuy.com/search?stext=${encodeURIComponent(query)}`, error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeGumtree(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') {
        return { results: [], url: '' };
    }

    let browser;
    const url = `https://www.gumtree.com/search?search_category=all&q=${encodeURIComponent(query)}`;

    try {
        browser = await getBrowser();
        const page = await createStealthContext(browser, 'UK');

        console.log(`Gumtree Search URL: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        await page.waitForSelector('article[class*="e25keea24"]', { timeout: 5000 }).catch(() => { });

        const items = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('article[class*="e25keea24"]');

            cards.forEach(card => {
                const linkEl = card.querySelector('a[class*="e25keea23"]');
                const titleEl = card.querySelector('div[class*="e25keea19"]');
                const priceEl = Array.from(card.querySelectorAll('div')).find(el => el.textContent.includes('£') && el.children.length === 0);
                const imgEl = card.querySelector('img');
                const locationEl = card.querySelector('div[class*="e25keea14"]');
                const dateEl = Array.from(card.querySelectorAll('span')).find(el => el.textContent.includes('ago') || el.textContent.includes('Just now'));

                if (linkEl && titleEl && priceEl) {
                    const priceText = priceEl.textContent.trim();
                    // Safer price extraction: find the first number after the currency symbol
                    const match = priceText.match(/£\s?([\d,]+(\.\d{2})?)/);
                    const price = match ? parseFloat(match[1].replace(/,/g, '')) : 0;

                    if (price > 0 && price < 100000) { // Sanity check: no items over 100k
                        results.push({
                            source: 'Gumtree',
                            title: titleEl.textContent.trim(),
                            price: price,
                            currency: 'GBP',
                            link: linkEl.href.startsWith('http') ? linkEl.href : `https://www.gumtree.com${linkEl.getAttribute('href')}`,
                            image: imgEl ? imgEl.src : null,
                            condition: 'Used',
                            originalPrice: priceText,
                            location: locationEl ? locationEl.textContent.trim() : 'Unknown',
                            date: dateEl ? dateEl.textContent.trim() : 'Recently'
                        });
                    }
                }
            });
            return results;
        });

        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('Gumtree Scrape Error:', error);
        return { results: [], url };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeBackMarket(query, location = 'US') {
    // Only run for UK for now
    const url = `https://www.backmarket.co.uk/en-gb/search?q=${encodeURIComponent(query)}`;

    if (location.toUpperCase() !== 'UK') {
        return { results: [], url: '' };
    }

    let browser;
    try {
        console.log(`Starting BackMarket Parse: ${url}`);

        browser = await getBrowser();
        // Reset to clean iPhone UA - often more successful with Algolia/CORS
        const page = await createStealthContext(browser, 'UK', {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true
        });

        // Standard navigation with smarter timeout
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for page stabilization - reduced for serverless speed
        let passed = false;
        const maxRetries = 4; // Reduced from 20 to 4 for production speed
        for (let i = 0; i < maxRetries; i++) {
            try {
                const title = await page.title();
                const content = await page.content();

                if (title.includes('Just a moment') || title.includes('Checking your browser')) {
                    console.log(`BackMarket: Waiting for Cloudflare (${i + 1}/${maxRetries})...`);
                    await page.waitForTimeout(3000);
                } else if (content.includes('product-item') || content.includes('productCard') || content.includes('Back Market') || content.includes('/p/')) {
                    passed = true;
                    break;
                } else {
                    await page.waitForTimeout(1500);
                }
            } catch (e) {
                await page.waitForTimeout(2000);
            }
        }

        // Extra wait for Algolia to render - reduced
        await page.waitForTimeout(2000);

        const items = await page.evaluate(() => {
            const results = [];
            // Target precise product cards from recent DOM analysis
            const cards = Array.from(document.querySelectorAll('[data-qa="productCard"], div.product-item, [data-test="product-card"]'));

            cards.forEach(card => {
                const linkEl = card.tagName === 'A' ? card : (card.querySelector('a[href*="/p/"]') || card.querySelector('a[href*="/product/"]'));
                if (!linkEl) return;

                const text = card.innerText;
                const html = card.innerHTML;

                // Price extraction - looking for £ symbol
                const priceMatch = text.match(/£\s?([\d,]+(\.\d{2})?)/) || html.match(/£\s?([\d,]+(\.\d{2})?)/);

                if (priceMatch) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                    if (isNaN(price)) return;

                    // Title extraction - look for specific data-test attributes
                    const titleEl = card.querySelector('[data-test="product-title"], .productTitle, h2, h3');
                    let title = titleEl ? titleEl.innerText : "";

                    if (!title || title.length < 5) {
                        const lines = text.split('\n').filter(l => l.trim().length > 3);
                        title = lines.find(l => !l.includes('£')) || lines[0] || "Refurbished Product";
                    }

                    // Image extraction
                    const imgEl = card.querySelector('img');
                    const img = imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : null;

                    results.push({
                        source: 'BackMarket',
                        title: title.trim(),
                        price: price,
                        currency: 'GBP',
                        link: linkEl.href,
                        image: img,
                        condition: 'Refurbished'
                    });
                }
            });

            // Nuclear Fallback: If no /p/ links found, search for anything with a price symbol
            if (results.length === 0) {
                const allLinks = Array.from(document.querySelectorAll('a'));
                allLinks.forEach(link => {
                    if (link.innerText.includes('£')) {
                        const m = link.innerText.match(/£\s?([\d,]+(\.\d{2})?)/);
                        if (m) {
                            results.push({
                                source: 'BackMarket',
                                title: link.innerText.split('\n')[0].trim(),
                                price: parseFloat(m[1].replace(/,/g, '')),
                                currency: 'GBP',
                                link: link.href,
                                condition: 'Refurbished'
                            });
                        }
                    }
                });
            }

            return results;
        });

        // Deduplicate
        const uniqueItems = items.filter((v, i, a) => a.findIndex(t => (t.link === v.link)) === i);
        console.log(`BackMarket: Successfully extracted ${uniqueItems.length} items`);

        return {
            results: uniqueItems.slice(0, 15),
            url,
            scraperName: 'BackMarket',
            scraperId: 'backmarket'
        };

    } catch (error) {
        console.error('BackMarket Scrape Error:', error.message);
        return {
            results: [],
            url,
            error: error.message,
            scraperName: 'BackMarket',
            scraperId: 'backmarket'
        };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeCashConverters(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') {
        return { results: [], url: '' };
    }

    let browser;
    // Updated search URL to the working structure
    const url = `https://www.cashconverters.co.uk/search-results?query=${encodeURIComponent(query)}`;

    try {
        console.log(`CashConverters Search URL: ${url}`);
        browser = await getBrowser();
        const page = await createStealthContext(browser, 'UK');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);

        // Wait for product cards
        try {
            await page.waitForSelector('.product-item, .product-item-wrapper', { timeout: 10000 });
        } catch (e) {
            console.warn('CashConverters: Timeout waiting for product cards');
        }

        const items = await page.evaluate(() => {
            const results = [];
            // Target specific product items
            const cards = document.querySelectorAll('.product-item');

            if (cards.length === 0) {
                // Fallback to more generic strategy if specific selector fails
                const allLinks = Array.from(document.querySelectorAll('a'));
                const genericCards = allLinks.filter(l => {
                    const t = l.innerText;
                    return t.includes('£') && t.length > 10;
                });

                genericCards.forEach(card => {
                    const text = card.innerText;
                    const priceMatch = text.match(/£\s?(\d{1,3}(,\d{3})*(\.\d{2})?)/);

                    if (priceMatch) {
                        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                        const lines = text.split('\n').filter(l => l.trim().length > 2);
                        const title = lines.find(l => !l.includes('£') && l.length > 5) || lines[0];
                        const imgEl = card.querySelector('img');

                        if (!isNaN(price) && title) {
                            results.push({
                                source: 'CashConverters',
                                title: title.trim(),
                                price: price,
                                currency: 'GBP',
                                link: card.href,
                                image: imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : null,
                                condition: 'Used',
                                location: 'UK Store'
                            });
                        }
                    }
                });
                return results;
            }

            cards.forEach(card => {
                const titleEl = card.querySelector('.product-item__title__description') || card.querySelector('.product-item__title') || card.querySelector('h4') || card.querySelector('a');
                const priceEl = card.querySelector('.product-item__price') || card.querySelector('.price') || card.querySelector('.product-item__body');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');

                if (titleEl && priceEl) {
                    const priceText = priceEl.textContent.trim();
                    const priceMatch = priceText.match(/£\s?([\d,]+(\.\d{2})?)/);

                    if (priceMatch) {
                        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                        if (!isNaN(price)) {
                            results.push({
                                source: 'CashConverters',
                                title: titleEl.textContent.trim(),
                                price: price,
                                currency: 'GBP',
                                link: linkEl ? linkEl.href : 'https://www.cashconverters.co.uk',
                                image: imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : (card.querySelector('.product-item__image img')?.src || null),
                                condition: 'Used',
                                originalPrice: priceText,
                                location: 'UK Store'
                            });
                        }
                    }
                }
            });
            return results;
        });

        // Deduplicate
        const unique = items.filter((v, i, a) => a.findIndex(v2 => (v2.link === v.link)) === i);
        console.log(`CashConverters: Successfully extracted ${unique.length} items`);
        return { results: unique.slice(0, 15), url };
    } catch (error) {
        console.error('CashConverters Scrape Error:', error.message);
        return { results: [], url };
    } finally {
        if (browser) await browser.close();
    }
}


async function scrapePopularProducts(query, location = 'UK', count = 50) {
    let browser;
    try {
        const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
        // Request 100 items per page (_ipg=100) to ensure we have enough after filtering out accessories
        const url = `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12&_ipg=100`;

        browser = await getBrowser();
        const page = await createStealthContext(browser, location, {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        // Multiple scrolls to trigger more lazy loading and capture the full 100 items
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 2500));
            await page.waitForTimeout(1000);
        }

        const products = await page.evaluate((maxCount) => {
            const cards = Array.from(document.querySelectorAll('li.s-card, .s-card, .s-item, .s-item__wrapper, li[data-view]'));
            const results = [];
            const seenTitles = new Set();

            for (const item of cards) {
                // If we found enough distinct high-quality items, we can stop
                if (results.length >= maxCount) break;

                const titleEl = item.querySelector('.s-card__title, .s-item__title');
                const imgEl = item.querySelector('.s-card__image img, .s-item__image-img, img[src*="ebayimg"]');

                if (titleEl) {
                    let fullTitle = titleEl.innerText || '';
                    const lowerTitle = fullTitle.toLowerCase();

                    // Filter out non-product or accessory items
                    if (lowerTitle.includes('case') ||
                        lowerTitle.includes('cover') ||
                        lowerTitle.includes('protector') ||
                        lowerTitle.includes('glass') ||
                        lowerTitle.includes('screen film') ||
                        lowerTitle.includes('shop on ebay') ||
                        lowerTitle.includes('box only')) continue;

                    // Clean up title
                    let cleanTitle = fullTitle
                        .replace(/NEW|New|BRAND NEW|Brand New|Seal|SEALED|Sealed/g, '')
                        .replace(/\[.*?\]|\(.*?\)/g, '')
                        .replace(/Opens in a new window or tab/g, '')
                        .trim();

                    // Take first 5 words for a balanced search term
                    const words = cleanTitle.split(' ').filter(w => w.length > 1);
                    const shortened = words.slice(0, 5).join(' ');

                    if (shortened.length > 5 && !seenTitles.has(shortened.toLowerCase())) {
                        seenTitles.add(shortened.toLowerCase());

                        let imgSrc = null;
                        if (imgEl) {
                            imgSrc = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('src');
                        }

                        results.push({
                            title: shortened,
                            image: imgSrc
                        });
                    }
                }
            }
            return results;
        }, count);
        return products;
    } catch (error) {
        console.error('Popular Products Scrape Error:', error.message);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = {
    scrapeEbay,
    scrapeFacebook,
    scrapeCex,
    scrapeGumtree,
    scrapeBackMarket,
    scrapeCashConverters,
    scrapePopularProducts
};
