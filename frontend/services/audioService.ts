let outputAudioContext: AudioContext | null = null;
let outputNode: GainNode | null = null;
const sources = new Set<AudioBufferSourceNode>();
let nextStartTime = 0;
let isMuted = false;

export function initAudio() {
    if (!outputAudioContext) {
        outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        outputNode = outputAudioContext.createGain();
        outputNode.connect(outputAudioContext.destination);
    }
    if (outputAudioContext.state === 'suspended') {
        outputAudioContext.resume();
    }
}

export function setMuted(muted: boolean) {
    isMuted = muted;
    if (muted) stopAllAudio();
}

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

export async function playPcmBase64(base64EncodedAudioString: string) {
    if (isMuted) return;
    initAudio();
    if (!outputAudioContext || !outputNode) return;

    if (nextStartTime < outputAudioContext.currentTime) {
        nextStartTime = outputAudioContext.currentTime;
    }

    try {
        const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), outputAudioContext, 24000, 1);
        const source = outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(outputNode);
        source.addEventListener('ended', () => {
            sources.delete(source);
        });
        source.start(nextStartTime);
        nextStartTime = nextStartTime + audioBuffer.duration;
        sources.add(source);
    } catch (e) {
        console.error("Failed to decode and play audio chunk", e);
    }
}

export function stopAllAudio() {
    for (const source of sources.values()) {
        try { source.stop(); } catch (e) {}
        sources.delete(source);
    }
    nextStartTime = 0;
}
