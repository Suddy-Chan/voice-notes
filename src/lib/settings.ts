import type { Settings } from "../types.ts"

const STORAGE_KEY = "voice-notes.settings"

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "", label: "Browser default" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "zh-CN", label: "中文（简体）" },
  { value: "zh-TW", label: "中文（繁體）" },
  { value: "zh-HK", label: "中文（香港）" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "hi-IN", label: "हिन्दी" },
  { value: "id-ID", label: "Bahasa Indonesia" },
  { value: "vi-VN", label: "Tiếng Việt" },
  { value: "th-TH", label: "ไทย" },
  { value: "ar-SA", label: "العربية" },
]

export function defaultSettings(): Settings {
  return {
    language: "",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    transcribeModel: "whisper-1",
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

export function loadSettings(): Settings {
  const defaults = defaultSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return defaults
    const record = parsed as Record<string, unknown>
    return {
      language: asString(record.language, defaults.language),
      apiKey: asString(record.apiKey, defaults.apiKey),
      baseUrl: asString(record.baseUrl, defaults.baseUrl).trim() || defaults.baseUrl,
      model: asString(record.model, defaults.model).trim() || defaults.model,
      transcribeModel:
        asString(record.transcribeModel, defaults.transcribeModel).trim() ||
        defaults.transcribeModel,
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
