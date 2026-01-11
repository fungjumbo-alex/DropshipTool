import { useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { ProductCard } from './components/ProductCard';
import { PriceFilter } from './components/PriceFilter';
import type { Product } from './components/ProductCard';
import { TrendingUp, DollarSign, RefreshCw, Search } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  // currency state is already defined above
  const [minPrice, setMinPrice] = useState<number>(50);
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [cexSellLow, setCexSellLow] = useState<number>(0);
  const [cexSellHigh, setCexSellHigh] = useState<number>(0);
  const [strictMatch, setStrictMatch] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const handleSearch = async (query: string, location: string) => {
    setIsLoading(true);
    setError(null);
    setLastQuery(query);
    setResults([]); // Clear previous results
    setDebugInfo({ scraperStatus: [] });

    const sources = [
      { id: 'ebay', name: 'eBay' },
      { id: 'facebook', name: 'Facebook' },
      { id: 'cex', name: 'CeX' },
      { id: 'gumtree', name: 'Gumtree' },
      { id: 'musicmagpie', name: 'MusicMagpie' },
      { id: 'cashconverters', name: 'CashConverters' },
      { id: 'backmarket', name: 'BackMarket' },
      { id: 'cexsell', name: 'CeX Arbitrage' }
    ];

    setCurrency(location === 'UK' ? 'GBP' : 'USD');

    // Helper to fetch a single source
    const fetchSource = async (sourceId: string) => {
      try {
        const response = await axios.get(`/api/compare?query=${encodeURIComponent(query)}&location=${location}&source=${sourceId}`);

        // Update results incrementally
        if (response.data.results && response.data.results.length > 0) {
          setResults(prev => [...prev, ...response.data.results].sort((a, b) => a.price - b.price));
        }

        // Special handling for CeX Sell prices
        if (sourceId === 'cexsell') {
          setCexSellLow(response.data.cexSellPriceLow || 0);
          setCexSellHigh(response.data.cexSellPriceHigh || 0);
        }

        // Update debug info incrementally
        if (response.data.debug?.scraperStatus) {
          setDebugInfo((prev: any) => ({
            ...prev,
            scraperStatus: [...(prev?.scraperStatus || []), ...response.data.debug.scraperStatus]
          }));
        }
      } catch (err: any) {
        console.error(`Failed to fetch ${sourceId}:`, err);
        // Update debug info with error status
        setDebugInfo((prev: any) => ({
          ...prev,
          scraperStatus: [...(prev?.scraperStatus || []), {
            name: sourceId.charAt(0).toUpperCase() + sourceId.slice(1),
            status: 'error',
            error: err.response?.data?.message || err.message,
            count: 0
          }]
        }));
      }
    };

    try {
      // Run the first few essentially important ones first
      // In production, we run them in small batches to stay safe
      const isLocal = window.location.hostname === 'localhost';

      if (isLocal) {
        // Parallel for local
        await Promise.all(sources.map(s => fetchSource(s.id)));
      } else {
        // Sequential/Slow Parallel for production
        // We do 2 at a time with a stagger to stay safe
        for (let i = 0; i < sources.length; i += 2) {
          const chunk = sources.slice(i, i + 2);
          await Promise.all(chunk.map(s => fetchSource(s.id)));
          // Small delay before the next chunk
          if (i + 2 < sources.length) await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch (err) {
      console.error('Core search error:', err);
      setError('Search encountered an error. Some results may be missing.');
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredResults = () => {
    if (results.length === 0) return [];

    // 1. Keyword-based Cleanup
    const accessoryKeywords = ['case', 'cover', 'protector', 'glass', 'box only', 'parts', 'broken', 'repair', 'manual', 'cable'];
    let filtered = results.filter(product => {
      const title = product.title.toLowerCase();

      // Keyword mismatch detection (Accessories/Parts)
      if (accessoryKeywords.some(keyword => title.includes(keyword))) {
        return false;
      }

      // 2. Strict Match Logic (Optional)
      if (strictMatch && lastQuery) {
        const keywords = lastQuery.toLowerCase().split(' ').filter(word => word.trim().length > 0);
        const hasAllKeywords = keywords.every(kw => title.includes(kw));
        if (!hasAllKeywords) return false;
      }

      return true;
    });

    const dataToUse = filtered.length > 0 ? filtered : results;
    if (dataToUse.length === 0) return [];

    // 3. Application of Absolute Price Filter
    return dataToUse.filter(item => {
      if (isNaN(item.price) || item.price <= 0) return false;
      return item.price >= minPrice && item.price <= maxPrice;
    });
  };

  const filteredResults = getFilteredResults();
  const filteredPrices = filteredResults.map(r => r.price);

  const getBestPrice = () => {
    if (filteredPrices.length === 0) return null;
    return Math.min(...filteredPrices);
  };

  const getAveragePrice = () => {
    if (filteredPrices.length === 0) return null;
    const sum = filteredPrices.reduce((acc, curr) => acc + curr, 0);
    return sum / filteredPrices.length;
  };

  const bestPrice = getBestPrice();
  const averagePrice = getAveragePrice();

  return (
    <div className="min-h-screen animated-bg p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 mb-4"
          >
            <div className="p-3 bg-brand-primary rounded-2xl shadow-lg shadow-brand-primary/20">
              <TrendingUp className="text-white" size={32} />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Dropship<span className="text-brand-primary">Compare</span>
            </h1>
          </motion.div>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Find the best deals on second-hand electronics across eBay and Facebook Marketplace.
            Identify high-margin dropshipping opportunities instantly.
          </p>
        </header>

        {/* Search & Filter */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <div className="lg:col-span-3">
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-1">
            <PriceFilter
              minPrice={minPrice}
              maxPrice={maxPrice}
              onMinChange={setMinPrice}
              onMaxChange={setMaxPrice}
              currency={currency}
              strictMatch={strictMatch}
              onStrictMatchChange={setStrictMatch}
              disabled={results.length === 0}
            />
          </div>
        </div>

        {/* Dashboard Stats */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
            >
              <div className="glass p-6 rounded-3xl flex items-center gap-5">
                <div className="p-4 bg-emerald-500/20 rounded-2xl">
                  <DollarSign className="text-emerald-400" size={24} />
                </div>
                <div>
                  <p className="text-white/40 text-sm font-medium">Best Market Price</p>
                  <p className="text-2xl font-bold text-white">
                    {currency === 'GBP' ? '£' : '$'}
                    {bestPrice?.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="glass p-6 rounded-3xl flex items-center gap-5">
                <div className="p-4 bg-brand-primary/20 rounded-2xl">
                  <TrendingUp className="text-brand-primary" size={24} />
                </div>
                <div>
                  <p className="text-white/40 text-sm font-medium">Avg Market Value</p>
                  <div className="flex flex-col">
                    <p className="text-2xl font-bold text-white">
                      {currency === 'GBP' ? '£' : '$'}
                      {averagePrice?.toFixed(2)}
                    </p>
                    <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold">
                      {Object.entries(
                        results.reduce((acc, curr) => {
                          acc[curr.source] = (acc[curr.source] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([source, count], i) => (
                        <span key={source}>
                          {i > 0 && ' • '}{source}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass p-6 rounded-3xl flex items-center gap-5">
                <div className="p-4 bg-purple-500/20 rounded-2xl">
                  <RefreshCw className="text-purple-400" size={24} />
                </div>
                <div>
                  <p className="text-white/40 text-sm font-medium">Profit Potential</p>
                  <p className="text-2xl font-bold text-white">
                    {averagePrice && bestPrice ? `${((averagePrice - bestPrice) / bestPrice * 100).toFixed(1)}%` : '-%'}
                  </p>
                </div>
              </div>

              <div className="glass p-6 rounded-3xl flex items-center gap-5 relative overflow-hidden">
                <div className="p-4 bg-orange-500/20 rounded-2xl">
                  <div className="text-orange-400 font-bold text-xl">£</div>
                </div>
                <div>
                  <p className="text-white/40 text-sm font-medium">CeX Cash Price</p>
                  <p className="text-2xl font-bold text-white">
                    {cexSellHigh > 0
                      ? (cexSellLow !== cexSellHigh
                        ? `£${cexSellLow} - £${cexSellHigh}`
                        : `£${cexSellHigh}`)
                      : 'N/A'}
                  </p>
                  {cexSellHigh > (bestPrice || 999999) && (
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider absolute top-4 right-4">
                      Arbitrage!
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Error Display for Production Debugging */}
        {!isLoading && lastQuery && (
          <div className="mb-8 p-4 bg-white/5 border border-white/10 rounded-2xl">
            <h3 className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-3">Backend Scraper Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {debugInfo?.scraperStatus?.map((s: any) => (
                <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <span className="text-[10px] font-bold text-white/60">{s.name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.status === 'success' ? (s.count > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400') : 'bg-red-500/20 text-red-400'
                    }`}>
                    {s.status === 'success' ? (s.count > 0 ? `${s.count} items` : '0 items') : 'Error'}
                  </span>
                  {s.error && <p className="text-[8px] text-red-500 mt-1 absolute bottom-[-15px] left-0 truncate w-full">{s.error}</p>}
                </div>
              ))}
            </div>
            {results.length === 0 && (
              <p className="text-[10px] text-white/40 mt-4 text-center italic">
                No results found. If all status above show "0 items", the scrapers might be blocked or failing to find matches.
              </p>
            )}
          </div>
        )}

        {/* Results Title */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <AnimatePresence>
            {filteredResults.map((product, index) => (
              <motion.div
                key={`${product.source}-${index}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <ProductCard
                  product={product}
                  arbitragePotential={cexSellLow > 0 && product.price < cexSellLow}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {error && (
          <div className="mt-8 p-4 bg-red-500/20 border border-red-500/50 rounded-2xl text-red-200 text-center">
            {error}
          </div>
        )}

        {!isLoading && results.length === 0 && !error && (
          <div className="mt-20 text-center">
            <div className="opacity-10 mb-6">
              <Search size={80} className="mx-auto" />
            </div>
            <h2 className="text-2xl font-semibold text-white/40">No search results yet</h2>
            <p className="text-white/20 mt-2">Enter a product name above to start comparing</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
