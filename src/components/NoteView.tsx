import { useRef, useState } from "react"
import { formatClock, formatWhen } from "../lib/format.ts"
import { LANGUAGES } from "../lib/settings.ts"
import type { Note, StatusMessage } from "../types.ts"

type NoteViewProps = {
  note: Note | null
  recording: boolean
  elapsedMs: number
  interim: string
  busy: string | null
  message: StatusMessage | null
  audioUrl: string | null
  hasKey: boolean
  speechOk: boolean
  language: string
  onLanguage: (language: string) => void
  onTitle: (value: string) => void
  onTranscript: (value: string) => void
  onSummary: (value: string) => void
  onToggleRecord: () => void
  onSummarize: () => void
  onImport: (file: File) => void
  onCopy: () => void
  onExport: () => void
  onDelete: () => void
  onDismissMessage: () => void
}

function summaryLabel(note: Note | null, hasKey: boolean): string {
  if (!note || (!note.summary.trim() && note.points.length === 0)) return "Summarize"
  const stale = note.transcript.trim() !== note.summarizedFrom
  if (hasKey && note.summarySource === "local" && !stale) return "Sharpen with model"
  if (stale) return "Update summary"
  return "Summarize again"
}

export function NoteView({
  note,
  recording,
  elapsedMs,
  interim,
  busy,
  message,
  audioUrl,
  hasKey,
  speechOk,
  language,
  onLanguage,
  onTitle,
  onTranscript,
  onSummary,
  onToggleRecord,
  onSummarize,
  onImport,
  onCopy,
  onExport,
  onDelete,
  onDismissMessage,
}: NoteViewProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const confirming = Boolean(note && confirmId === note.id)
  const canWrite = Boolean(note?.transcript.trim()) && !recording && !busy

  const sourceLabel =
    note?.summarySource === "model"
      ? "Model"
      : note?.summarySource === "local"
        ? "On this device"
        : null

  return (
    <section
      className={dragging ? "stage dragging" : "stage"}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) onImport(file)
      }}
    >
      <header className="note-head">
        <div className="title-block">
          <label className="sr-only" htmlFor="note-title">
            Title
          </label>
          <input
            id="note-title"
            className="title-input"
            value={note?.title ?? ""}
            placeholder={recording ? "Listening…" : "Untitled note"}
            onChange={(event) => onTitle(event.target.value)}
          />
          <p className="meta">
            {note ? formatWhen(note.updatedAt) : "New note"}
            {note && note.durationMs > 0 ? ` · ${formatClock(note.durationMs)}` : ""}
            {sourceLabel ? ` · ${sourceLabel}` : ""}
          </p>
        </div>
        {confirming ? (
          <div className="confirm">
            <span>Delete this note?</span>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirmId(null)
                onDelete()
              }}
            >
              Delete
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirmId(null)}>
              Keep
            </button>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="btn ghost" disabled={!note} onClick={onCopy}>
              Copy
            </button>
            <button type="button" className="btn ghost" disabled={!note} onClick={onExport}>
              Export
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!note}
              onClick={() => setConfirmId(note?.id ?? null)}
            >
              Delete
            </button>
          </div>
        )}
      </header>

      <div className="columns">
        <section className="panel transcript-panel">
          <div className="panel-head">
            <h2>Transcript</h2>
            <button type="button" className="btn solid" disabled={!canWrite} onClick={onSummarize}>
              {summaryLabel(note, hasKey)}
            </button>
          </div>
          <label className="sr-only" htmlFor="transcript">
            Transcript
          </label>
          <textarea
            id="transcript"
            className="transcript"
            value={note?.transcript ?? ""}
            readOnly={recording}
            placeholder="Start recording, paste a transcript, or drop an audio file."
            onChange={(event) => onTranscript(event.target.value)}
          />
          {interim && (
            <p className="interim" aria-live="polite">
              {interim}
            </p>
          )}
        </section>

        <section className="panel summary" aria-live="polite">
          <div className="panel-head">
            <h2>Summary</h2>
            {sourceLabel && <span className="badge">{sourceLabel}</span>}
          </div>
          <label className="sr-only" htmlFor="summary">
            Summary
          </label>
          <textarea
            id="summary"
            className="summary-input"
            value={note?.summary ?? ""}
            disabled={!note || recording}
            placeholder="A short summary lands here after you stop, or when you press Summarize."
            onChange={(event) => onSummary(event.target.value)}
          />
          {note && note.points.length > 0 && (
            <ul className="points">
              {note.points.map((point, index) => (
                <li key={`${note.id}-${index}`}>{point}</li>
              ))}
            </ul>
          )}
          {!hasKey && (
            <p className="field-hint">
              Add an API key in Settings if you want a model to rewrite this, or to transcribe an
              imported file.
            </p>
          )}
        </section>
      </div>

      {message && (
        <div className={message.tone === "error" ? "banner error" : "banner info"} role="status">
          <span>{message.text}</span>
          <button type="button" className="banner-dismiss" onClick={onDismissMessage}>
            Dismiss
          </button>
        </div>
      )}

      <footer className="deck">
        <button
          type="button"
          className={recording ? "rec on" : "rec"}
          aria-pressed={recording}
          aria-label={recording ? "Stop recording" : "Record"}
          disabled={Boolean(busy)}
          onClick={onToggleRecord}
        >
          <i />
        </button>
        <div className="deck-copy">
          <strong>{recording ? formatClock(elapsedMs) : busy ? busy : "Ready"}</strong>
          <span>
            {recording
              ? speechOk
                ? "Listening · Esc to stop"
                : "Recording audio · Esc to stop"
              : speechOk
                ? "Browser transcription, then a summary when you stop"
                : "Type a transcript, or import audio with an API key"}
          </span>
        </div>
        <label className="field deck-lang">
          <span className="sr-only">Speech language</span>
          <select
            value={language}
            disabled={recording}
            onChange={(event) => onLanguage(event.target.value)}
          >
            {LANGUAGES.map((item) => (
              <option key={item.value || "default"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn ghost"
          disabled={Boolean(busy) || recording}
          onClick={() => fileRef.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) onImport(file)
          }}
        />
        {audioUrl && <audio controls src={audioUrl} preload="metadata" />}
      </footer>
      {dragging && <div className="drop-mask">Drop audio to transcribe into this note</div>}
    </section>
  )
}
