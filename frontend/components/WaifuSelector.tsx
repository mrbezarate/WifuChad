import React from 'react';
import { Heart } from 'lucide-react';
import { Waifu } from '../types';
import { WAIFUS } from '../constants';

interface WaifuSelectorProps {
    selectedWaifu: Waifu;
    onSelectWaifu: (waifu: Waifu) => void;
    language: 'ru' | 'en';
    unreadCounts: Record<string, number>;
}

export const WaifuSelector: React.FC<WaifuSelectorProps> = ({ selectedWaifu, onSelectWaifu, language, unreadCounts }) => {
    return (
        <div className="w-full md:w-64 bg-white/60 backdrop-blur-md border-r border-pink-100 flex flex-col h-full shadow-[4px_0_24px_rgba(244,114,182,0.1)] z-20">
            <div className="p-6 border-b border-pink-100 bg-gradient-to-b from-pink-50/50 to-transparent">
                <h2 className="text-xl font-extrabold text-kawaii-600 flex items-center gap-2">
                    <Heart className="text-kawaii-400 fill-kawaii-400 animate-pulse-slow" size={24} />
                    Waifu Select
                </h2>
                <p className="text-xs text-kawaii-400 mt-1 font-semibold">
                    {language === 'ru' ? 'Выбери собеседницу!' : 'Choose your companion!'}
                </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {WAIFUS.map((waifu) => {
                    const isSelected = selectedWaifu.id === waifu.id;
                    const unread = unreadCounts[waifu.id] || 0;
                    
                    return (
                        <button
                            key={waifu.id}
                            onClick={() => onSelectWaifu(waifu)}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 group relative
                                ${isSelected 
                                    ? `${waifu.themeColor} text-white shadow-lg shadow-${waifu.themeColor.replace('bg-', '')}/30 scale-[1.02]` 
                                    : 'hover:bg-white hover:shadow-md text-slate-600'
                                }`}
                        >
                            <div className={`relative w-12 h-12 rounded-full overflow-visible flex-shrink-0`}>
                                <div className={`w-full h-full rounded-full overflow-hidden border-2 transition-colors
                                    ${isSelected ? 'border-white/50 bg-white/20' : 'border-transparent bg-slate-100 group-hover:bg-pink-50'}`}>
                                    <img 
                                        src={waifu.avatarUrl} 
                                        alt={waifu.name} 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.currentTarget.src = `https://api.dicebear.com/8.x/initials/svg?seed=${waifu.name}&backgroundColor=f472b6`;
                                        }}
                                    />
                                </div>
                                {/* Unread Badge */}
                                {unread > 0 && !isSelected && (
                                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                                        {unread > 9 ? '9+' : unread}
                                    </div>
                                )}
                            </div>
                            <div className="text-left flex-1 overflow-hidden">
                                <div className={`font-bold text-sm truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                                    {waifu.name}
                                </div>
                                <div className={`text-xs font-semibold truncate ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                                    {waifu.anime}
                                </div>
                            </div>
                            {isSelected && (
                                <Heart size={16} className="fill-white text-white animate-float flex-shrink-0" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
