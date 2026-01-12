import React, { useState } from 'react';
import { Search, Loader2, TrendingUp } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string, location: string) => void;
  isLoading: boolean;
  location: string;
  setLocation: (location: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading, location, setLocation }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query, location);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <form onSubmit={handleSubmit} className="relative flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search electronics (e.g., iPhone 15 Pro, RTX 4080)..."
            className="w-full px-6 py-4 pl-14 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all glass"
          />
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40">
            <Search size={22} />
          </div>
        </div>

        <div className="relative min-w-[100px]">
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full appearance-none px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all glass cursor-pointer"
          >
            <option value="US">🇺🇸 US</option>
            <option value="UK">🇬🇧 UK</option>
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
            <TrendingUp size={16} className="rotate-90" />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="px-8 py-4 bg-brand-primary hover:bg-blue-600 rounded-2xl font-bold transition-all shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/40 disabled:opacity-50 flex items-center gap-2 text-white whitespace-nowrap"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Compare'}
        </button>
      </form>
    </div>
  );
};
