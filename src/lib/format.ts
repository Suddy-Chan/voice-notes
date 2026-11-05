import type { Note } from "../types.ts"

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export function formatWhen(ts: number): string {
  const date = new Date(ts)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const time = formatTime(ts)
  if (date.toDateString() === today.toDateString()) return `Today · ${time}`
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`
  const day = date.toLocaleDateString([], { month: "short", day: "numeric" })
  return `${day} · ${time}`
}

export function startOfDay(ts: number): number {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function previewText(note: Note): string {
  const source = note.summary || note.points[0] || note.transcript
  return source.replace(/\s+/g, " ").trim()
}

export function toMarkdown(note: Note): string {
  const title = note.title.trim() || "Untitled note"
  const points = note.points.map((point) => `- ${point}`).join("\n")
  const summary = note.summary.trim()
  const parts = [`# ${title}`, "", formatWhen(note.createdAt), ""]
  if (summary || points) {
    parts.push("## Summary", "")
    if (summary) parts.push(summary, "")
    if (points) parts.push(points, "")
  }
  parts.push("## Transcript", "", note.transcript.trim(), "")
  return parts.join("\n")
}

export function downloadName(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return `${slug || "note"}.md`
}

export function isEmptyNote(note: Note): boolean {
  return (
    !note.title.trim() &&
    !note.transcript.trim() &&
    !note.summary.trim() &&
    note.points.length === 0 &&
    note.durationMs <= 0 &&
    !note.hasAudio
  )
}
