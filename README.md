# DropshipComparator 🛒

A sophisticated real-time price comparison and arbitrage tool for second-hand electronics!

## 🚀 Features
- **Multi-Source Scraping**: eBay, Facebook Marketplace, CeX, Gumtree, BackMarket, MusicMagpie, and CashConverters.
- **UK Market Optimized**: Pre-configured for UK retailers with currency support.
- **Arbitrage Highlighting**: Automatically flags items cheaper than the lowest CeX trade-in price.
- **Profit Potential Dashboard**: Real-time stats on best price vs. average market value.
- **CeX Price Reference**: Shows the range of cash prices CeX will pay for items.

## 🛠️ Tech Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS + Framer Motion.
- **Backend**: Node.js + Express + Playwright for stealth scraping.
- **Deployment**: Configured for Firebase (Functions) and Netlify (Functions).

## 🌍 Deployment

### **Netlify (GitHub Auto-Deploy)**
This project is pre-configured with `netlify.toml` and Netlify Functions.
1. Connect your GitHub repo to Netlify.
2. The build command is `npm run build`.
3. The publish directory is `dist`.
4. The functions directory is `netlify/functions`.
5. **Note**: Netlify Functions have a default 10s timeout. If scraping takes too long, you may need to upgrade to Pro for longer timeouts or use a dedicated server.

### **Firebase**
1. Ensure you are on the **Blaze (Pay-As-You-Go) Plan** (required for Functions and browser builds).
2. Install Firebase CLI: `npm install -g firebase-tools`.
3. Run `firebase login`.
4. Run `firebase deploy`.

## 💻 Local Development
1. Clone the repo.
2. Run `npm install` in the root and `server/` directories.
3. Run `npm run dev:all` to start both the Vite frontend and Express backend.
