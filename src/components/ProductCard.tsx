import React from 'react';
import { ExternalLink, Tag, MapPin } from 'lucide-react';

export interface Product {
    source: 'eBay' | 'Facebook' | 'CeX' | 'Gumtree' | 'BackMarket' | 'CashConverters';
    title: string;
    price: number;
    currency: string;
    link: string;
    image?: string;
    condition?: string;
    originalPrice: string;
    shipping?: string;
    location?: string;
    seller?: string;
    date?: string;
    warranty?: string;
    stock?: string;
    matchScore?: number;
}

interface ProductCardProps {
    product: Product;
    arbitragePotential?: boolean;
}


export const ProductCard: React.FC<ProductCardProps> = ({ product, arbitragePotential }) => {
    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
        if (score >= 70) return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
        return 'text-red-400 bg-red-500/20 border-red-500/30';
    };

    const getBorderColor = () => {
        if (arbitragePotential) return 'ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/20';
        if (product.matchScore && product.matchScore >= 95) return 'border-white/10';
        if (product.matchScore && product.matchScore < 70) return 'border-red-500/20 opacity-75';
        return 'border-white/10';
    };

    return (
        <div className={`glass rounded-3xl overflow-hidden glass-hover flex flex-col h-full transition-all duration-300 ${getBorderColor()}`}>
            <div className="relative aspect-square overflow-hidden bg-white/5">
                {product.image ? (
                    <img
                        src={product.image}
                        alt={product.title}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 uppercase text-[10px] font-bold tracking-widest">
                        No Image
                    </div>
                )}

                {/* Source Badge */}
                <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-lg backdrop-blur-md ${product.source === 'eBay' ? 'bg-blue-600/80' :
                    product.source === 'Facebook' ? 'bg-blue-500/80' :
                        product.source === 'CeX' ? 'bg-red-600/80' :
                            product.source === 'Gumtree' ? 'bg-green-600/80' :
                                product.source === 'BackMarket' ? 'bg-zinc-800/80' : 'bg-yellow-600/80'
                    }`}>
                    {product.source}
                </div>

                {/* Match Score Badge */}
                {typeof product.matchScore === 'number' && (
                    <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter border backdrop-blur-md shadow-lg ${getScoreColor(product.matchScore)}`}>
                        Match: {product.matchScore}%
                    </div>
                )}

                {arbitragePotential && (
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-lg bg-emerald-500 animate-pulse">
                        Profit
                    </div>
                )}
            </div>

            <div className="p-5 flex flex-col flex-grow">
                <h3 className="font-bold text-white/90 text-sm mb-4 line-clamp-2 min-h-[2.5rem] leading-tight group-hover:text-brand-primary transition-colors">
                    {product.title}
                </h3>

                <div className="space-y-2 mb-5">
                    <div className="flex items-center gap-2 text-white/40 text-[11px] font-medium">
                        <Tag size={12} className="shrink-0" />
                        <span className="truncate">{product.condition || 'Used'}</span>
                    </div>

                    {product.location && (
                        <div className="flex items-center gap-2 text-white/40 text-[11px] font-medium">
                            <MapPin size={12} className="shrink-0" />
                            <span className="truncate">{product.location}</span>
                        </div>
                    )}
                </div>

                <div className="mt-auto pt-4 border-t border-white/5 flex items-end justify-between">
                    <div>
                        <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mb-1">Market Price</p>
                        <span className="text-2xl font-black text-white tracking-tighter">
                            {product.currency === 'GBP' ? '£' : '$'}
                            {product.price.toLocaleString()}
                        </span>
                    </div>

                    <a
                        href={product.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-white/5 hover:bg-brand-primary rounded-2xl transition-all duration-300 text-white/80 hover:text-white shadow-lg border border-white/5 hover:border-brand-primary/50"
                    >
                        <ExternalLink size={18} />
                    </a>
                </div>
            </div>
        </div>
    );
};
