let isMuted = false;

export function initAudio() {
    // No-op for Web Speech API, but kept for compatibility
    if ('speechSynthesis' in window) {
        // Just warm up the engine
        window.speechSynthesis.getVoices();
    }
}

export function setMuted(muted: boolean) {
    isMuted = muted;
    if (muted) stopAllAudio();
}

export function speakText(text: string, language: 'ru' | 'en') {
    if (isMuted || !('speechSynthesis' in window)) return;
    
    // Stop any currently playing audio so they don't overlap awkwardly
    stopAllAudio();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'ru' ? 'ru-RU' : 'en-US';
    
    // Try to find a female voice (often 'Google русский' or similar)
    const voices = window.speechSynthesis.getVoices();
    const targetLang = utterance.lang;
    const voice = voices.find(v => v.lang === targetLang && (v.name.includes('Female') || v.name.includes('Google'))) 
               || voices.find(v => v.lang === targetLang) 
               || voices[0];
               
    if (voice) {
        utterance.voice = voice;
    }
    
    // Adjust pitch and rate to sound slightly more "anime/cute"
    utterance.pitch = 1.3;
    utterance.rate = 1.05;

    window.speechSynthesis.speak(utterance);
}

export function stopAllAudio() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}
