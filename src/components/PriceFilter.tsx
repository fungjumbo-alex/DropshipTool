import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface PriceFilterProps {
    minPrice: number;
    maxPrice: number;
    onMinChange: (value: number) => void;
    onMaxChange: (value: number) => void;
    currency: string;
    strictMatch: boolean;
    onStrictMatchChange: (value: boolean) => void;
    disabled: boolean;
}

export const PriceFilter: React.FC<PriceFilterProps> = ({
    minPrice,
    maxPrice,
    onMinChange,
    onMaxChange,
    currency,
    strictMatch,
    onStrictMatchChange,
    disabled
}) => {
    return (
        <div className={`glass p-4 rounded-2xl transition-all ${disabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-1 block">Min Price ({currency === 'GBP' ? '£' : '$'})</label>
                    <input
                        type="number"
                        min="0"
                        value={minPrice}
                        onChange={(e) => onMinChange(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-1 block">Max Price ({currency === 'GBP' ? '£' : '$'})</label>
                    <input
                        type="number"
                        min="0"
                        value={maxPrice}
                        onChange={(e) => onMaxChange(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all"
                    />
                </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                    <input
                        type="checkbox"
                        checked={strictMatch}
                        onChange={(e) => onStrictMatchChange(e.target.checked)}
                        className="sr-only"
                    />
                    <div className={`w-5 h-5 border-2 rounded-md transition-all ${strictMatch ? 'bg-brand-primary border-brand-primary' : 'border-white/20 bg-white/5'}`}>
                        {strictMatch && (
                            <svg className="w-4 h-4 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                </div>
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider group-hover:text-white transition-colors">
                    Strict Keyword Match
                </span>
            </label>
        </div>
    );
};
