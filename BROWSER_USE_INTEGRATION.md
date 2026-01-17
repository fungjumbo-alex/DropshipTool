# Browser-Use Integration Guide

## 🎯 Quick Start

### 1. Setup (Already Done!)

The browser-use agent is installed and ready to use. Your API key is configured.

### 2. Start the Browser-Use Server

```bash
cd browser-use-agent
source .venv/bin/activate
python server.py
```

The server will start on `http://localhost:8001`

### 3. Test It

In a new terminal:

```bash
cd browser-use-agent
source .venv/bin/activate
python test.py
```

## 🔧 Integration Options

### Option A: Automatic Fallback (Recommended)

This uses browser-use when available, falls back to traditional scrapers:

```javascript
// In server/index.js
const { scrapeWithFallback } = require('./browserUseIntegration');
const { scrapeEbay, scrapeFacebook } = require('./scrapers');

// Replace existing scraper calls with fallback versions
app.get('/api/compare', async (req, res) => {
    const { query, location, source } = req.query;
    
    if (source === 'ebay') {
        const results = await scrapeWithFallback(query, 'ebay', location, scrapeEbay);
        return res.json(results);
    }
    
    if (source === 'facebook') {
        const results = await scrapeWithFallback(query, 'facebook', location, scrapeFacebook);
        return res.json(results);
    }
    
    // ... other sources
});
```

### Option B: Use Enhanced Scrapers

```javascript
// In server/index.js
const {
    scrapeEbayEnhanced,
    scrapeFacebookEnhanced,
    scrapeGumtreeEnhanced
} = require('./scrapersEnhanced');

// Use enhanced versions
const ebayResults = await scrapeEbayEnhanced(query, location);
const facebookResults = await scrapeFacebookEnhanced(query, location);
```

### Option C: Browser-Use Only

For maximum reliability (costs more):

```javascript
const { searchWithBrowserUse } = require('./browserUseIntegration');

const results = await searchWithBrowserUse(query, 'ebay', location);
```

### Option D: Smart Strategy

Uses browser-use for problematic sites, traditional for reliable ones:

```javascript
const { scrapeSmartStrategy } = require('./scrapersEnhanced');

const results = await scrapeSmartStrategy(query, location);
```

## 📊 When to Use Browser-Use

| Scenario | Use Browser-Use? | Why |
|----------|------------------|-----|
| **Facebook Marketplace** | ✅ Yes | Often blocks datacenter IPs |
| **BackMarket** | ✅ Yes | Cloudflare challenges |
| **Gumtree** | ✅ Yes | Dynamic content, bot detection |
| **eBay** | ⚠️ Optional | Works well with traditional scraping |
| **CeX** | ⚠️ Optional | API-like, traditional works fine |
| **Local Testing** | ❌ No | Traditional scrapers work locally |
| **Firebase/Cloud** | ✅ Yes | Datacenter IPs often blocked |

## 🚀 Deployment

### Development

1. Start browser-use server: `python server.py`
2. Start Node.js server: `npm run dev:all`
3. Both servers run simultaneously

### Production (Firebase)

**Option 1: Separate Service**
- Deploy browser-use to a separate server (e.g., Railway, Render, Fly.io)
- Set `BROWSER_USE_API_URL` environment variable in Firebase
- Node.js functions call the external browser-use API

**Option 2: Browser Use Cloud Sandboxes**
- Use `@sandbox()` decorator in Python
- Deploy to Browser Use Cloud
- Call via HTTP from Firebase functions

**Option 3: Disable on Firebase**
- Use browser-use only for local development
- Fall back to traditional scrapers on Firebase
- Set environment variable to control behavior

## 💰 Cost Considerations

### Browser-Use Cloud
- **Free tier**: $10 credits (new signups)
- **Cost per search**: ~$0.01-0.05
- **100 searches**: ~$1-5
- **1000 searches**: ~$10-50

### Traditional Scrapers
- **Cost**: Free
- **Reliability**: Lower (often blocked)
- **Maintenance**: Higher (breaks when sites change)

### Recommendation
Use browser-use for:
- Sites that block traditional scrapers (Facebook, BackMarket)
- Production deployments on cloud platforms
- When reliability > cost

Use traditional scrapers for:
- Local development
- Sites that work reliably (eBay, CeX)
- High-volume, cost-sensitive scenarios

## 🔍 Monitoring

### Check if Browser-Use is Available

```javascript
const { isBrowserUseAvailable } = require('./browserUseIntegration');

const available = await isBrowserUseAvailable();
console.log(`Browser-Use: ${available ? 'Online' : 'Offline'}`);
```

### Log Usage

The integration automatically logs:
- When browser-use is attempted
- When it succeeds/fails
- When it falls back to traditional scrapers

## 🐛 Troubleshooting

### "ECONNREFUSED" Error

Browser-use server is not running:

```bash
cd browser-use-agent
source .venv/bin/activate
python server.py
```

### "No module named browser_use"

Virtual environment not activated:

```bash
cd browser-use-agent
source .venv/bin/activate
```

### "API key not found"

Check `.env` file:

```bash
cat browser-use-agent/.env
```

Should contain:
```
BROWSER_USE_API_KEY=bu_UzYdrYRjqVtYMJAdjwtYkLu1K8tKdLOqsb7RVpXIK9g
```

### Chromium Not Installed

```bash
cd browser-use-agent
source .venv/bin/activate
pip install playwright
playwright install chromium
```

### Slow Performance

Browser-use uses AI and real browsers, so it's slower than traditional scraping:
- Traditional scraper: 1-3 seconds
- Browser-use: 10-30 seconds

Use caching or async processing for better UX.

## 📈 Performance Tips

1. **Cache Results**: Cache browser-use results for 5-10 minutes
2. **Parallel Execution**: Run multiple searches in parallel
3. **Progressive Loading**: Show traditional scraper results first, then browser-use
4. **Smart Routing**: Only use browser-use for sites that need it

## 🔐 Security

- API key is stored in `.env` (not committed to git)
- Browser-use runs in isolated cloud environment
- No credentials stored or transmitted
- HTTPS recommended for production

## 📚 Further Reading

- [Browser-Use Docs](https://docs.browser-use.com)
- [Browser-Use Cloud](https://cloud.browser-use.com)
- [Production Guide](https://docs.browser-use.com/production)
- [Examples](https://docs.browser-use.com/examples)

## 🎉 Next Steps

1. ✅ Setup complete
2. 🧪 Test with `python test.py`
3. 🚀 Start server with `python server.py`
4. 🔗 Integrate with Node.js (see options above)
5. 📊 Monitor usage and costs
6. 🎯 Deploy to production
