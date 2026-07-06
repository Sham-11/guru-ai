/**
 * Client-side text-to-speech via the browser's built-in Web Speech API.
 *
 * This is deliberately NOT a backend call: speechSynthesis is free, needs no
 * API key, has zero network latency, and every modern browser ships it. It's
 * the spoken-output half of the Voice Agent (Groq Whisper on the backend
 * handles the spoken-input half — see lib/api.ts voiceApi.transcribe).
 *
 * Language codes match what the Language Agent already uses (en/kn/hi/ta);
 * we map them to BCP-47 tags speechSynthesis expects. Kannada/Tamil voice
 * availability varies by OS/browser — this degrades gracefully to the
 * browser's default voice for that language tag if no matching voice is
 * installed, rather than failing.
 */
const LANG_TO_BCP47: Record<string, string> = {
  en: "en-IN",
  kn: "kn-IN",
  hi: "hi-IN",
  ta: "ta-IN",
};

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, langCode: string, onEnd?: () => void): void {
  if (!isSpeechSynthesisAvailable()) {
    console.warn("Web Speech API not available in this browser — cannot speak text aloud.");
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel(); // don't stack multiple utterances

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG_TO_BCP47[langCode] ?? "en-IN";
  utterance.rate = 0.95; // slightly slower — clearer for young learners
  if (onEnd) utterance.onend = onEnd;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisAvailable()) window.speechSynthesis.cancel();
}

/**
 * Starts recording immediately and returns a handle whose `stop()` ends the
 * recording on demand and resolves with the captured audio — the shape a
 * press-and-hold "hold to speak" button needs (recordQuestion() above only
 * supports a fixed max duration, no manual stop).
 */
export function startRecording(onError?: (err: unknown) => void): { stop: () => Promise<Blob> } {
  let resolveBlob: (b: Blob) => void;
  const blobPromise = new Promise<Blob>((resolve) => {
    resolveBlob = resolve;
  });
  let recorder: MediaRecorder | null = null;
  const chunks: BlobPart[] = [];

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        resolveBlob(new Blob(chunks, { type: "audio/webm" }));
      };
      recorder.start();
    })
    .catch((err) => {
      onError?.(err);
      resolveBlob(new Blob([], { type: "audio/webm" })); // empty — caller treats size 0 as "nothing captured"
    });

  return {
    stop: () => {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else if (!recorder) {
        // getUserMedia hasn't resolved yet (user released almost instantly)
        // — give it a moment, then stop as soon as it's ready.
        const waitAndStop = setInterval(() => {
          if (recorder) {
            clearInterval(waitAndStop);
            if (recorder.state !== "inactive") (recorder as MediaRecorder).stop();
          }
        }, 50);
        setTimeout(() => clearInterval(waitAndStop), 2000);
      }
      return blobPromise;
    },
  };
}

/**
 * Records a short audio clip from the mic (for the Voice Agent's STT side)
 * and resolves with a Blob ready to hand to voiceApi.transcribe.
 */
export function recordQuestion(maxSeconds = 15): Promise<Blob> {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream);
        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(new Blob(chunks, { type: "audio/webm" }));
        };
        recorder.onerror = (e) => reject(e);

        recorder.start();
        setTimeout(() => recorder.state !== "inactive" && recorder.stop(), maxSeconds * 1000);
      })
      .catch(reject);
  });
}