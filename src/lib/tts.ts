interface TTSOptions {
  rate?: number;
  volume?: number;
  pitch?: number;
  lang?: string;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, options: TTSOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      reject(new Error("Speech synthesis not supported"));
      return;
    }

    stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? 1.0;
    utterance.volume = options.volume ?? 1.0;
    utterance.pitch = options.pitch ?? 1.0;
    utterance.lang = options.lang ?? "ja-JP";

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

export function stop(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

export function pause(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.pause();
  }
}

export function resume(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.resume();
  }
}

export function isSpeaking(): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  return window.speechSynthesis.speaking;
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}
