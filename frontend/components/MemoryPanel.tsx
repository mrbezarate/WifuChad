import React from 'react';
import { Brain, X, Database } from 'lucide-react';
import { Waifu } from '../types';

interface MemoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    waifu: Waifu;
    memory: string[];
    language: 'ru' | 'en';
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ isOpen, onClose, waifu, memory, language }) => {
    if (!isOpen) return null;

    return (
        <div className="absolute inset-y-0 right-0 w-full sm:w-80 bg-white/95 backdrop-blur-xl border-l border-pink-100 shadow-2xl z-40 flex flex-col transform transition-transform duration-300">
            <div className={`p-4 border-b border-pink-100 flex items-center justify-between text-white ${waifu.themeColor}`}>
                <div className="flex items-center gap-2 font-bold">
                    <Brain size={20} />
                    <span>{language === 'ru' ? 'Буфер Памяти' : 'Memory Buffer'}</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto">
                <p className="text-xs text-slate-500 mb-4 font-semibold flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <Database size={16} className="flex-shrink-0 text-kawaii-400" />
                    {language === 'ru' 
                        ? `Здесь хранится информация, которую ${waifu.name} узнала о вас. Она сохраняется даже при сбросе чата.` 
                        : `This stores information ${waifu.name} has learned about you. It persists even if the chat is reset.`}
                </p>

                {memory.length === 0 ? (
                    <div className="text-center text-slate-400 mt-10 text-sm font-medium">
                        {language === 'ru' ? 'Пока ничего не известно...' : 'Nothing known yet...'}
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {memory.map((fact, index) => (
                            <li key={index} className="bg-pink-50/50 border border-pink-100 p-3 rounded-xl text-sm text-slate-700 font-medium shadow-sm flex items-start gap-2">
                                <span className="text-kawaii-400 mt-0.5">•</span>
                                {fact}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};
