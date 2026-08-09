import { GoogleGenAI, Chat, Type } from '@google/genai';
import { Waifu, RelationshipMode, Message } from '../types';

// Initialize the SDK. API_KEY must be provided in the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY, vertexai: true });

// Store a separate chat session for each waifu ID AND mode
const chatSessions: Record<string, Chat> = {};
const sessionConfigs: Record<string, string> = {}; // Tracks the config string to know when to re-init

const getSessionId = (waifuId: string, mode: RelationshipMode) => `${waifuId}-${mode}`;

export const buildSystemInstruction = (waifu: Waifu, mode: RelationshipMode, language: 'ru' | 'en', memory: string[]) => {
    let instruction = waifu.basePersona;
    instruction += "\n\n" + (mode === 'lovers' ? waifu.loversModifier : waifu.strangersModifier);
    
    if (mode === 'lovers') {
        instruction += "\n\n[IMPORTANT ROMANCE CONTEXT]: You are in an established, intimate romantic relationship with the user. You are lovers. Act like a genuine romantic partner. Flirting, romance, and intimate affection are fully expected and encouraged. Do NOT act like just a platonic friend.";
    }

    if (memory.length > 0) {
        instruction += `\n\n[MEMORY BUFFER - Things you know about the user]:\n- ${memory.join('\n- ')}\nUse this information naturally if it comes up, but don't force it.`;
    }

    const langPrompt = language === 'ru' 
        ? "\n\nCRITICAL: You MUST reply entirely in Russian language. Use natural, conversational Russian." 
        : "\n\nCRITICAL: You MUST reply entirely in English language.";
    
    return instruction + langPrompt;
};

export const initializeChat = (waifu: Waifu, mode: RelationshipMode, language: 'ru' | 'en', memory: string[], chatHistory: Message[] = []) => {
    const sessionId = getSessionId(waifu.id, mode);
    try {
        const systemInstruction = buildSystemInstruction(waifu, mode, language, memory);
        const configKey = `${sessionId}-${language}-${memory.length}`;

        // Format history for Gemini API, ignoring errors and empty messages
        const formattedHistory = chatHistory
            .filter(msg => !msg.isError && !msg.isSystem && msg.content.trim() !== '')
            .map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }));

        const chatParams: any = {
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: systemInstruction,
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

export async function* streamMessage(waifu: Waifu, message: string, mode: RelationshipMode, language: 'ru' | 'en', memory: string[], chatHistory: Message[]): AsyncGenerator<string, void, unknown> {
    const sessionId = getSessionId(waifu.id, mode);
    const configKey = `${sessionId}-${language}-${memory.length}`;
    
    // Initialize if the session doesn't exist or if core config (mode/lang/memory size) changed
    if (!chatSessions[sessionId] || sessionConfigs[sessionId] !== configKey) {
        initializeChat(waifu, mode, language, memory, chatHistory);
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

export const resetChat = (waifu: Waifu, mode: RelationshipMode, language: 'ru' | 'en', memory: string[]) => {
    const sessionId = getSessionId(waifu.id, mode);
    delete chatSessions[sessionId];
    initializeChat(waifu, mode, language, memory, []);
};

export const extractMemory = async (recentMessages: Message[], currentMemory: string[], language: 'ru' | 'en'): Promise<{facts: string[], affinityChange: number}> => {
    if (recentMessages.length === 0) return { facts: currentMemory, affinityChange: 0 };

    const chatLog = recentMessages.filter(m => !m.isSystem).map(m => `${m.role === 'user' ? 'User' : 'Waifu'}: ${m.content}`).join('\n');
    const prompt = `Analyze this chat log and the current memory buffer. 
1. Extract any NEW, IMPORTANT facts about the User (e.g., name, age, hobbies, relationship progress, preferences). Combine them with the current memory. Keep facts concise.
2. Evaluate how the user treated the waifu in these messages. Return an "affinityChange" integer from -5 to +5 (negative if user was mean/creepy/ignoring, positive if nice/friendly/caring, 0 if neutral).

Return ONLY a JSON object. Language for facts: ${language === 'ru' ? 'Russian' : 'English'}.

Current Memory: ${JSON.stringify(currentMemory)}

Chat Log:
${chatLog}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
        const data = JSON.parse(response.text);
        return { 
            facts: data.facts || currentMemory, 
            affinityChange: data.affinityChange || 0 
        };
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
            model: 'gemini-2.5-flash',
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
};
