import { useEffect, useRef, useState } from "react"
import { NoteView } from "./components/NoteView.tsx"
import { SettingsDialog } from "./components/SettingsDialog.tsx"
import { Sidebar } from "./components/Sidebar.tsx"
import { summarizeWithModel, transcribeAudio } from "./lib/cloud.ts"
import { deleteNote, getAudio, listNotes, saveAudio, saveNote, usingMemoryStorage } from "./lib/db.ts"
import { downloadName, isEmptyNote, toMarkdown } from "./lib/format.ts"
import { createNote } from "./lib/note.ts"
import { loadSettings, saveSettings } from "./lib/settings.ts"
import {
  createListener,
  recorderMime,
  resolveLanguage,
  speechSupported,
  type SpeechListener,
} from "./lib/speech.ts"
import { summarizeLocal } from "./lib/summarize.ts"
import type { Note, Settings, StatusMessage } from "./types.ts"

type Session = {
  noteId: string
  recorder: MediaRecorder
  stream: MediaStream
  recognition: SpeechListener | null
  chunks: Blob[]
  startedAt: number
  timer: number
  base: string
  finals: string
  interim: string
  alive: boolean
}

function joinTranscript(base: string, spoken: string): string {
  return [base.trim(), spoken.trim()].filter(Boolean).join(base.trim() ? " " : "")
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [active, setActive] = useState<Note | null>(null)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [query, setQuery] = useState("")
  const [ready, setReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingNoteId, setRecordingNoteId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [interim, setInterim] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<StatusMessage | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioVersion, setAudioVersion] = useState(0)

  const notesRef = useRef<Note[]>([])
  const activeRef = useRef<Note | null>(null)
  const settingsRef = useRef(settings)
  const recRef = useRef<Session | null>(null)
  const creating = useRef<Promise<Note> | null>(null)
  const saveTimers = useRef<Record<string, number>>({})
  const summaryLock = useRef(false)
  const messageTimer = useRef(0)
  const starting = useRef(false)
  const speechOk = speechSupported()

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  function notify(tone: StatusMessage["tone"], text: string) {
    setMessage({ tone, text })
    window.clearTimeout(messageTimer.current)
    if (tone === "info") {
      messageTimer.current = window.setTimeout(() => {
        setMessage((current) => (current?.text === text ? null : current))
      }, 4200)
    }
  }

  function queueSave(id: string) {
    window.clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = window.setTimeout(() => {
      const latest = notesRef.current.find((note) => note.id === id)
      if (latest) void saveNote(latest)
    }, 280)
  }

  async function patchNote(id: string, patch: Partial<Note>, immediate = false): Promise<Note | null> {
    const current = notesRef.current.find((note) => note.id === id)
    if (!current) return null
    const next = { ...current, ...patch, updatedAt: Date.now() }
    notesRef.current = notesRef.current.map((note) => (note.id === id ? next : note))
    setNotes(notesRef.current)
    if (activeRef.current?.id === id) {
      activeRef.current = next
      setActive(next)
    }
    if (immediate) {
      window.clearTimeout(saveTimers.current[id])
      await saveNote(next)
    } else {
      queueSave(id)
    }
    return next
  }

  function ensureActive(): Promise<Note> {
    if (activeRef.current) return Promise.resolve(activeRef.current)
    if (creating.current) return creating.current
    const note = createNote()
    activeRef.current = note
    notesRef.current = [note, ...notesRef.current]
    setNotes(notesRef.current)
    setActive(note)
    creating.current = saveNote(note)
      .then(() => note)
      .finally(() => {
        creating.current = null
      })
    return creating.current
  }

  async function removeNote(id: string) {
    window.clearTimeout(saveTimers.current[id])
    notesRef.current = notesRef.current.filter((note) => note.id !== id)
    setNotes(notesRef.current)
    if (activeRef.current?.id === id) {
      activeRef.current = null
      setActive(null)
    }
    await deleteNote(id)
  }

  async function runSummary(noteId: string, transcript: string) {
    const clean = transcript.trim()
    if (!clean) {
      notify("error", "There isn’t any transcript to summarize yet.")
      return
    }
    if (summaryLock.current) return
    summaryLock.current = true
    try {
      const local = summarizeLocal(clean)
      const current = notesRef.current.find((note) => note.id === noteId)
      await patchNote(
        noteId,
        {
          transcript: clean,
          summary: local.summary,
          points: local.points,
          summarySource: "local",
          summarizedFrom: clean,
          title: current?.titleEdited ? current.title : local.title,
        },
        true,
      )
      if (!settingsRef.current.apiKey.trim()) return

      setBusy("Sharpening the summary…")
      const better = await summarizeWithModel(clean, settingsRef.current)
      const latest = notesRef.current.find((note) => note.id === noteId)
      if (!latest || latest.transcript.trim() !== clean) return
      await patchNote(
        noteId,
        {
          summary: better.summary || local.summary,
          points: better.points.length > 0 ? better.points : local.points,
          summarySource: "model",
          summarizedFrom: clean,
          title: latest.titleEdited ? latest.title : better.title || local.title,
        },
        true,
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The model summary failed."
      notify("error", `${detail} The on-device summary is still here.`)
    } finally {
      summaryLock.current = false
      setBusy(null)
    }
  }

  async function finishRecording(noteId: string, blob: Blob, duration: number, transcript: string) {
    if (!notesRef.current.some((item) => item.id === noteId)) return
    try {
      const current = notesRef.current.find((note) => note.id === noteId)
      if (!current) return
      if (blob.size > 0) {
        await saveAudio(noteId, blob)
        setAudioVersion((version) => version + 1)
      }
      if (!notesRef.current.some((item) => item.id === noteId)) return
      await patchNote(
        noteId,
        {
          transcript,
          hasAudio: blob.size > 0 || Boolean(current?.hasAudio),
          durationMs: (current?.durationMs ?? 0) + duration,
        },
        true,
      )
      if (transcript.trim()) await runSummary(noteId, transcript)
      else if (speechOk) {
        notify("info", "No speech was captured. Type the transcript, or transcribe the audio with an API key.")
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not save the recording.")
    }
  }

  const finishRef = useRef(finishRecording)

  function stopRecording() {
    const session = recRef.current
    if (!session) return
    session.alive = false
    window.clearInterval(session.timer)
    try {
      session.recognition?.stop()
    } catch {
      /* recognition already stopped */
    }
    if (session.recorder.state !== "inactive") session.recorder.stop()
    setRecording(false)
    setRecordingNoteId(null)
    setInterim("")
  }

  const stopRef = useRef(stopRecording)

  useEffect(() => {
    finishRef.current = finishRecording
    stopRef.current = stopRecording
  })

  async function startRecording() {
    if (recRef.current || starting.current || busy) return
    starting.current = true
    setMessage(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      starting.current = false
      const name = error instanceof DOMException ? error.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") {
        notify("error", "Microphone permission is blocked. Allow it for this site, then try again.")
      } else if (name === "NotFoundError") {
        notify("error", "No microphone was found.")
      } else {
        notify("error", "Could not start the microphone.")
      }
      return
    }

    if (typeof MediaRecorder === "undefined") {
      starting.current = false
      stream.getTracks().forEach((track) => track.stop())
      notify("error", "This browser can’t record audio.")
      return
    }

    let note: Note
    try {
      note = await ensureActive()
    } catch {
      if (!activeRef.current) {
        starting.current = false
        stream.getTracks().forEach((track) => track.stop())
        notify("error", "Could not start the recording.")
        return
      }
      note = activeRef.current
    }
    const mime = recorderMime()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    } catch {
      starting.current = false
      stream.getTracks().forEach((track) => track.stop())
      notify("error", "Could not start the recording.")
      return
    }
    const session: Session = {
      noteId: note.id,
      recorder,
      stream,
      recognition: null,
      chunks: [],
      startedAt: performance.now(),
      timer: 0,
      base: note.transcript.trim(),
      finals: "",
      interim: "",
      alive: true,
    }
    recRef.current = session
    starting.current = false
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) session.chunks.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(session.chunks, { type: recorder.mimeType || mime || "audio/webm" })
      const spoken = `${session.finals} ${session.interim}`.replace(/\s+/g, " ").trim()
      const transcript = joinTranscript(session.base, spoken)
      session.stream.getTracks().forEach((track) => track.stop())
      window.clearInterval(session.timer)
      if (recRef.current === session) recRef.current = null
      setRecording(false)
      setRecordingNoteId(null)
      setInterim("")
      void finishRef.current(session.noteId, blob, performance.now() - session.startedAt, transcript)
    }

    const recognition = createListener(resolveLanguage(settingsRef.current.language))
    if (recognition) {
      recognition.onresult = (event) => {
        if (!session.alive) return
        let finals = session.finals
        let interimText = ""
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const piece = result?.[0]?.transcript ?? ""
          if (result?.isFinal) finals += `${piece} `
          else interimText += piece
        }
        session.finals = finals
        session.interim = interimText
        setInterim(interimText.trim())
        void patchNote(session.noteId, { transcript: joinTranscript(session.base, finals) })
      }
      recognition.onerror = (event) => {
        if (event.error === "not-allowed") {
          notify("error", "Live transcription was blocked. The audio is still recording.")
        }
      }
      recognition.onend = () => {
        if (!session.alive) return
        try {
          recognition.start()
        } catch {
          /* already running */
        }
      }
      session.recognition = recognition
      try {
        recognition.start()
      } catch {
        notify("info", "Live transcription didn’t start. The audio is still recording.")
      }
    } else {
      notify(
        "info",
        "This browser can’t transcribe live. The audio will be saved — type the transcript, or add an API key to transcribe the file.",
      )
    }

    session.timer = window.setInterval(() => {
      setElapsed(performance.now() - session.startedAt)
    }, 200)
    try {
      recorder.start(250)
    } catch {
      session.alive = false
      window.clearInterval(session.timer)
      try {
        recognition?.abort()
      } catch {
        /* recognition was not running */
      }
      stream.getTracks().forEach((track) => track.stop())
      if (recRef.current === session) recRef.current = null
      notify("error", "Could not start the recording.")
      return
    }
    setRecording(true)
    setRecordingNoteId(session.noteId)
    setElapsed(0)
  }

  async function selectNote(id: string) {
    if (activeRef.current?.id === id) return
    const recordingId = recRef.current?.noteId
    if (recRef.current) stopRef.current()
    const previous = activeRef.current
    if (previous && previous.id !== recordingId && isEmptyNote(previous)) await removeNote(previous.id)
    const next = notesRef.current.find((note) => note.id === id) ?? null
    activeRef.current = next
    setActive(next)
  }

  function beginNew() {
    const recordingId = recRef.current?.noteId
    if (recRef.current) stopRef.current()
    const previous = activeRef.current
    if (previous && previous.id !== recordingId && isEmptyNote(previous)) {
      void removeNote(previous.id)
      return
    }
    activeRef.current = null
    setActive(null)
  }

  async function importAudio(file: File) {
    const audioLike =
      file.type.startsWith("audio/") || /\.(webm|mp3|wav|m4a|ogg|flac|mpeg|mp4|aac)$/i.test(file.name)
    if (!audioLike) {
      notify("error", "Choose an audio file.")
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      notify("error", "That file is over 25 MB. Most transcription APIs will reject it.")
      return
    }
    const note = await ensureActive()
    setBusy("Saving audio…")
    try {
      await saveAudio(note.id, file)
      await patchNote(note.id, { hasAudio: true }, true)
      setAudioVersion((version) => version + 1)
      if (!settingsRef.current.apiKey.trim()) {
        notify("info", "Audio saved. Add an API key in Settings to transcribe it, or type the transcript.")
        return
      }
      setBusy("Transcribing…")
      const text = await transcribeAudio(file, file.name || "audio.webm", settingsRef.current)
      const merged = [notesRef.current.find((item) => item.id === note.id)?.transcript.trim() ?? "", text]
        .filter(Boolean)
        .join("\n\n")
      await patchNote(note.id, { transcript: merged }, true)
      await runSummary(note.id, merged)
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not import that audio.")
    } finally {
      setBusy(null)
    }
  }

  async function copyActive() {
    const note = activeRef.current
    if (!note) return
    try {
      await navigator.clipboard.writeText(toMarkdown(note))
      notify("info", "Copied the note.")
    } catch {
      notify("error", "Couldn’t copy from this browser.")
    }
  }

  function exportActive() {
    const note = activeRef.current
    if (!note) return
    const blob = new Blob([toMarkdown(note)], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = downloadName(note.title)
    link.click()
    URL.revokeObjectURL(url)
  }

  async function deleteActive() {
    const note = activeRef.current
    if (!note) return
    if (recRef.current?.noteId === note.id) stopRef.current()
    await removeNote(note.id)
    const next = [...notesRef.current].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    activeRef.current = next
    setActive(next)
  }

  useEffect(() => {
    const gate = { cancelled: false }
    void (async () => {
      const stored = await listNotes()
      if (gate.cancelled) return
      notesRef.current = stored
      setNotes(stored)
      const initial = stored[0] ?? null
      activeRef.current = initial
      setActive(initial)
      if (usingMemoryStorage()) {
        setMessage({
          tone: "info",
          text: "Notes stay in this tab only — the browser blocked saved storage.",
        })
      }
      setReady(true)
    })()
    return () => {
      gate.cancelled = true
    }
  }, [])

  useEffect(() => {
    const timers = saveTimers.current
    return () => {
      for (const id of Object.keys(timers)) window.clearTimeout(timers[id])
      window.clearTimeout(messageTimer.current)
      const session = recRef.current
      if (!session) return
      session.alive = false
      window.clearInterval(session.timer)
      try {
        session.recognition?.abort()
      } catch {
        /* ignore */
      }
      session.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (settingsOpen) {
        setSettingsOpen(false)
        return
      }
      if (recRef.current) stopRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [settingsOpen])

  useEffect(() => {
    const gate = { cancelled: false, url: null as string | null }
    const id = active?.id
    if (!id || !active.hasAudio) return
    void getAudio(id).then((blob) => {
      if (gate.cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      gate.url = url
      if (gate.cancelled) {
        URL.revokeObjectURL(url)
        return
      }
      setAudioUrl(url)
    })
    return () => {
      gate.cancelled = true
      if (gate.url) URL.revokeObjectURL(gate.url)
      setAudioUrl(null)
    }
  }, [active?.id, active?.hasAudio, audioVersion])

  return (
    <div className="app">
      <Sidebar
        notes={notes}
        activeId={active?.id ?? null}
        recordingId={recordingNoteId}
        query={query}
        ready={ready}
        onQuery={setQuery}
        onSelect={(id) => void selectNote(id)}
        onNew={beginNew}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <NoteView
        note={active}
        recording={recording}
        elapsedMs={elapsed}
        interim={interim}
        busy={busy}
        message={message}
        audioUrl={audioUrl}
        hasKey={Boolean(settings.apiKey.trim())}
        speechOk={speechOk}
        language={settings.language}
        onLanguage={(language) => {
          const next = { ...settingsRef.current, language }
          settingsRef.current = next
          setSettings(next)
          saveSettings(next)
        }}
        onTitle={(value) => void ensureActive().then((note) => patchNote(note.id, { title: value, titleEdited: true }))}
        onTranscript={(value) => void ensureActive().then((note) => patchNote(note.id, { transcript: value }))}
        onSummary={(value) => {
          const note = activeRef.current
          if (!note) return
          void patchNote(note.id, { summary: value })
        }}
        onToggleRecord={() => {
          if (recRef.current) stopRecording()
          else void startRecording()
        }}
        onSummarize={() => {
          const note = activeRef.current
          if (!note) return
          void runSummary(note.id, note.transcript)
        }}
        onImport={(file) => void importAudio(file)}
        onCopy={() => void copyActive()}
        onExport={exportActive}
        onDelete={() => void deleteActive()}
        onDismissMessage={() => setMessage(null)}
      />
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            settingsRef.current = next
            setSettings(next)
            saveSettings(next)
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}
