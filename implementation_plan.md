# Implementation Plan - Dropship Price Comparator

A system to compare prices for second-hand electronics across eBay and Facebook Marketplace to identify dropshipping opportunities.

## Phase 1: Foundation
- [ ] Initialize Vite + React + Tailwind + TypeScript project.
- [ ] Set up layout and theme (Dark Mode, Premium UI).
- [ ] Establish a design system for components (Cards, Search, Tables).

## Phase 2: Search & Scraper Core
- [ ] **EBay Scraper**: Fetch search results using scraping (or API if keys provided).
- [ ] **Facebook Marketplace Scraper**: Fetch search results for a specific location.
- [ ] **Data Normalization**: Standardize pricing, title, and condition data from both sources.

## Phase 3: Analytics & Comparison
- [ ] **Price Comparator View**: Side-by-side comparison of results.
- [ ] **Profitability Calculator**: account for shipping, seller fees, and tax.
- [ ] **Filtering & Sorting**: Sort by price, condition, or "Profit Score".

## Phase 4: Polish
- [ ] Framer Motion animations for smooth transitions.
- [ ] Detail view for listings.
- [ ] Export findings to CSV/JSON.

## Tech Stack
- **Frontend**: React, Tailwind CSS, Lucide Icons.
- **State Management**: React Hooks.
- **Scraping**: Node.js backend (Express) with Playwright/Puppeteer.
- **Styling**: Premium Glassmorphism design with a dark background.
