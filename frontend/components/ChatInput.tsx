import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { Waifu } from '../types';

interface ChatInputProps {
    onSendMessage: (message: string) => void;
    disabled: boolean;
    activeWaifu: Waifu;
    language: 'ru' | 'en';
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, disabled, activeWaifu, language }) => {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    const handleSend = () => {
        const trimmed = input.trim();
        if (trimmed && !disabled) {
            onSendMessage(trimmed);
            setInput('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="bg-white/80 backdrop-blur-md border-t border-pink-100 p-4">
            <div className="max-w-4xl mx-auto relative flex items-end gap-3 bg-white rounded-3xl border-2 border-pink-100 p-2 focus-within:border-kawaii-300 focus-within:shadow-[0_0_15px_rgba(244,114,182,0.2)] transition-all shadow-sm">
                <div className="pl-3 pb-3 text-kawaii-300">
                    <Sparkles size={20} />
                </div>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={language === 'ru' ? `Написать ${activeWaifu.name}...` : `Say something to ${activeWaifu.name}...`}
                    disabled={disabled}
                    className="w-full max-h-[120px] bg-transparent border-none focus:ring-0 resize-none py-2.5 px-1 text-slate-700 font-medium placeholder-slate-300 disabled:opacity-50"
                    rows={1}
                />
                <button
                    onClick={handleSend}
                    disabled={disabled || !input.trim()}
                    className={`p-3.5 rounded-2xl flex-shrink-0 transition-all duration-300 shadow-sm
                        ${input.trim() && !disabled 
                            ? `${activeWaifu.themeColor} text-white hover:scale-105 hover:shadow-md` 
                            : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    aria-label="Send message"
                >
                    {disabled ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-0.5" />}
                </button>
            </div>
        </div>
    );
};
