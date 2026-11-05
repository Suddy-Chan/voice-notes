export type SummarySource = "none" | "local" | "model"

export type Note = {
  id: string
  title: string
  titleEdited: boolean
  createdAt: number
  updatedAt: number
  durationMs: number
  transcript: string
  summary: string
  points: string[]
  summarySource: SummarySource
  summarizedFrom: string
  hasAudio: boolean
}

export type Settings = {
  language: string
  apiKey: string
  baseUrl: string
  model: string
  transcribeModel: string
}

export type Summary = {
  title: string
  summary: string
  points: string[]
}

export type StatusMessage = {
  tone: "info" | "error"
  text: string
}
