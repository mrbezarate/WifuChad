import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, Menu, Brain, Users, Heart } from 'lucide-react';
import { Message, Waifu, RelationshipMode } from './types';
import { WAIFUS } from './constants';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { WaifuSelector } from './components/WaifuSelector';
import { MemoryPanel } from './components/MemoryPanel';
import { streamMessage, resetChat, extractMemory } from './services/geminiService';

export default function App() {
    const [language, setLanguage] = useState<'ru' | 'en'>('ru');
    const [mode, setMode] = useState<RelationshipMode>('strangers');
    const [activeWaifu, setActiveWaifu] = useState<Waifu>(WAIFUS[0]);
    
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMemoryOpen, setIsMemoryOpen] = useState(false);
    
    // State keyed by sessionId: `${waifu.id}-${mode}`
    const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
    const [nudgeCounts, setNudgeCounts] = useState<Record<string, number>>({});
    const [chatHistories, setChatHistories] = useState<Record<string, Message[]>>({});
    const [memories, setMemories] = useState<Record<string, string[]>>({});
    
    // Unread counts are still keyed by waifu.id for the sidebar
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    
    const activeWaifuRef = useRef(activeWaifu);
    const modeRef = useRef(mode);

    useEffect(() => {
        activeWaifuRef.current = activeWaifu;
    }, [activeWaifu]);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    const activeSessionId = `${activeWaifu.id}-${mode}`;
    const currentMessages = chatHistories[activeSessionId] || [];
    const currentMemory = memories[activeSessionId] || [];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [currentMessages]);

    const handleSelectWaifu = (waifu: Waifu) => {
        if (waifu.id === activeWaifu.id) return;
        setActiveWaifu(waifu);
        setIsSidebarOpen(false);
        setUnreadCounts(prev => ({ ...prev, [waifu.id]: 0 }));
    };

    const handleModeToggle = () => {
        setMode(prev => prev === 'lovers' ? 'strangers' : 'lovers');
        // We no longer reset the chat here! The state will naturally switch to the other session's history.
    };

    const triggerNudge = useCallback(async (waifu: Waifu, nudgeMode: RelationshipMode, currentNudgeCount: number, lang: 'ru' | 'en', memory: string[], currentHistory: Message[]) => {
        const sId = `${waifu.id}-${nudgeMode}`;
        const botMessageId = Date.now().toString();
        const initialBotMessage: Message = {
            id: botMessageId,
            role: 'model',
            content: '',
            isStreaming: true,
        };

        setChatHistories(prev => ({
            ...prev,
            [sId]: [...(prev[sId] || []), initialBotMessage]
        }));
        setNudgeCounts(prev => ({ ...prev, [sId]: currentNudgeCount + 1 }));
        setIsTyping(prev => ({ ...prev, [sId]: true }));

        const isActiveSession = activeWaifuRef.current.id === waifu.id && modeRef.current === nudgeMode;
        if (!isActiveSession) {
            setUnreadCounts(prev => ({ ...prev, [waifu.id]: (prev[waifu.id] || 0) + 1 }));
        }

        try {
            let nudgePrompt = "";
            if (lang === 'ru') {
                if (currentNudgeCount === 0) nudgePrompt = "(Система: Пользователь молчит. Напиши 1 короткое сообщение, проверь тут ли он.)";
                else if (currentNudgeCount === 1) nudgePrompt = "(Система: Пользователь игнорирует. Напиши 1 короткое сообщение с реакцией на игнор в твоем стиле.)";
                else nudgePrompt = "(Система: Пользователь так и не ответил. Напиши последнее короткое сообщение, что больше не будешь навязываться, и попрощайся.)";
            } else {
                if (currentNudgeCount === 0) nudgePrompt = "(System: User is silent. Send 1 short text checking if they are there.)";
                else if (currentNudgeCount === 1) nudgePrompt = "(System: User is ignoring you. Send 1 short text reacting to being ignored in your style.)";
                else nudgePrompt = "(System: User hasn't replied. Send a final short text saying you won't bother them anymore.)";
            }

            const stream = streamMessage(waifu, nudgePrompt, nudgeMode, lang, memory, currentHistory);
            
            for await (const chunk of stream) {
                setChatHistories(prev => {
                    const history = prev[sId] || [];
                    return {
                        ...prev,
                        [sId]: history.map(msg => 
                            msg.id === botMessageId 
                                ? { ...msg, content: msg.content + chunk }
                                : msg
                        )
                    };
                });
            }
        } catch (error: any) {
            setChatHistories(prev => {
                const history = prev[sId] || [];
                return {
                    ...prev,
                    [sId]: history.map(msg => 
                        msg.id === botMessageId 
                            ? { ...msg, content: "...", isError: true }
                            : msg
                    )
                };
            });
        } finally {
            setIsTyping(prev => ({ ...prev, [sId]: false }));
            setChatHistories(prev => {
                const history = prev[sId] || [];
                return {
                    ...prev,
                    [sId]: history.map(msg => 
                        msg.id === botMessageId 
                            ? { ...msg, isStreaming: false }
                            : msg
                    )
                };
            });
        }
    }, []);

    // Background Inactivity Timers Effect
    useEffect(() => {
        const timers = timersRef.current;

        WAIFUS.forEach(waifu => {
            (['lovers', 'strangers'] as RelationshipMode[]).forEach(m => {
                const sId = `${waifu.id}-${m}`;
                const history = chatHistories[sId] || [];
                const lastMessage = history[history.length - 1];
                const typing = isTyping[sId];
                const nudgeCount = nudgeCounts[sId] || 0;
                const memory = memories[sId] || [];

                if (!typing && lastMessage && lastMessage.role === 'model' && !lastMessage.isError && nudgeCount < 3) {
                    if (!timers[sId]) {
                        let delay = 60000;
                        if (nudgeCount === 0) delay = Math.floor(Math.random() * 60000) + 60000; // 1-2 min
                        else if (nudgeCount === 1) delay = Math.floor(Math.random() * 120000) + 180000; // 3-5 min
                        else if (nudgeCount === 2) delay = Math.floor(Math.random() * 300000) + 300000; // 5-10 min

                        timers[sId] = setTimeout(() => {
                            triggerNudge(waifu, m, nudgeCount, language, memory, history);
                            delete timers[sId];
                        }, delay);
                    }
                } else {
                    if (timers[sId]) {
                        clearTimeout(timers[sId]);
                        delete timers[sId];
                    }
                }
            });
        });
    }, [chatHistories, isTyping, nudgeCounts, language, memories, triggerNudge]);

    useEffect(() => {
        return () => {
            Object.values(timersRef.current).forEach(clearTimeout);
        };
    }, []);

    const handleSendMessage = useCallback(async (content: string) => {
        const sId = `${activeWaifu.id}-${mode}`;
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content,
        };

        const botMessageId = (Date.now() + 1).toString();
        const initialBotMessage: Message = {
            id: botMessageId,
            role: 'model',
            content: '',
            isStreaming: true,
        };

        setNudgeCounts(prev => ({ ...prev, [sId]: 0 }));

        const currentHistory = chatHistories[sId] || [];
        const updatedHistory = [...currentHistory, userMessage, initialBotMessage];
        
        setChatHistories(prev => ({ ...prev, [sId]: updatedHistory }));
        setIsTyping(prev => ({ ...prev, [sId]: true }));

        try {
            const stream = streamMessage(activeWaifu, content, mode, language, memories[sId] || [], currentHistory);
            
            for await (const chunk of stream) {
                setChatHistories(prev => {
                    const history = prev[sId] || [];
                    return {
                        ...prev,
                        [sId]: history.map(msg => 
                            msg.id === botMessageId 
                                ? { ...msg, content: msg.content + chunk }
                                : msg
                        )
                    };
                });
            }

            // Memory Extraction Logic: Run every 4 user messages
            const userMsgCount = updatedHistory.filter(m => m.role === 'user').length;
            if (userMsgCount > 0 && userMsgCount % 4 === 0) {
                extractMemory(updatedHistory.slice(-8), memories[sId] || [], language).then(newMemories => {
                    setMemories(prev => ({ ...prev, [sId]: newMemories }));
                });
            }

        } catch (error: any) {
            setChatHistories(prev => {
                const history = prev[sId] || [];
                return {
                    ...prev,
                    [sId]: history.map(msg => 
                        msg.id === botMessageId 
                            ? { ...msg, content: error.message || "An error occurred.", isError: true }
                            : msg
                    )
                };
            });
        } finally {
            setIsTyping(prev => ({ ...prev, [sId]: false }));
            setChatHistories(prev => {
                const history = prev[sId] || [];
                return {
                    ...prev,
                    [sId]: history.map(msg => 
                        msg.id === botMessageId 
                            ? { ...msg, isStreaming: false }
                            : msg
                    )
                };
            });
        }
    }, [activeWaifu, language, mode, chatHistories, memories]);

    const handleReset = () => {
        resetChat(activeWaifu, mode, language, currentMemory);
        setChatHistories(prev => ({ ...prev, [activeSessionId]: [] }));
        setNudgeCounts(prev => ({ ...prev, [activeSessionId]: 0 }));
        setUnreadCounts(prev => ({ ...prev, [activeWaifu.id]: 0 }));
    };

    return (
        <div className="flex h-full w-full bg-anime-pattern overflow-hidden relative">
            
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`fixed md:static inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out z-30 h-full`}>
                <WaifuSelector 
                    selectedWaifu={activeWaifu} 
                    onSelectWaifu={handleSelectWaifu} 
                    language={language} 
                    unreadCounts={unreadCounts}
                />
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full relative max-w-5xl mx-auto w-full shadow-2xl bg-white/40 backdrop-blur-sm">
                
                {/* Header */}
                <header className={`glass-panel p-3 sm:p-4 flex items-center justify-between flex-shrink-0 z-10 border-b border-pink-100`}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button 
                            className="md:hidden p-2 text-kawaii-500 hover:bg-pink-50 rounded-xl transition-colors"
                            onClick={() => setIsSidebarOpen(true)}
                        >
                            <Menu size={24} />
                        </button>
                        <div className={`w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0 ${activeWaifu.themeColor}`}>
                            <img 
                                src={activeWaifu.avatarUrl} 
                                alt={activeWaifu.name} 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.src = `https://api.dicebear.com/8.x/initials/svg?seed=${activeWaifu.name}&backgroundColor=f472b6`;
                                }}
                            />
                        </div>
                        <div className="overflow-hidden hidden sm:block">
                            <h1 className="font-extrabold text-lg leading-tight text-slate-800 flex items-center gap-1 truncate">
                                {activeWaifu.name}
                                <Sparkles size={14} className="text-kawaii-400 flex-shrink-0" />
                            </h1>
                            <p className="text-kawaii-500 text-xs font-bold truncate">{activeWaifu.anime}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* Mode Toggle */}
                        <button 
                            onClick={handleModeToggle}
                            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-sm border
                                ${mode === 'lovers' 
                                    ? 'bg-pink-500 text-white border-pink-600' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            title={language === 'ru' ? 'Режим Отношений' : 'Relationship Mode'}
                        >
                            {mode === 'lovers' ? <Heart size={16} className="fill-white" /> : <Users size={16} />}
                            <span className="hidden sm:inline">
                                {mode === 'lovers' 
                                    ? (language === 'ru' ? 'Любовь' : 'Lovers') 
                                    : (language === 'ru' ? 'Незнакомцы' : 'Strangers')}
                            </span>
                        </button>

                        <button 
                            onClick={() => setIsMemoryOpen(!isMemoryOpen)}
                            className={`p-2 sm:p-2.5 rounded-xl transition-colors border shadow-sm
                                ${isMemoryOpen ? 'bg-kawaii-100 text-kawaii-600 border-kawaii-200' : 'bg-white text-kawaii-400 hover:text-kawaii-600 border-pink-100 hover:bg-pink-50'}`}
                            title={language === 'ru' ? 'Память' : 'Memory'}
                        >
                            <Brain size={20} />
                        </button>

                        <button 
                            onClick={() => setLanguage(l => l === 'ru' ? 'en' : 'ru')}
                            className="px-2 sm:px-3 py-1.5 bg-white hover:bg-slate-50 rounded-xl text-kawaii-600 font-bold text-xs sm:text-sm transition-colors border border-pink-100 shadow-sm"
                            title="Toggle Language"
                        >
                            {language === 'ru' ? 'RU' : 'EN'}
                        </button>
                        
                        <button 
                            onClick={handleReset}
                            className="p-2 sm:p-2.5 bg-white hover:bg-pink-50 rounded-xl transition-colors text-kawaii-400 hover:text-kawaii-600 flex-shrink-0 border border-pink-100 shadow-sm"
                            title="Restart conversation"
                            aria-label="Reset chat"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </header>

                {/* Chat Area */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col relative">
                    {currentMessages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-80">
                            <div className={`w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-lg mb-4 ${activeWaifu.themeColor}`}>
                                <img src={activeWaifu.avatarUrl} alt={activeWaifu.name} className="w-full h-full object-cover" />
                            </div>
                            <h3 className="text-2xl font-extrabold text-slate-700 mb-2">
                                {language === 'ru' ? `Напишите ${activeWaifu.name}, чтобы начать!` : `Say hi to ${activeWaifu.name}!`}
                            </h3>
                            <p className="text-sm font-semibold text-slate-500 max-w-xs mb-4">
                                {language === 'ru' 
                                    ? 'Она ждет вашего сообщения. Напишите что-нибудь, чтобы начать общение.' 
                                    : 'She is waiting for your message. Type something to start chatting.'}
                            </p>
                            <div className="inline-flex items-center gap-2 bg-white/80 px-4 py-2 rounded-full text-xs font-bold text-slate-500 border border-slate-200 shadow-sm">
                                {mode === 'lovers' ? <Heart size={14} className="text-pink-500 fill-pink-500" /> : <Users size={14} className="text-slate-400" />}
                                {mode === 'lovers' 
                                    ? (language === 'ru' ? 'Режим: Вы уже пара' : 'Mode: You are already lovers')
                                    : (language === 'ru' ? 'Режим: Вы только познакомились' : 'Mode: You just met')}
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto w-full">
                            {currentMessages.map((msg) => (
                                <ChatMessage key={msg.id} message={msg} activeWaifu={activeWaifu} language={language} />
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </main>

                {/* Input Area */}
                <ChatInput 
                    onSendMessage={handleSendMessage} 
                    disabled={isTyping[activeSessionId] || false}
                    activeWaifu={activeWaifu}
                    language={language}
                />

                {/* Memory Panel Overlay */}
                <MemoryPanel 
                    isOpen={isMemoryOpen} 
                    onClose={() => setIsMemoryOpen(false)} 
                    waifu={activeWaifu} 
                    memory={currentMemory} 
                    language={language} 
                />
            </div>
        </div>
    );
}
