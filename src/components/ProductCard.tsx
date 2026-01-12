import React from 'react';
import { ExternalLink, Tag, MapPin, Truck, User, Clock, ShieldCheck, Box } from 'lucide-react';

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
}

interface ProductCardProps {
    product: Product;
    arbitragePotential?: boolean;
}


export const ProductCard: React.FC<ProductCardProps> = ({ product, arbitragePotential }) => {
    return (
        <div className={`glass rounded-2xl overflow-hidden glass-hover flex flex-col h-full ${arbitragePotential ? 'ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/20' : ''}`}>
            <div className="relative aspect-square overflow-hidden bg-white/5">
                {product.image ? (
                    <img
                        src={product.image}
                        alt={product.title}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                        No Image
                    </div>
                )}
                <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-lg ${product.source === 'eBay' ? 'bg-blue-600' :
                    product.source === 'Facebook' ? 'bg-blue-500' :
                        product.source === 'CeX' ? 'bg-red-600' :
                            product.source === 'Gumtree' ? 'bg-green-600' :
                                product.source === 'BackMarket' ? 'bg-zinc-800' : 'bg-yellow-600'
                    }`}>
                    {product.source}
                </div>
                {arbitragePotential && (
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-lg bg-emerald-500 animate-pulse">
                        Profit
                    </div>
                )}
            </div>

            <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-semibold text-white/90 text-sm mb-3 line-clamp-2 min-h-[2.5rem] leading-snug">
                    {product.title}
                </h3>

                <div className="space-y-1.5 mb-4">
                    <div className="flex items-center gap-2 text-white/50 text-xs">
                        <Tag size={12} className="shrink-0" />
                        <span className="truncate">{product.condition || 'Used'}</span>
                    </div>

                    {product.location && (
                        <div className="flex items-center gap-2 text-white/50 text-xs">
                            <MapPin size={12} className="shrink-0" />
                            <span className="truncate">{product.location}</span>
                        </div>
                    )}

                    {product.shipping && (
                        <div className="flex items-center gap-2 text-white/50 text-xs">
                            <Truck size={12} className="shrink-0" />
                            <span className="truncate">{product.shipping}</span>
                        </div>
                    )}

                    {product.seller && (
                        <div className="flex items-center gap-2 text-white/50 text-xs">
                            <User size={12} className="shrink-0" />
                            <span className="truncate">{product.seller}</span>
                        </div>
                    )}

                    {product.date && (
                        <div className="flex items-center gap-2 text-white/50 text-xs">
                            <Clock size={12} className="shrink-0" />
                            <span className="truncate">{product.date}</span>
                        </div>
                    )}

                    {product.warranty && (
                        <div className="flex items-center gap-2 text-brand-primary text-xs font-medium">
                            <ShieldCheck size={12} className="shrink-0" />
                            <span className="truncate">{product.warranty}</span>
                        </div>
                    )}

                    {product.stock && (
                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                            <Box size={12} className="shrink-0" />
                            <span className="truncate">{product.stock}</span>
                        </div>
                    )}
                </div>

                <div className="mt-auto pt-3 border-t border-white/5 flex items-end justify-between">
                    <div>
                        <span className="text-xl font-bold text-white tracking-tight">
                            {product.currency === 'GBP' ? '£' : '$'}
                            {product.price.toLocaleString()}
                        </span>
                    </div>

                    <a
                        href={product.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 bg-white/5 hover:bg-brand-primary rounded-xl transition-all duration-300 text-white/80 hover:text-white"
                    >
                        <ExternalLink size={16} />
                    </a>
                </div>
            </div>
        </div>
    );
};
