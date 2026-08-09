import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, Menu, Brain, Users, Heart, Sun, Volume2, VolumeX } from 'lucide-react';
import { Message, Waifu, RelationshipMode } from './types';
import { WAIFUS } from './constants';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { WaifuSelector } from './components/WaifuSelector';
import { MemoryPanel } from './components/MemoryPanel';
import { streamMessage, resetChat, extractMemory, checkConversationEnd, generateAudio } from './services/geminiService';
import { playPcmBase64, stopAllAudio, setMuted, initAudio } from './services/audioService';

type ConvStatus = 'active' | 'ended' | 'morning_sent';

export default function App() {
    const [language, setLanguage] = useState<'ru' | 'en'>('ru');
    const [mode, setMode] = useState<RelationshipMode>('strangers');
    const [activeWaifu, setActiveWaifu] = useState<Waifu>(WAIFUS[0]);
    
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMemoryOpen, setIsMemoryOpen] = useState(false);
    const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
    
    // State keyed by sessionId: `${waifu.id}-${mode}`
    const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [nudgeCounts, setNudgeCounts] = useState<Record<string, number>>({});
    const [chatHistories, setChatHistories] = useState<Record<string, Message[]>>({});
    const [memories, setMemories] = useState<Record<string, string[]>>({});
    const [affinityScores, setAffinityScores] = useState<Record<string, number>>({});
    const [convStatus, setConvStatus] = useState<Record<string, ConvStatus>>({});
    
    // Unread counts are still keyed by waifu.id for the sidebar
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const morningTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    
    const activeWaifuRef = useRef(activeWaifu);
    const modeRef = useRef(mode);
    const languageRef = useRef(language);
    const chatHistoriesRef = useRef(chatHistories);
    const memoriesRef = useRef(memories);

    useEffect(() => { activeWaifuRef.current = activeWaifu; }, [activeWaifu]);
    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { languageRef.current = language; }, [language]);
    useEffect(() => { chatHistoriesRef.current = chatHistories; }, [chatHistories]);
    useEffect(() => { memoriesRef.current = memories; }, [memories]);

    const activeSessionId = `${activeWaifu.id}-${mode}`;
    const currentMessages = chatHistories[activeSessionId] || [];
    const currentMemory = memories[activeSessionId] || [];
    const currentAffinity = affinityScores[activeSessionId] ?? (mode === 'lovers' ? 100 : 0);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [currentMessages]);

    const handleSelectWaifu = (waifu: Waifu) => {
        if (waifu.id === activeWaifu.id) return;
        stopAllAudio();
        setActiveWaifu(waifu);
        setIsSidebarOpen(false);
        setUnreadCounts(prev => ({ ...prev, [waifu.id]: 0 }));
    };

    const handleModeToggle = () => {
        stopAllAudio();
        setMode(prev => prev === 'lovers' ? 'strangers' : 'lovers');
    };

    const handleVoiceToggle = () => {
        const newState = !isVoiceEnabled;
        setIsVoiceEnabled(newState);
        setMuted(!newState);
        if (newState) {
            initAudio();
        }
    };

    const triggerMorningGreeting = useCallback(async (sId: string) => {
        const [waifuId, sessionMode] = sId.split('-');
        const waifu = WAIFUS.find(w => w.id === waifuId)!;
        const currentMode = sessionMode as RelationshipMode;
        const lang = languageRef.current;
        
        // Generate random time between 6:00 and 10:00
        const hour = Math.floor(Math.random() * 5) + 6;
        const minute = Math.floor(Math.random() * 60);
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        const systemMsgId = Date.now().toString();
        const systemMessage: Message = {
            id: systemMsgId,
            role: 'model',
            content: lang === 'ru' 
                ? `Наступил следующий день. Время: ${timeString}`
                : `The next day has started. Time: ${timeString} AM`,
            isSystem: true
        };

        setNudgeCounts(prev => ({ ...prev, [sId]: 0 }));
        setChatHistories(prev => ({
            ...prev,
            [sId]: [...(prev[sId] || []), systemMessage]
        }));
        
        // Small delay before she starts typing
        setTimeout(async () => {
            const botMessageId = (Date.now() + 1).toString();
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
            setIsTyping(prev => ({ ...prev, [sId]: true }));

            const isActiveSession = activeWaifuRef.current.id === waifu.id && modeRef.current === currentMode;
            if (!isActiveSession) {
                setUnreadCounts(prev => ({ ...prev, [waifu.id]: (prev[waifu.id] || 0) + 1 }));
            }

            try {
                const prompt = lang === 'ru' 
                    ? `(Система: Наступил новый день, сейчас ${timeString} утра. Поздоровайся с пользователем с добрым утром, учитывая ваши текущие отношения и прошлый разговор. Напиши первым.)`
                    : `(System: A new day has started, it is now ${timeString} AM. Greet the user good morning based on your current relationship and past conversation. You are initiating the conversation.)`;
                
                const affinity = affinityScores[sId] ?? (currentMode === 'lovers' ? 100 : 0);
                const stream = streamMessage(waifu, prompt, currentMode, lang, memoriesRef.current[sId] || [], chatHistoriesRef.current[sId] || [], affinity);
                
                let fullResponse = "";
                for await (const chunk of stream) {
                    fullResponse += chunk;
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
                if (isVoiceEnabled && fullResponse.trim() !== '*read*') {
                    generateAudio(fullResponse, waifu.voiceName).then(base64 => {
                        if (base64) playPcmBase64(base64);
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
                setConvStatus(prev => ({ ...prev, [sId]: 'morning_sent' }));
            }
        }, 1500);
    }, [affinityScores, isVoiceEnabled]);

    // Handle automatic morning greeting when conversation ends
    useEffect(() => {
        Object.entries(convStatus).forEach(([sId, status]) => {
            if (status === 'ended') {
                if (!morningTimersRef.current[sId]) {
                    // Simulate night passing (15 seconds for demonstration)
                    morningTimersRef.current[sId] = setTimeout(() => {
                        triggerMorningGreeting(sId);
                        delete morningTimersRef.current[sId];
                    }, 15000);
                }
            } else {
                if (morningTimersRef.current[sId]) {
                    clearTimeout(morningTimersRef.current[sId]);
                    delete morningTimersRef.current[sId];
                }
            }
        });
    }, [convStatus, triggerMorningGreeting]);

    const triggerNudge = useCallback(async (waifu: Waifu, nudgeMode: RelationshipMode, currentNudgeCount: number, lang: 'ru' | 'en', memory: string[], currentHistory: Message[]) => {
        const sId = `${waifu.id}-${nudgeMode}`;
        
        // Decrease affinity if ignored (only in strangers mode)
        if (nudgeMode === 'strangers') {
            setAffinityScores(prev => {
                const current = prev[sId] ?? 0;
                const penalty = currentNudgeCount === 0 ? 2 : currentNudgeCount === 1 ? 5 : 10;
                return { ...prev, [sId]: Math.max(-100, current - penalty) };
            });
        }

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
                else if (currentNudgeCount === 1) nudgePrompt = "(Система: Пользователь игнорирует. Напиши 1 короткое сообщение с реакцией на игнор в твоем стиле. Ты начинаешь злиться или обижаться.)";
                else nudgePrompt = "(Система: Пользователь так и не ответил. Напиши последнее короткое сообщение, что больше не будешь навязываться, и попрощайся.)";
            } else {
                if (currentNudgeCount === 0) nudgePrompt = "(System: User is silent. Send 1 short text checking if they are there.)";
                else if (currentNudgeCount === 1) nudgePrompt = "(System: User is ignoring you. Send 1 short text reacting to being ignored in your style. You are getting annoyed or hurt.)";
                else nudgePrompt = "(System: User hasn't replied. Send a final short text saying you won't bother them anymore.)";
            }

            const affinity = affinityScores[sId] ?? (nudgeMode === 'lovers' ? 100 : 0);
            const stream = streamMessage(waifu, nudgePrompt, nudgeMode, lang, memory, currentHistory, affinity);
            
            let fullResponse = "";
            for await (const chunk of stream) {
                fullResponse += chunk;
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
            if (isVoiceEnabled && fullResponse.trim() !== '*read*') {
                generateAudio(fullResponse, waifu.voiceName).then(base64 => {
                    if (base64) playPcmBase64(base64);
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
    }, [affinityScores, isVoiceEnabled]);

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
                const isUserTyping = (inputValues[sId] || '').trim().length > 0;
                const status = convStatus[sId] || 'active';
                const affinity = affinityScores[sId] ?? (m === 'lovers' ? 100 : 0);

                // Only start timer if last message is from model, bot is not typing, user is NOT typing, under nudge limit, conversation is ACTIVE, and not blocked
                if (!typing && lastMessage && lastMessage.role === 'model' && !lastMessage.isError && nudgeCount < 3 && !isUserTyping && status === 'active' && affinity > -80) {
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
    }, [chatHistories, isTyping, nudgeCounts, language, memories, inputValues, convStatus, affinityScores, triggerNudge]);

    useEffect(() => {
        return () => {
            Object.values(timersRef.current).forEach(clearTimeout);
            Object.values(morningTimersRef.current).forEach(clearTimeout);
        };
    }, []);

    const handleSendMessage = useCallback(async (content: string) => {
        stopAllAudio();
        initAudio(); // Ensure audio context is ready on user interaction
        
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
        setConvStatus(prev => ({ ...prev, [sId]: 'active' }));

        const currentHistory = chatHistories[sId] || [];
        const updatedHistory = [...currentHistory, userMessage, initialBotMessage];
        
        setChatHistories(prev => ({ ...prev, [sId]: updatedHistory }));
        setIsTyping(prev => ({ ...prev, [sId]: true }));

        try {
            const currentAffinity = affinityScores[sId] ?? (mode === 'lovers' ? 100 : 0);
            const stream = streamMessage(activeWaifu, content, mode, language, memories[sId] || [], currentHistory, currentAffinity);
            
            let fullResponse = "";
            for await (const chunk of stream) {
                fullResponse += chunk;
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
            if (isVoiceEnabled && fullResponse.trim() !== '*read*') {
                generateAudio(fullResponse, activeWaifu.voiceName).then(base64 => {
                    if (base64) playPcmBase64(base64);
                });
            }

            // Check if conversation ended naturally
            // Cost Optimization: Regex Guard to avoid unnecessary AI calls
            const finalHistory = chatHistoriesRef.current[sId] || [];
            const userTextLower = content.toLowerCase();
            const exitRegex = /(пока|спокойной ночи|до завтра|bye|good night|goodbye|see you|cya|отбой|спать)/i;
            
            if (exitRegex.test(userTextLower)) {
                checkConversationEnd(finalHistory).then(isEnded => {
                    if (isEnded) {
                        setConvStatus(prev => ({ ...prev, [sId]: 'ended' }));
                    }
                });
            }

            // Memory Extraction Logic: Run every 6 user messages (Cost Optimization)
            const userMsgCount = updatedHistory.filter(m => m.role === 'user').length;
            if (userMsgCount > 0 && userMsgCount % 6 === 0) {
                extractMemory(updatedHistory.slice(-6), memories[sId] || [], language).then(result => {
                    setMemories(prev => ({ ...prev, [sId]: result.facts }));
                    if (result.affinityChange !== 0 && mode === 'strangers') {
                        setAffinityScores(prev => {
                            const current = prev[sId] ?? 0;
                            return { ...prev, [sId]: Math.min(100, Math.max(-100, current + result.affinityChange)) };
                        });
                    }
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
    }, [activeWaifu, language, mode, chatHistories, memories, affinityScores, isVoiceEnabled]);

    const handleReset = () => {
        stopAllAudio();
        resetChat(activeWaifu, mode, language, currentMemory, mode === 'lovers' ? 100 : 0);
        setChatHistories(prev => ({ ...prev, [activeSessionId]: [] }));
        setNudgeCounts(prev => ({ ...prev, [activeSessionId]: 0 }));
        setUnreadCounts(prev => ({ ...prev, [activeWaifu.id]: 0 }));
        setAffinityScores(prev => ({ ...prev, [activeSessionId]: mode === 'lovers' ? 100 : 0 }));
        setConvStatus(prev => ({ ...prev, [activeSessionId]: 'active' }));
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
                            <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-kawaii-500 text-xs font-bold truncate">{activeWaifu.anime}</p>
                                <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${currentAffinity < 0 ? 'text-red-500 bg-red-50 border-red-100' : 'text-pink-500 bg-pink-50 border-pink-100'}`}>
                                    <Heart size={10} className={currentAffinity > 50 ? "fill-pink-500" : currentAffinity < 0 ? "fill-red-500" : ""} /> 
                                    {currentAffinity}%
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* Voice Toggle */}
                        <button 
                            onClick={handleVoiceToggle}
                            className={`p-2 sm:p-2.5 rounded-xl transition-colors border shadow-sm
                                ${isVoiceEnabled ? 'bg-kawaii-100 text-kawaii-600 border-kawaii-200' : 'bg-white text-slate-400 hover:text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            title={language === 'ru' ? 'Озвучка' : 'Voice'}
                        >
                            {isVoiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                        </button>

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
                    {currentAffinity <= -80 ? (
                        <div className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center rounded-t-3xl sm:rounded-none">
                            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-red-500 mb-6 grayscale opacity-50">
                                <img src={activeWaifu.avatarUrl} alt={activeWaifu.name} className="w-full h-full object-cover" />
                            </div>
                            <h2 className="text-3xl font-black text-red-500 mb-2 tracking-widest">
                                {language === 'ru' ? 'ВЫ ЗАБЛОКИРОВАНЫ' : 'YOU ARE BLOCKED'}
                            </h2>
                            <p className="text-slate-300 font-medium mb-8 max-w-md">
                                {language === 'ru' 
                                    ? `${activeWaifu.name} добавила вас в черный список из-за вашего поведения. История чата удалена.` 
                                    : `${activeWaifu.name} has blocked you due to your behavior. Chat history deleted.`}
                            </p>
                            <button 
                                onClick={handleReset}
                                className="px-8 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:scale-105 flex items-center gap-2"
                            >
                                <RefreshCw size={20} />
                                {language === 'ru' ? 'Начать заново' : 'Restart'}
                            </button>
                        </div>
                    ) : currentMessages.length === 0 ? (
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
                {currentAffinity > -80 && (
                    <ChatInput 
                        value={inputValues[activeSessionId] || ''}
                        onChange={(val) => setInputValues(prev => ({ ...prev, [activeSessionId]: val }))}
                        onSendMessage={handleSendMessage} 
                        disabled={isTyping[activeSessionId] || false}
                        activeWaifu={activeWaifu}
                        language={language}
                    />
                )}

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
