type SpeechAlternative = { transcript: string }
type SpeechResult = { isFinal: boolean; 0: SpeechAlternative }
type SpeechResultList = { length: number; [index: number]: SpeechResult }

export type SpeechListener = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechCtor = new () => SpeechListener

function recognitionCtor(): SpeechCtor | null {
  const host = window as unknown as {
    SpeechRecognition?: SpeechCtor
    webkitSpeechRecognition?: SpeechCtor
  }
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return recognitionCtor() !== null
}

export function resolveLanguage(language: string): string {
  return language || navigator.language || "en-US"
}

export function createListener(language: string): SpeechListener | null {
  const Ctor = recognitionCtor()
  if (!Ctor) return null
  const listener = new Ctor()
  listener.continuous = true
  listener.interimResults = true
  listener.lang = language
  return listener
}

export function recorderMime(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}
