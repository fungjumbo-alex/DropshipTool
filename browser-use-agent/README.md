# Browser-Use Agent for Dropship Comparator

AI-powered browser automation for product searching using [browser-use](https://github.com/browser-use/browser-use).

## Features

- 🤖 **AI-Powered Scraping**: Uses LLM to intelligently navigate and extract product data
- 🌐 **Multi-Marketplace Support**: Works with eBay, Facebook, Gumtree, BackMarket, CeX, and more
- 🔄 **Automatic Fallback**: Falls back to traditional scrapers if AI agent fails
- 🚀 **Cloud-Based**: Uses Browser Use Cloud for stealth browsing and bypassing bot detection
- 🔌 **Easy Integration**: HTTP API that works with existing Node.js server

## Setup

### 1. Install Python Dependencies

```bash
cd browser-use-agent
pip install -r requirements.txt
```

Or using `uv` (recommended):

```bash
cd browser-use-agent
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
```

### 2. Install Chromium Browser

```bash
uvx browser-use install
```

### 3. Configure API Key

The API key is already set in `.env`:
```
BROWSER_USE_API_KEY=bu_UzYdrYRjqVtYMJAdjwtYkLu1K8tKdLOqsb7RVpXIK9g
```

### 4. Start the Browser-Use Server

```bash
python server.py
```

The server will start on `http://localhost:8001`

## Usage

### Option 1: Direct Python CLI

```bash
python agent.py "ipad pro" ebay UK
```

### Option 2: HTTP API

Start the server and make requests:

```bash
# GET request
curl "http://localhost:8001/search/ebay?query=ipad+pro&location=UK"

# POST request
curl -X POST "http://localhost:8001/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "ipad pro", "marketplace": "ebay", "location": "UK"}'
```

### Option 3: Node.js Integration

The browser-use agent is automatically integrated into your existing scrapers:

```javascript
const { scrapeWithFallback } = require('./browserUseIntegration');
const { scrapeEbay } = require('./scrapers');

// This will try browser-use first, fall back to traditional scraper
const results = await scrapeWithFallback('ipad', 'ebay', 'UK', scrapeEbay);
```

## Integration with Existing Server

To enable browser-use for specific scrapers, update `server/scrapers.js`:

```javascript
const { scrapeWithFallback } = require('./browserUseIntegration');

// Wrap existing scrapers with fallback
async function scrapeEbayEnhanced(query, location) {
    return await scrapeWithFallback(query, 'ebay', location, scrapeEbay);
}

async function scrapeFacebookEnhanced(query, location) {
    return await scrapeWithFallback(query, 'facebook', location, scrapeFacebook);
}
```

## How It Works

1. **AI Agent**: Uses ChatBrowserUse (LLM) to understand the task
2. **Browser Automation**: Navigates to marketplace and extracts data
3. **Intelligent Extraction**: AI identifies product listings and extracts structured data
4. **JSON Response**: Returns normalized product data in consistent format

## Advantages Over Traditional Scraping

| Feature | Traditional Scraping | Browser-Use Agent |
|---------|---------------------|-------------------|
| **Bot Detection** | Often blocked | Stealth browser bypasses detection |
| **Dynamic Content** | Requires complex selectors | AI understands page structure |
| **Layout Changes** | Breaks when site updates | Adapts automatically |
| **Login Walls** | Hard to bypass | Can handle authentication |
| **Cloudflare** | Often blocked | Cloud browser bypasses |

## Supported Marketplaces

- ✅ eBay (UK & US)
- ✅ Facebook Marketplace
- ✅ Gumtree
- ✅ BackMarket
- ✅ CeX
- ✅ Cash Converters
- ✅ Any custom marketplace (just provide URL)

## Troubleshooting

### Browser-Use Service Not Running

If you see `ECONNREFUSED` errors:

```bash
cd browser-use-agent
python server.py
```

### API Key Issues

Verify your API key is set:

```bash
cat .env
```

### Chromium Not Installed

```bash
uvx browser-use install
```

## Running in Production

For production deployment, consider:

1. **Use Browser Use Cloud Sandboxes** for scalability
2. **Set up as systemd service** for auto-restart
3. **Use nginx reverse proxy** for HTTPS
4. **Monitor with logging** and error tracking

See [Browser Use Production Docs](https://docs.browser-use.com/production) for more details.

## Cost

Browser Use Cloud pricing:
- **Free tier**: $10 credits for new signups
- **Pay-as-you-go**: ~$0.01-0.05 per search (depending on complexity)

Traditional scrapers remain free but may be blocked more often.

## Development

### Test Individual Marketplace

```bash
python agent.py "macbook pro" ebay UK
python agent.py "iphone 14" facebook UK
python agent.py "ps5" gumtree UK
```

### Check Service Status

```bash
curl http://localhost:8001/
```

## License

Same as parent project (Dropship Comparator)
