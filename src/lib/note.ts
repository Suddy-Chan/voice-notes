import type { Note } from "../types.ts"

export function createNote(): Note {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: "",
    titleEdited: false,
    createdAt: now,
    updatedAt: now,
    durationMs: 0,
    transcript: "",
    summary: "",
    points: [],
    summarySource: "none",
    summarizedFrom: "",
    hasAudio: false,
  }
}
