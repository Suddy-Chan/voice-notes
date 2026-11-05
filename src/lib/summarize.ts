import type { Summary } from "../types.ts"

const EN_STOP = new Set(
  `a an the and or but if then else when while of to for from in on at by with without as is are was were be been being it this that these those i you we they he she them me my your our their not no nor so too very just into over after before up down out than also can could should would will may might do does did doing have has had having about`.split(
    /\s+/,
  ),
)

const CJK_STOP = new Set("的了是在我有和就不人也这為之为与及或而但被把对從从到说要会能可很最更着過过".split(""))

function isCjk(text: string): boolean {
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return cjk > latin
}

function cleanFillers(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b(um+|uh+|erm|ah+)\b[, ]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function segment(text: string, cjk: boolean): string[] {
  const pieces = (cjk ? text.split(/(?<=[。！？!?；;])\s*/) : text.split(/(?<=[.!?])\s+/))
    .map((part) => part.trim())
    .filter(Boolean)
  if ((cjk ? /[。！？!?；;]/ : /[.!?]/).test(text) && pieces.length > 1) return pieces

  const clauses = text
    .split(/[,，;；]\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12)
  if (clauses.length >= 3) return clauses

  if (cjk) {
    const size = 42
    const chunks: string[] = []
    const compact = text.replace(/\s+/g, "")
    for (let index = 0; index < compact.length; index += size) {
      chunks.push(compact.slice(index, index + size))
    }
    return chunks.filter(Boolean)
  }

  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 26) return [text]
  const chunks: string[] = []
  for (let index = 0; index < words.length; index += 22) {
    chunks.push(words.slice(index, index + 22).join(" "))
  }
  return chunks
}

function tokens(sentence: string, cjk: boolean): string[] {
  if (cjk) {
    return [...sentence].filter((char) => /[\u3400-\u9fff]/.test(char) && !CJK_STOP.has(char))
  }
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !EN_STOP.has(word))
}

function rank(segments: string[], cjk: boolean): { text: string; index: number; score: number }[] {
  const docs = segments.map((sentence) => tokens(sentence, cjk))
  const docFrequency = new Map<string, number>()
  for (const words of docs) {
    for (const word of new Set(words)) {
      docFrequency.set(word, (docFrequency.get(word) ?? 0) + 1)
    }
  }

  return segments
    .map((text, index) => {
      const words = docs[index] ?? []
      let score = 0
      for (const word of words) {
        const idf = Math.log((segments.length + 1) / (docFrequency.get(word) ?? 1))
        score += 1 + idf
      }
      score /= Math.sqrt(words.length + 1)
      if (/\d/.test(text)) score += 0.35
      if (
        /\b(meet|meeting|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|need to|we should|let's|decide|send|email|call|deadline)\b/i.test(
          text,
        )
      ) {
        score += 0.45
      }
      if (index === 0) score += 0.12
      return { text, index, score }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
}

function punctuate(text: string, cjk: boolean): string {
  const trimmed = text.trim()
  if (/[.!?。！？]$/.test(trimmed)) return trimmed
  return `${trimmed}${cjk ? "。" : "."}`
}

function stripPunct(text: string): string {
  return text.trim().replace(/[.!?。！？;；,，:：]+$/g, "")
}

function clipTitle(sentence: string, cjk: boolean): string {
  const clean = stripPunct(sentence)
  if (!clean) return ""
  if (cjk) return [...clean].slice(0, 18).join("")
  const words = clean
    .split(/\s+/)
    .slice(0, 8)
    .map((word) => word.replace(/^[,:;，]+|[,:;，]+$/g, ""))
    .filter(Boolean)
  while (words.length > 3 && /^(and|or|but|the|a|an|to|of|in|on|for|with)$/i.test(words.at(-1) ?? "")) {
    words.pop()
  }
  const title = words.join(" ")
  return title.length > 68 ? `${title.slice(0, 68).trim()}` : title
}

export function summarizeLocal(text: string): Summary {
  const trimmed = cleanFillers(text)
  if (!trimmed) return { title: "", summary: "", points: [] }

  const cjk = isCjk(trimmed)
  const segments = segment(trimmed, cjk)
  const ranked = rank(segments, cjk)
  const title = clipTitle(ranked[0]?.text ?? segments[0] ?? "", cjk)
  const count =
    segments.length <= 4
      ? segments.length
      : Math.min(6, Math.max(4, Math.round(segments.length * 0.34)))
  const chosen = ranked.slice(0, count).sort((a, b) => a.index - b.index)

  if (chosen.length <= 2) {
    return {
      title,
      summary: chosen.map((item) => punctuate(item.text, cjk)).join(" "),
      points: [],
    }
  }

  return {
    title,
    summary: chosen
      .slice(0, 2)
      .map((item) => punctuate(item.text, cjk))
      .join(" "),
    points: chosen.slice(2).map((item) => stripPunct(item.text)),
  }
}
