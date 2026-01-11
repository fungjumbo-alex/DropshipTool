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
    // Check if we are running in a serverless environment (Linux) or locally (Mac/Win)
    const isServerless = process.env.FUNCTION_NAME || process.env.K_SERVICE || process.platform === 'linux';

    if (isServerless && chromiumLambda) {
        const executablePath = await chromiumLambda.executablePath();
        return await chromium.launch({
            args: [...(chromiumLambda.args || []), '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            executablePath: executablePath,
            headless: true,
        });
    }

    // Locally or if sparticuz fails, use playwright's default launch
    // This expects 'npx playwright install chromium' has been run locally
    try {
        return await chromium.launch({ headless: true });
    } catch (e) {
        console.error('Local browser launch failed:', e.message);
        // Fallback: try to see if we can find a local chrome
        throw new Error('Could not launch browser. Ensure playwright is installed: npx playwright install chromium');
    }
}

// Helper to create a stealth browser context with anti-detection
async function createStealthContext(browser, location = 'UK', options = {}) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
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
        isMobile: !!options.isMobile
    });

    const page = await context.newPage();

    // Advanced anti-detection script
    await page.addInitScript(() => {
        // Modern bot detection removal
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // Canvas Fingerprinting prevention
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type) {
            const context = originalGetContext.apply(this, arguments);
            if (type === '2d' && context) {
                const originalGetImageData = context.getImageData;
                context.getImageData = function () {
                    const imageData = originalGetImageData.apply(this, arguments);
                    if (imageData && imageData.data) {
                        imageData.data[0] = imageData.data[0] + (Math.random() > 0.5 ? 1 : -1);
                    }
                    return imageData;
                };
            }
            return context;
        };

        // Plugins mock
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' }
            ]
        });

        // WebGL Spoofing
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return 'Intel Open Source Technology Center';
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return 'Mesa DRI Intel(R) HD Graphics 5500 (Broadwell GT2)';
            return getParameter.apply(this, arguments);
        };

        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
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
        if (title.includes('Attention Required') || title.includes('Checking your browser')) {
            console.warn('eBay: Bot protection page detected.');
        }

        try {
            await page.waitForSelector('.s-item__wrapper, .s-item, li[data-view], div.s-item__info', { timeout: 10000 });
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
        return { results: unique.slice(0, 10), url };

    } catch (error) {
        console.error('eBay Scrape Error:', error.message);
        const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
        return { results: [], url: `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}` };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeFacebook(query, location = 'US') {
    let browser;
    try {
        const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
        browser = await getBrowser();
        const page = await createStealthContext(browser, location);

        const city = location.toUpperCase() === 'UK' ? 'london' : 'nyc';
        const url = `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}`;
        console.log(`Facebook Search URL (${location}): ${url}`);

        // Set a cookie to try and bypass location selection
        await page.context().addCookies([{
            name: 'wd',
            value: '1920x1080',
            domain: '.facebook.com',
            path: '/'
        }]);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(5000);

        // Close any "Close" or "Not now" buttons if present
        try {
            // Find buttons by text too
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('div[role="button"], span'));
                const closeBtn = btns.find(b => b.innerText.includes('Close') || b.innerText.includes('Not now') || b.innerText === '✕');
                if (closeBtn) closeBtn.click();
            });
        } catch (e) { }

        // Scroll multiple times to load items
        await page.evaluate(async () => {
            window.scrollBy(0, 800);
            await new Promise(r => setTimeout(r, 1000));
            window.scrollBy(0, 800);
            await new Promise(r => setTimeout(r, 1000));
        });

        try {
            await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 10000 }).catch(() => { });
        } catch (e) {
            console.warn('Facebook: Timeout waiting for selectors');
        }

        const items = await page.evaluate((currencyCode) => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a'));

            const itemLinks = links.filter(l => {
                const href = l.getAttribute('href') || '';
                const text = l.innerText;
                return href.includes('/marketplace/item/') && (text.includes('£') || text.includes('$'));
            });

            return itemLinks.map(link => {
                const text = link.innerText;
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                const priceMatch = lines.find(l => l.includes('£') || l.includes('$')) || '0';
                const title = lines.find(l => l.length > 8 && !l.includes('£') && !l.includes('$') && !l.includes('·')) || 'Facebook Item';
                const locationText = lines.find(l => l.length > 3 && !l.includes('£') && !l.includes('$') && lines.indexOf(l) > lines.indexOf(priceMatch)) || 'Unknown';

                const match = priceMatch.match(/[\£\$]\s?([\d,]+(\.\d{2})?)/);
                const parsedPrice = match ? parseFloat(match[1].replace(/,/g, '')) : 0;

                return {
                    source: 'Facebook',
                    title: title,
                    price: isNaN(parsedPrice) ? 0 : parsedPrice,
                    currency: currencyCode,
                    link: link.href.startsWith('http') ? link.href : 'https://www.facebook.com' + link.getAttribute('href'),
                    image: link.querySelector('img')?.getAttribute('src'),
                    condition: 'Used',
                    originalPrice: priceMatch,
                    location: locationText
                };
            }).filter(item => item.price > 0);
        }, currencyCode);

        return { results: items, url };
    } catch (error) {
        console.error('Facebook Scrape Error:', error);
        const city = location.toUpperCase() === 'UK' ? 'london' : 'nyc';
        return { results: [], url: `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}` };
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

        await page.waitForSelector('.cx-card-product', { timeout: 5000 }).catch(() => { });

        const items = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.cx-card-product');

            cards.forEach(card => {
                const titleEl = card.querySelector('.line-clamp');
                const priceEl = card.querySelector('.product-main-price');
                const imgEl = card.querySelector('.card-img img');
                const linkEl = card.querySelector('a[href*="product-detail"]');
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

        return { results: items.slice(0, 10), url };
    } catch (error) {
        console.error('CeX Scrape Error:', error);
        return { results: [], url };
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
    // Only run for UK for now, but return URL for debug visibility
    const url = `https://www.backmarket.co.uk/en-gb/search?q=${encodeURIComponent(query)}`;

    if (location.toUpperCase() !== 'UK') {
        return { results: [], url: '' };
    }

    let browser;
    try {
        console.log(`Starting BackMarket Parse: ${url}`);

        browser = await getBrowser();
        const page = await createStealthContext(browser, 'UK');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        // Try to click "Accept all" cookies if it exists
        try {
            const buttons = await page.$$('button');
            for (const btn of buttons) {
                const text = await btn.innerText();
                if (text.toLowerCase().includes('accept') || text.toLowerCase().includes('agree')) {
                    await btn.click();
                    break;
                }
            }
        } catch (e) { }
        await page.evaluate(async () => {
            for (let i = 0; i < 5; i++) {
                window.scrollBy(0, 600);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        });

        // Debug: Log title
        const pageTitle = await page.title();
        console.log(`BackMarket Page Title: ${pageTitle}`);

        // Wait for ANY content
        try {
            await Promise.race([
                page.waitForSelector('div[data-test="product-item"]', { timeout: 10000 }),
                page.waitForSelector('div.productCard', { timeout: 10000 }),
                page.waitForSelector('main', { timeout: 10000 })
            ]);
        } catch (e) {
            console.warn('BackMarket: Timeout waiting for specific selectors');
        }

        const items = await page.evaluate(() => {
            const results = [];
            // Try multiple selector strategies
            const potentials = document.querySelectorAll('div[data-test="product-item"], a[data-test="product-item"], li');

            console.log(`BackMarket: Found ${potentials.length} potential items`);

            potentials.forEach(card => {
                // Heuristic: Must contain a price and a title
                const text = card.innerText;
                if (!text.includes('£')) return;

                const linkEl = card.tagName === 'A' ? card : card.querySelector('a');
                if (!linkEl) return;

                const titleEl = card.querySelector('h2') || card.querySelector('h3') || card.querySelector('.productTitle');
                const priceMatch = text.match(/£[\d,]+(\.\d{2})?/); // Regex find price

                if (titleEl && priceMatch) {
                    const price = parseFloat(priceMatch[0].replace(/[^0-9.]/g, ''));
                    const title = titleEl.innerText.trim();
                    const imgEl = card.querySelector('img');

                    if (!isNaN(price) && title.length > 5) {
                        results.push({
                            source: 'BackMarket',
                            title: title,
                            price: price,
                            currency: 'GBP',
                            link: linkEl.href.startsWith('http') ? linkEl.href : `https://www.backmarket.co.uk${linkEl.getAttribute('href')}`,
                            image: imgEl ? imgEl.src : null,
                            condition: 'Refurbished',
                            originalPrice: priceMatch[0],
                            warranty: '12 Month Warranty',
                            stock: 'In Stock'
                        });
                    }
                }
            });
            return results;
        });

        console.log(`BackMarket: Extracted ${items.length} items`);
        return { results: items.slice(0, 10), url };

    } catch (error) {
        console.error('BackMarket Scrape Error:', error.message);
        return { results: [], url };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeMusicMagpie(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') {
        return { results: [], url: '' };
    }

    let browser;
    const url = `https://store.musicmagpie.co.uk/store/search?q=${encodeURIComponent(query)}`;

    try {
        console.log(`MusicMagpie Search URL: ${url}`);
        browser = await getBrowser();
        const page = await createStealthContext(browser, 'UK');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        const items = await page.evaluate(() => {
            const results = [];
            // Generic strategy: Find all links with a pound sign in them
            const allLinks = Array.from(document.querySelectorAll('a'));

            const potentialCards = allLinks.filter(l => {
                const t = l.innerText;
                return t.includes('£') && t.length > 10;
            });

            console.log(`MusicMagpie: Found ${potentialCards.length} generic items`);

            potentialCards.forEach(card => {
                const text = card.innerText;
                const priceMatch = text.match(/£\s?(\d{1,3}(,\d{3})*(\.\d{2})?)/);

                if (priceMatch) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                    // Title usually lacks the £ symbol
                    const lines = text.split('\n');
                    const title = lines.find(l => !l.includes('£') && l.length > 5) || lines[0];
                    const imgEl = card.querySelector('img');

                    if (!isNaN(price) && title) {
                        results.push({
                            source: 'MusicMagpie',
                            title: title.trim(),
                            price: price,
                            currency: 'GBP',
                            link: card.href,
                            image: imgEl ? imgEl.src : null,
                            condition: 'Refurbished',
                            originalPrice: priceMatch[0],
                            warranty: '12 Month Warranty',
                            stock: 'In Stock'
                        });
                    }
                }
            });
            return results;
        });

        // Deduplicate
        const unique = items.filter((v, i, a) => a.findIndex(v2 => (v2.link === v.link)) === i);
        return { results: unique.slice(0, 10), url };
    } catch (error) {
        console.error('MusicMagpie Scrape Error:', error.message);
        return { results: [], url };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeCashConverters(query, location = 'US') {
    if (location.toUpperCase() !== 'UK') {
        return { results: [], url: '' };
    }

    let browser;
    const url = `https://www.cashconverters.co.uk/shop?search=${encodeURIComponent(query)}`;

    try {
        console.log(`CashConverters Search URL: ${url}`);
        browser = await getBrowser();
        const page = await createStealthContext(browser, 'UK');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        const items = await page.evaluate(() => {
            const results = [];
            // Generic strategy for CashConverters
            const allLinks = Array.from(document.querySelectorAll('a'));

            const cards = allLinks.filter(l => {
                const t = l.innerText;
                return t.includes('£') && t.length > 5;
            });

            console.log(`CashConverters: Found ${cards.length} generic items`);

            cards.forEach(card => {
                const text = card.innerText;
                const priceMatch = text.match(/£\s?(\d{1,3}(,\d{3})*(\.\d{2})?)/);

                if (priceMatch) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                    const lines = text.split('\n');
                    const title = lines.find(l => !l.includes('£') && l.length > 5) || lines[0];
                    const imgEl = card.querySelector('img');

                    if (!isNaN(price) && title) {
                        results.push({
                            source: 'CashConverters',
                            title: title.trim(),
                            price: price,
                            currency: 'GBP',
                            link: card.href,
                            image: imgEl ? imgEl.src : null,
                            condition: 'Used',
                            originalPrice: priceMatch[0],
                            location: 'UK Store'
                        });
                    }
                }
            });
            return results;
        });

        // Deduplicate
        const unique = items.filter((v, i, a) => a.findIndex(v2 => (v2.link === v.link)) === i);
        return { results: unique.slice(0, 10), url };
    } catch (error) {
        console.error('CashConverters Scrape Error:', error.message);
        return { results: [], url };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeCexSell(query) {
    let browser;
    // CeX Sell URL
    const url = `https://uk.webuy.com/sell/search?stext=${encodeURIComponent(query)}`;

    try {
        console.log(`CeX Sell Search URL: ${url}`);
        browser = await getBrowser();
        const page = await createStealthContext(browser, 'UK');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2000);

        // Wait for results
        try {
            await page.waitForSelector('.wrapper-box, .cash-price', { timeout: 15000 });
        } catch (e) {
            console.warn('CeX Sell: Timeout waiting for product cards');
        }

        const items = await page.evaluate(() => {
            const results = [];
            // Sell side uses .wrapper-box instead of .product-card / .cx-card-product
            const cards = document.querySelectorAll('.wrapper-box');

            cards.forEach(card => {
                const titleEl = card.querySelector('.line-clamp') || card.querySelector('h3');
                const cashPriceEl = card.querySelector('.cash-price');
                const voucherPriceEl = card.querySelector('.cash-voucher');

                if (titleEl && (cashPriceEl || voucherPriceEl)) {
                    let cashPrice = 0;
                    if (cashPriceEl) {
                        const priceText = cashPriceEl.textContent.trim();
                        const match = priceText.match(/[\£\$]\s?([\d,]+(\.\d{2})?)/);
                        cashPrice = match ? parseFloat(match[1].replace(/,/g, '')) : 0;
                    }

                    const title = titleEl.innerText.trim();
                    const imgEl = card.querySelector('img');

                    if (!isNaN(cashPrice) && cashPrice > 0) {
                        results.push({
                            title: title,
                            cashPrice: cashPrice,
                            currency: 'GBP',
                            link: card.querySelector('a')?.href || 'https://uk.webuy.com/sell',
                            image: imgEl ? imgEl.src : null
                        });
                    }
                }
            });
            return results;
        });

        console.log(`CeX Sell: Found ${items.length} items`);
        return { results: items, url };

    } catch (error) {
        console.error('CeX Sell Scrape Error:', error.message);
        return { results: [], url };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeEbay, scrapeFacebook, scrapeCex, scrapeGumtree, scrapeBackMarket, scrapeMusicMagpie, scrapeCashConverters, scrapeCexSell };
