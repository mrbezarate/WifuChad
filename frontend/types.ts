export interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    isStreaming?: boolean;
    isError?: boolean;
    isSystem?: boolean;
}

export interface ChatState {
    messages: Message[];
    isTyping: boolean;
    error: string | null;
}

export type RelationshipMode = 'lovers' | 'strangers';

export interface Waifu {
    id: string;
    name: string;
    anime: string;
    basePersona: string;
    loversModifier: string;
    strangersModifier: string;
    themeColor: string;
    lightColor: string;
    avatarUrl: string;
}
