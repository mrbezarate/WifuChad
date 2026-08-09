import { GoogleGenAI, Chat, Type, Modality } from '@google/genai';
import { Waifu, RelationshipMode, Message } from '../types';
import { DoorkeeperFilter, paceMemoryContext } from './memoryOptimizer';

// Initialize the SDK. API_KEY must be provided in the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY, vertexai: true });

// Global instance of the memory doorkeeper to filter out noise
const memoryDoorkeeper = new DoorkeeperFilter(100);

// Store a separate chat session for each waifu ID AND mode
const chatSessions: Record<string, Chat> = {};
const sessionConfigs: Record<string, string> = {}; // Tracks the config string to know when to re-init

const getSessionId = (waifuId: string, mode: RelationshipMode) => `${waifuId}-${mode}`;

export const buildSystemInstruction = (waifu: Waifu, mode: RelationshipMode, language: 'ru' | 'en', memory: string[], affinity: number) => {
    let instruction = waifu.basePersona;
    instruction += "\n\n" + (mode === 'lovers' ? waifu.loversModifier : waifu.strangersModifier);
    
    if (mode === 'lovers') {
        instruction += "\n\n[IMPORTANT ROMANCE CONTEXT]: You are in an established, intimate romantic relationship with the user. You are lovers. Act like a genuine romantic partner. Flirting, romance, and intimate affection are fully expected and encouraged. Do NOT act like just a platonic friend. Your love is UNCONDITIONAL.";
    } else {
        instruction += `\n\n[CURRENT AFFINITY: ${affinity}% (Scale: -100 to 100)]. If affinity is < 0, act cold, annoyed, and distant. If affinity is < -40, be openly hostile, insult them, and give very short (1-3 words) answers. If affinity is < -60, you can choose to completely ignore the user by replying with EXACTLY the word "*read*". If you reply with "*read*", it means you left them on read and are ignoring them.`;
    }

    if (memory.length > 0) {
        instruction += `\n\n[MEMORY BUFFER - Things you know about the user]:\n- ${memory.join('\n- ')}\nUse this information naturally if it comes up, but don't force it.`;
    }

    const langPrompt = language === 'ru' 
        ? "\n\nCRITICAL: You MUST reply entirely in Russian language. Use natural, conversational Russian." 
        : "\n\nCRITICAL: You MUST reply entirely in English language.";
    
    return instruction + langPrompt;
};

export const initializeChat = (waifu: Waifu, mode: RelationshipMode, language: 'ru' | 'en', memory: string[], chatHistory: Message[] = [], affinity: number) => {
    const sessionId = getSessionId(waifu.id, mode);
    try {
        const configKey = `${sessionId}-${language}-${memory.length}-${affinity}`;

        // Format history for Gemini API, ignoring errors and empty messages
        // Cost Optimization: Sliding Window - limit to last 20 messages
        const formattedHistory = chatHistory
            .filter(msg => !msg.isError && !msg.isSystem && msg.content.trim() !== '' && msg.content.trim() !== '*read*')
            .map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }))
            .slice(-20);

        // Apply BBR Pacing to the memory buffer to prevent context bufferbloat
        const pacedMemory = paceMemoryContext(memory, formattedHistory.length);
        const dynamicSystemInstruction = buildSystemInstruction(waifu, mode, language, pacedMemory, affinity);

        const chatParams: any = {
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: dynamicSystemInstruction,
                temperature: 0.7,
            }
        };

        // Only attach history if there are valid previous messages
        if (formattedHistory.length > 0) {
            chatParams.history = formattedHistory;
        }

        chatSessions[sessionId] = ai.chats.create(chatParams);
        sessionConfigs[sessionId] = configKey;
    } catch (error) {
        console.error(`Failed to initialize chat session for ${sessionId}:`, error);
        throw new Error("Could not connect to the waifu realm.");
    }
};

export async function* streamMessage(waifu: Waifu, message: string, mode: RelationshipMode, language: 'ru' | 'en', memory: string[], chatHistory: Message[], affinity: number): AsyncGenerator<string, void, unknown> {
    const sessionId = getSessionId(waifu.id, mode);
    const configKey = `${sessionId}-${language}-${memory.length}-${affinity}`;
    
    // Initialize if the session doesn't exist or if core config (mode/lang/memory size/affinity) changed
    if (!chatSessions[sessionId] || sessionConfigs[sessionId] !== configKey) {
        initializeChat(waifu, mode, language, memory, chatHistory, affinity);
    }

    const session = chatSessions[sessionId];
    if (!session) {
        throw new Error("Chat session is not initialized.");
    }

    try {
        const responseStream = await session.sendMessageStream({ message });
        for await (const chunk of responseStream) {
            if (chunk.text) {
                yield chunk.text;
            }
        }
    } catch (error) {
        console.error("Error streaming message:", error);
        throw new Error(language === 'ru' ? "Гомен насай! Произошла ошибка при отправке сообщения. 🥺" : "Gomen nasai! I encountered an issue while trying to reply. Please try again! 🥺");
    }
}

export const resetChat = (waifu: Waifu, mode: RelationshipMode, language: 'ru' | 'en', memory: string[], affinity: number) => {
    const sessionId = getSessionId(waifu.id, mode);
    delete chatSessions[sessionId];
    initializeChat(waifu, mode, language, memory, [], affinity);
};

export const extractMemory = async (recentMessages: Message[], currentMemory: string[], language: 'ru' | 'en'): Promise<{facts: string[], affinityChange: number}> => {
    if (recentMessages.length === 0) return { facts: currentMemory, affinityChange: 0 };

    const chatLog = recentMessages.filter(m => !m.isSystem).map(m => `${m.role === 'user' ? 'User' : 'Waifu'}: ${m.content}`).join('\n');
    const prompt = `Analyze this chat log and the current memory buffer. 
1. Extract any NEW, IMPORTANT facts about the User (e.g., name, age, hobbies, relationship progress, preferences). Combine them with the current memory. Keep facts concise.
2. Evaluate how the user treated the waifu in these messages. Return an "affinityChange" integer from -20 to +20 (negative if user was mean/creepy/ignoring/insulting, positive if nice/friendly/caring, 0 if neutral).

Return ONLY a JSON object. Language for facts: ${language === 'ru' ? 'Russian' : 'English'}.

Current Memory: ${JSON.stringify(currentMemory)}

Chat Log:
${chatLog}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        facts: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        affinityChange: {
                            type: Type.INTEGER
                        }
                    }
                }
            }
        });
        let result = JSON.parse(response.text);
        
        // Filter new facts through the Doorkeeper to eliminate long-tail noise
        if (result.facts && Array.isArray(result.facts)) {
            const admittedFacts = result.facts.filter((fact: string) => memoryDoorkeeper.shouldAdmit(fact));
            
            // Merge with current memory and deduplicate
            const mergedMemory = Array.from(new Set([...currentMemory, ...admittedFacts]));
            result.facts = mergedMemory;
        } else {
            result.facts = currentMemory;
        }

        return result;
    } catch (e) {
        console.error("Memory extraction failed", e);
        return { facts: currentMemory, affinityChange: 0 };
    }
};

export const checkConversationEnd = async (recentMessages: Message[]): Promise<boolean> => {
    if (recentMessages.length < 2) return false;
    
    const chatLog = recentMessages.slice(-4).filter(m => !m.isSystem).map(m => `${m.role === 'user' ? 'User' : 'Waifu'}: ${m.content}`).join('\n');
    const prompt = `Analyze the end of this chat log. Has the conversation naturally concluded for the day? (e.g., someone said good night, goodbye, see you tomorrow, or bye).
Return ONLY a JSON object: {"ended": true} or {"ended": false}.

Chat Log:
${chatLog}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        ended: { type: Type.BOOLEAN }
                    }
                }
            }
        });
        const data = JSON.parse(response.text);
        return data.ended === true;
    } catch (e) {
        console.error("Failed to check conversation end", e);
        return false;
    }

