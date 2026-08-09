import React from 'react';
import { User, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Message, Waifu } from '../types';

interface ChatMessageProps {
    message: Message;
    activeWaifu: Waifu;
    language: 'ru' | 'en';
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, activeWaifu, language }) => {
    if (message.isSystem) {
        return (
            <div className="flex w-full justify-center mb-6">
                <div className="bg-slate-100/80 px-4 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-400 shadow-sm">
                    {message.content}
                </div>
            </div>
        );
    }

    // Handle the "left on read" mechanic
    if (message.role === 'model' && message.content.trim() === '*read*') {
        return (
            <div className="flex w-full justify-end mb-2 pr-14 -mt-4">
                <span className="text-[10px] font-bold text-slate-400 italic">
                    {language === 'ru' ? 'Прочитано' : 'Read'}
                </span>
            </div>
        );
    }

    const isUser = message.role === 'user';

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6 group`}>
            <div className={`flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>
                
                {/* Avatar */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shadow-sm border-2
                    ${isUser ? 'bg-kawaii-400 text-white border-kawaii-200' : `bg-white ${activeWaifu.themeColor.replace('bg-', 'border-')}/30`}`}>
                    {isUser ? (
                        <User size={20} />
                    ) : (
                        <img 
                            src={activeWaifu.avatarUrl} 
                            alt={activeWaifu.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.src = `https://api.dicebear.com/8.x/initials/svg?seed=${activeWaifu.name}&backgroundColor=f472b6`;
                            }}
                        />
                    )}
                </div>

                {/* Message Bubble */}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <span className="text-[11px] font-bold text-slate-400 mb-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isUser ? (language === 'ru' ? 'Вы' : 'You') : activeWaifu.name}
                    </span>
                    <div className={`px-5 py-3.5 shadow-sm relative
                        ${isUser 
                            ? 'bg-gradient-to-br from-kawaii-400 to-kawaii-500 text-white rounded-2xl rounded-br-sm' 
                            : message.isError 
                                ? 'bg-red-50 text-red-800 border border-red-200 rounded-2xl rounded-bl-sm'
                                : `bg-white text-slate-700 border border-pink-100 rounded-2xl rounded-bl-sm shadow-[0_2px_10px_rgba(0,0,0,0.02)]`
                        }`}
                    >
                        {message.isError ? (
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="text-red-500" />
                                <span className="font-semibold">{message.content}</span>
                            </div>
                        ) : (
                            <div className={`prose prose-sm max-w-none font-medium leading-relaxed ${isUser ? 'text-white prose-invert' : 'text-slate-700'}`}>
                                {message.content ? (
                                    <ReactMarkdown>{message.content}</ReactMarkdown>
                                ) : (
                                    <span className="flex gap-1.5 items-center h-5 px-2">
                                        <span className={`w-2 h-2 rounded-full animate-bounce ${activeWaifu.themeColor.replace('bg-', 'bg-')}`} style={{ animationDelay: '0ms' }}></span>
                                        <span className={`w-2 h-2 rounded-full animate-bounce ${activeWaifu.themeColor.replace('bg-', 'bg-')}`} style={{ animationDelay: '150ms' }}></span>
                                        <span className={`w-2 h-2 rounded-full animate-bounce ${activeWaifu.themeColor.replace('bg-', 'bg-')}`} style={{ animationDelay: '300ms' }}></span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
