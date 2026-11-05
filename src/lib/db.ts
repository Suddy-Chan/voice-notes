import type { Note } from "../types.ts"

const DB_NAME = "voice-notes"
const DB_VERSION = 1

const memoryNotes = new Map<string, Note>()
const memoryAudio = new Map<string, Blob>()
let memoryOnly = false
let databasePromise: Promise<IDBDatabase> | null = null

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (memoryOnly) return Promise.resolve(null)
  if (typeof indexedDB === "undefined") {
    memoryOnly = true
    return Promise.resolve(null)
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains("notes")) {
          database.createObjectStore("notes", { keyPath: "id" })
        }
        if (!database.objectStoreNames.contains("audio")) {
          database.createObjectStore("audio")
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return databasePromise.then(
    (database) => database,
    () => {
      databasePromise = null
      memoryOnly = true
      return null
    },
  )
}

export function usingMemoryStorage(): boolean {
  return memoryOnly
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listNotes(): Promise<Note[]> {
  const database = await openDatabase()
  if (!database) return sortNotes([...memoryNotes.values()])
  const transaction = database.transaction("notes", "readonly")
  const notes = await requestToPromise(transaction.objectStore("notes").getAll() as IDBRequest<Note[]>)
  return sortNotes(notes)
}

export async function saveNote(note: Note): Promise<void> {
  memoryNotes.set(note.id, note)
  const database = await openDatabase()
  if (!database) return
  const transaction = database.transaction("notes", "readwrite")
  transaction.objectStore("notes").put(note)
  await transactionDone(transaction)
}

export async function deleteNote(id: string): Promise<void> {
  memoryNotes.delete(id)
  memoryAudio.delete(id)
  const database = await openDatabase()
  if (!database) return
  const transaction = database.transaction(["notes", "audio"], "readwrite")
  transaction.objectStore("notes").delete(id)
  transaction.objectStore("audio").delete(id)
  await transactionDone(transaction)
}

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  memoryAudio.set(id, blob)
  const database = await openDatabase()
  if (!database) return
  const transaction = database.transaction("audio", "readwrite")
  transaction.objectStore("audio").put(blob, id)
  await transactionDone(transaction)
}

export async function getAudio(id: string): Promise<Blob | null> {
  const database = await openDatabase()
  if (!database) return memoryAudio.get(id) ?? null
  const transaction = database.transaction("audio", "readonly")
  const blob = await requestToPromise(transaction.objectStore("audio").get(id) as IDBRequest<Blob | undefined>)
  return blob ?? null
}
