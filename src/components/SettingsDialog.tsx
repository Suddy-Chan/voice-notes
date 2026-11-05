import { useEffect, useId, useRef, useState } from "react"
import { LANGUAGES } from "../lib/settings.ts"
import type { Settings } from "../types.ts"

type SettingsDialogProps = {
  settings: Settings
  onSave: (settings: Settings) => void
  onClose: () => void
}

export function SettingsDialog({ settings, onSave, onClose }: SettingsDialogProps) {
  const titleId = useId()
  const firstField = useRef<HTMLSelectElement>(null)
  const [draft, setDraft] = useState(settings)

  useEffect(() => {
    firstField.current?.focus()
  }, [])

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 id={titleId}>Settings</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="dialog-copy">
          Recording and the on-device summary work without an account. A key is only used to
          transcribe imported audio and to write a sharper summary. It stays in this browser and
          is sent only to the API address below.
        </p>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSave({
              ...draft,
              baseUrl: draft.baseUrl.trim() || "https://api.openai.com/v1",
              model: draft.model.trim() || "gpt-4o-mini",
              transcribeModel: draft.transcribeModel.trim() || "whisper-1",
            })
          }}
        >
          <label className="field" htmlFor="speech-language">
            Speech language
            <select
              id="speech-language"
              ref={firstField}
              value={draft.language}
              onChange={(event) => update("language", event.target.value)}
            >
              {LANGUAGES.map((language) => (
                <option key={language.value || "default"} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="api-key">
            API key
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              placeholder="sk-…"
              onChange={(event) => update("apiKey", event.target.value)}
            />
          </label>
          <label className="field" htmlFor="api-base">
            API address
            <input
              id="api-base"
              value={draft.baseUrl}
              spellCheck={false}
              onChange={(event) => update("baseUrl", event.target.value)}
            />
          </label>
          <label className="field" htmlFor="summary-model">
            Summary model
            <input
              id="summary-model"
              value={draft.model}
              spellCheck={false}
              onChange={(event) => update("model", event.target.value)}
            />
          </label>
          <label className="field" htmlFor="transcribe-model">
            Transcription model
            <input
              id="transcribe-model"
              value={draft.transcribeModel}
              spellCheck={false}
              onChange={(event) => update("transcribeModel", event.target.value)}
            />
          </label>
          <p className="field-hint">
            OpenAI uses <code>gpt-4o-mini</code> and <code>whisper-1</code>. Groq uses base URL{" "}
            <code>https://api.groq.com/openai/v1</code>, a chat model such as{" "}
            <code>llama-3.3-70b-versatile</code>, and transcription model{" "}
            <code>whisper-large-v3</code>.
          </p>
          <div className="dialog-actions">
            <button type="submit" className="btn solid">
              Save
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => update("apiKey", "")}
            >
              Clear key
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
