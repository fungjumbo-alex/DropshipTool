const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright-core');
let chromiumLambda;
try {
    chromiumLambda = require('@sparticuz/chromium-min');
} catch (e) {
    // Falls back to local playwright if sparticuz is missing
}

async function getBrowser() {
    console.log(`[Browser] Attempting launch. Environment: ${process.env.NETLIFY ? 'Netlify' : 'Local'}`);

    // If we're on Netlify/Lambda, use sparticuz chromium
    if (process.env.NETLIFY || process.env.AWS_EXECUTION_ENV || process.env.FUNCTION_NAME || process.env.K_SERVICE) {
        if (!chromiumLambda) {
            console.error('[Browser] chromiumLambda is not defined! Check if @sparticuz/chromium-min is installed.');
            throw new Error('chromiumLambda is not defined');
        }

        console.log('[Browser] Launching with Sparticuz Chromium...');
        return await chromium.launch({
            args: [...(chromiumLambda.args || []), '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            executablePath: await chromiumLambda.executablePath(),
            headless: chromiumLambda.headless,
        });
    }

    console.log('[Browser] Launching local chromium...');
    // Locally, use playwright-core (it will assume browsers are in default location)
    return await chromium.launch({ headless: true });
}

async function scrapeEbay(query, location = 'US') {
    let browser;
    try {
        const domain = location.toUpperCase() === 'UK' ? 'ebay.co.uk' : 'ebay.com';
        const currencyCode = location.toUpperCase() === 'UK' ? 'GBP' : 'USD';
        const url = `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12`;

        console.log(`eBay Search URL (${location}): ${url}`);

        browser = await getBrowser();
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: location.toUpperCase() === 'UK' ? 'en-GB' : 'en-US',
            geolocation: location.toUpperCase() === 'UK' ? { longitude: -0.1276, latitude: 51.5074 } : { longitude: -74.006, latitude: 40.7128 },
            permissions: ['geolocation']
        });
        const page = await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
            await page.waitForSelector('.s-item__wrapper', { timeout: 8000 });
        } catch (e) {
            console.warn('eBay: Timeout waiting for .s-item__wrapper');
        }

        const items = await page.evaluate((currencyCode) => {
            const results = [];

            // Strategy 1: Specific Selectors
            let cards = Array.from(document.querySelectorAll('li.s-item, .s-item'));

            // Strategy 2: Generic Fallback (if specific fails significantly)
            if (cards.length < 2) {
                const allLinks = Array.from(document.querySelectorAll('a'));
                cards = allLinks.filter(link => {
                    const text = link.innerText;
                    return (text.includes('£') || text.includes('$')) && text.length > 10;
                });
            }

            cards.forEach((card, index) => {
                const text = card.innerText;
                if (text.includes('Shop on eBay')) return;

                // Try specific first
                let titleEl = card.querySelector('.s-item__title');
                let priceEl = card.querySelector('.s-item__price');
                let linkEl = card.querySelector('.s-item__link');
                let imgEl = card.querySelector('.s-item__image-img');

                // Fallback to text parsing if inside a generic card/link
                let title = titleEl ? titleEl.innerText : '';
                let price = 0;
                let link = linkEl ? linkEl.href : (card.href || '');

                if (!priceEl) {
                    const priceMatch = text.match(/[\£\$]\s?(\d{1,3}(,\d{3})*(\.\d{2})?)/);
                    if (priceMatch) {
                        price = parseFloat(priceMatch[1].replace(/,/g, ''));
                    }
                } else {
                    const priceText = priceEl.textContent.trim();
                    price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                }

                if (!title) {
                    const lines = text.split('\n');
                    title = lines.find(l => l.length > 10 && !l.includes('£') && !l.includes('$')) || '';
                }

                if (link && title && price > 0) {
                    results.push({
                        source: 'eBay',
                        title: title.trim(),
                        price: price,
                        currency: currencyCode,
                        link: link,
                        image: imgEl ? imgEl.src : null,
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
        // If it's a browser error, we want the main handler to know
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
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
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        const city = location.toUpperCase() === 'UK' ? 'london' : 'nyc';
        const url = `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}`;
        console.log(`Facebook Search URL (${location}): ${url}`);

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        await page.goto(url, { waitUntil: 'networkidle' });

        try {
            await Promise.race([
                page.waitForSelector('div[role="main"]', { timeout: 5000 }),
                page.waitForSelector('div[aria-label="Collection of Marketplace items"]', { timeout: 5000 }),
                page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 5000 })
            ]);
        } catch (e) {
            console.warn('Facebook: Timeout waiting for selectors');
        }

        const items = await page.evaluate((currencyCode) => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));

            return links.slice(0, 10).map(link => {
                const cardText = link.innerText;
                const lines = cardText.split('\n');

                const title = lines.find(l => l.length > 10 && !l.includes('£') && !l.includes('$') && !l.includes('Shipping')) || 'Facebook Item';
                const priceMatch = lines.find(l => l.includes('£') || l.includes('$')) || '0';
                const locationText = lines[lines.length - 1] || 'Unknown';

                const cleanPriceMatch = priceMatch.split(/[\s\n]+/)[0];
                const parsedPrice = parseFloat(cleanPriceMatch.replace(/[^0-9.]/g, ''));

                return {
                    source: 'Facebook',
                    title: title,
                    price: isNaN(parsedPrice) ? 0 : parsedPrice,
                    currency: currencyCode,
                    link: 'https://www.facebook.com' + link.getAttribute('href'),
                    image: link.querySelector('img')?.getAttribute('src'),
                    condition: 'Used',
                    originalPrice: priceMatch,
                    location: locationText
                };
            }).filter(item => item.price > 0);
        }, currencyCode);

        return { results: items, url };
    } catch (error) {
        console.error('Facebook Scrape Error:', error.message);
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
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
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        console.log(`CeX Search URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle' });

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
                    const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));

                    if (!isNaN(price)) {
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
        console.error('CeX Scrape Error:', error.message);
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
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
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        console.log(`Gumtree Search URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle' });

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
                    const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));

                    if (!isNaN(price)) {
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
        console.error('Gumtree Scrape Error:', error.message);
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
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
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 },
            locale: 'en-GB',
            timezoneId: 'Europe/London'
        });
        const page = await context.newPage();

        // Stealth
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Scroll to trigger lazy loading
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
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
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
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: 'en-GB'
        });
        const page = await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
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
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: 'en-GB'
        });
        const page = await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
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
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: 'en-GB'
        });
        const page = await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait a bit for dynamic content
        try {
            await page.waitForSelector('.cx-card-product', { timeout: 8000 });
        } catch (e) {
            console.warn('CeX Sell: Timeout waiting for product cards');
        }

        const items = await page.evaluate(() => {
            const results = [];
            // Reuse the card logic but look for specific sell prices
            const cards = document.querySelectorAll('.cx-card-product, div[class*="product"]');

            cards.forEach(card => {
                const text = card.innerText;
                const titleEl = card.querySelector('.line-clamp') || card.querySelector('h3') || card.querySelector('a');

                // Look for "Cash: £123" patterns often found in sell pages
                // Or "We pay"
                // The structure usually has "Cash" label near the price
                const cashMatch = text.match(/Cash[:\s]+£([\d,]+(\.\d{2})?)/i);

                if (titleEl && cashMatch) {
                    const price = parseFloat(cashMatch[1].replace(/,/g, ''));
                    const title = titleEl.innerText.trim();
                    const imgEl = card.querySelector('img');

                    if (!isNaN(price)) {
                        results.push({
                            title: title,
                            cashPrice: price,
                            currency: 'GBP',
                            link: 'https://uk.webuy.com/sell',
                            image: imgEl ? imgEl.src : null
                        });
                    }
                }
            });
            return results;
        });

        // We want the highest cash price that matches the query best? 
        // For now return all found
        return { results: items, url };

    } catch (error) {
        console.error('CeX Sell Scrape Error:', error.message);
        if (error.message.includes('launch') || error.message.includes('executable') || error.message.includes('defined')) {
            throw error;
        }
        return { results: [], url };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeEbay, scrapeFacebook, scrapeCex, scrapeGumtree, scrapeBackMarket, scrapeMusicMagpie, scrapeCashConverters, scrapeCexSell };
