# Facebook Scraper Configuration

## Problem
Facebook Marketplace aggressively blocks datacenter IPs (like those used by Firebase Cloud Functions). This means:
- ✅ **Works locally** on your Mac/Windows machine
- ❌ **Fails on Firebase** with login walls or IP blocks

## Solution Options

### Option 1: Disable Facebook on Firebase (Recommended)
Set the environment variable in Firebase Console:

1. Go to Firebase Console → Functions → Environment Variables
2. Add: `SKIP_FACEBOOK_ON_FIREBASE=true`
3. Redeploy: `firebase deploy --only functions`

This will:
- Skip Facebook scraping on Firebase
- Still work locally for testing
- Return a clear error message: "Facebook disabled on Firebase (datacenter IP blocking)"

### Option 2: Keep Trying (Not Recommended)
Leave `SKIP_FACEBOOK_ON_FIREBASE` unset or set to `false`. The scraper will:
- Attempt to scrape Facebook on Firebase
- Likely fail with login wall errors
- Waste function execution time and resources

### Option 3: Use Proxy Service (Advanced)
Integrate a residential proxy service like:
- BrightData (formerly Luminati)
- Oxylabs
- SmartProxy

This requires:
1. Signing up for a proxy service ($$$)
2. Modifying the `scrapeFacebook` function to use proxies
3. Managing proxy rotation and authentication

## Current Implementation

The scraper now includes:
- ✅ **Login wall detection** - Detects when Facebook redirects to login
- ✅ **Checkpoint detection** - Identifies security checkpoints
- ✅ **Content-based blocking** - Checks page content for login requirements
- ✅ **Informative errors** - Returns clear error messages explaining why it failed
- ✅ **Environment-based skipping** - Can be disabled on Firebase via env var

## Error Messages

| Error Message | Meaning | Solution |
|--------------|---------|----------|
| `Facebook requires login (datacenter IP blocked)` | Redirected to login page | Set `SKIP_FACEBOOK_ON_FIREBASE=true` |
| `Facebook login wall detected (likely blocked)` | Page title indicates login required | Set `SKIP_FACEBOOK_ON_FIREBASE=true` |
| `Facebook requires authentication (blocked)` | Page content requires login | Set `SKIP_FACEBOOK_ON_FIREBASE=true` |
| `Facebook disabled on Firebase (datacenter IP blocking)` | Intentionally skipped via env var | This is expected behavior |

## Testing

### Test Locally
```bash
cd server
node test-scrapers.js
```

### Test on Firebase
```bash
# Deploy
firebase deploy --only functions

# Test via curl
curl "https://YOUR-PROJECT.web.app/api/compare?query=ipad&location=UK&source=facebook"
```

## Recommendation

**Set `SKIP_FACEBOOK_ON_FIREBASE=true`** and focus on the other 7 scrapers that work reliably on Firebase:
- eBay
- CeX (Buy)
- Gumtree
- BackMarket
- MusicMagpie
- CashConverters
- CeXSell

This gives you 7 reliable data sources without the headache of Facebook's aggressive blocking.
