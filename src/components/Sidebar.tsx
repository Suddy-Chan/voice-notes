import { useMemo } from "react"
import { previewText, startOfDay } from "../lib/format.ts"
import type { Note } from "../types.ts"

type SidebarProps = {
  notes: Note[]
  activeId: string | null
  recordingId: string | null
  query: string
  ready: boolean
  onQuery: (value: string) => void
  onSelect: (id: string) => void
  onNew: () => void
  onOpenSettings: () => void
}

function formatListTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function groupNotes(notes: Note[]): { label: string; notes: Note[] }[] {
  const today = startOfDay(Date.now())
  const yesterday = today - 86_400_000
  const weekAgo = today - 6 * 86_400_000
  const groups = [
    { label: "Today", notes: [] as Note[] },
    { label: "Yesterday", notes: [] as Note[] },
    { label: "This week", notes: [] as Note[] },
    { label: "Earlier", notes: [] as Note[] },
  ]
  for (const note of notes) {
    const day = startOfDay(note.updatedAt)
    if (day >= today) groups[0].notes.push(note)
    else if (day >= yesterday) groups[1].notes.push(note)
    else if (day >= weekAgo) groups[2].notes.push(note)
    else groups[3].notes.push(note)
  }
  return groups.filter((group) => group.notes.length > 0)
}

export function Sidebar({
  notes,
  activeId,
  recordingId,
  query,
  ready,
  onQuery,
  onSelect,
  onNew,
  onOpenSettings,
}: SidebarProps) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const ordered = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
    if (!needle) return ordered
    return ordered.filter((note) =>
      [note.title, note.transcript, note.summary, note.points.join(" ")]
        .join("\n")
        .toLowerCase()
        .includes(needle),
    )
  }, [notes, query])

  const groups = useMemo(() => groupNotes(filtered), [filtered])

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <p className="brand-name">Voice Notes</p>
          <p className="brand-tag">Speak, then keep the point.</p>
        </div>
      </div>

      <div className="sidebar-tools">
        <button type="button" className="btn solid" onClick={onNew}>
          New note
        </button>
        <button type="button" className="btn ghost" onClick={onOpenSettings}>
          Settings
        </button>
      </div>

      <label className="sr-only" htmlFor="note-search">
        Search notes
      </label>
      <input
        id="note-search"
        className="search"
        value={query}
        placeholder="Search notes"
        onChange={(event) => onQuery(event.target.value)}
      />

      <div className="note-list">
        {!ready && <p className="list-empty">Loading notes…</p>}
        {ready && notes.length === 0 && (
          <p className="list-empty">Your notes will land here.</p>
        )}
        {ready && notes.length > 0 && filtered.length === 0 && (
          <p className="list-empty">No notes match that search.</p>
        )}
        {groups.map((group) => (
          <section key={group.label} className="note-group">
            <h2>{group.label}</h2>
            {group.notes.map((note) => {
              const selected = note.id === activeId
              const preview = previewText(note)
              return (
                <button
                  key={note.id}
                  type="button"
                  className={selected ? "note selected" : "note"}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(note.id)}
                >
                  <span className="note-title">
                    {note.id === recordingId && <i className="live-dot" aria-hidden="true" />}
                    {note.title.trim() || "Untitled note"}
                  </span>
                  <span className="note-meta">{formatListTime(note.updatedAt)}</span>
                  {preview && <span className="note-preview">{preview}</span>}
                </button>
              )
            })}
          </section>
        ))}
      </div>
    </aside>
  )
}
