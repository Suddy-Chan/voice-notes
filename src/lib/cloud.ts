import type { Settings, Summary } from "../types.ts"

export class CloudError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CloudError"
  }
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`
}

async function failureMessage(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string }
    if (typeof body.error === "string" && body.error) return body.error
    if (body.error && typeof body.error === "object" && body.error.message) return body.error.message
  } catch {
    /* response was not JSON */
  }
  const detail = text.replace(/\s+/g, " ").trim().slice(0, 240)
  return detail || response.statusText || "Request failed"
}

function whisperLanguage(language: string): string | undefined {
  const base = (language || navigator.language || "").split("-")[0]?.toLowerCase()
  if (!base || base.length < 2) return undefined
  return base
}

function parseSummary(content: string): Summary {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced?.[1] ?? content).trim()
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) {
    throw new CloudError("The model did not return a summary.")
  }
  let data: { title?: unknown; summary?: unknown; points?: unknown }
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as typeof data
  } catch {
    throw new CloudError("The model did not return a summary.")
  }
  const points = Array.isArray(data.points)
    ? data.points.map((point) => String(point).trim()).filter(Boolean).slice(0, 8)
    : []
  const summary = typeof data.summary === "string" ? data.summary.trim() : ""
  const title = typeof data.title === "string" ? data.title.trim() : ""
  if (!summary && points.length === 0) {
    throw new CloudError("The model returned an empty summary.")
  }
  return {
    title,
    summary: summary || points.join(" "),
    points,
  }
}

export async function summarizeWithModel(transcript: string, settings: Settings): Promise<Summary> {
  const key = settings.apiKey.trim()
  if (!key) throw new CloudError("Add an API key in Settings to refine the summary.")

  const response = await fetch(endpoint(settings.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model.trim() || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            'You turn a raw voice transcript into a note. Keep the speaker\'s language. Do not invent facts, names, or dates. Reply with JSON only, in this shape: {"title":"short specific title","summary":"2 to 4 sentences covering the whole note","points":["distinct fact or action"]}. Use 3 to 6 points. If the transcript is very short, the summary can be one sentence and points can be an empty array.',
        },
        { role: "user", content: transcript },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  })

  if (!response.ok) {
    throw new CloudError(`Summary failed (${response.status}): ${await failureMessage(response)}`)
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[]
  }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new CloudError("The model returned an empty summary.")
  return parseSummary(content)
}

export async function transcribeAudio(
  blob: Blob,
  filename: string,
  settings: Settings,
): Promise<string> {
  const key = settings.apiKey.trim()
  if (!key) throw new CloudError("Add an API key in Settings to transcribe audio files.")

  const form = new FormData()
  form.append("file", blob, filename)
  form.append("model", settings.transcribeModel.trim() || "whisper-1")
  const language = whisperLanguage(settings.language)
  if (language) form.append("language", language)

  const response = await fetch(endpoint(settings.baseUrl, "/audio/transcriptions"), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    throw new CloudError(
      `Transcription failed (${response.status}): ${await failureMessage(response)}`,
    )
  }

  const body = (await response.json()) as { text?: string }
  const text = body.text?.trim() ?? ""
  if (!text) throw new CloudError("The transcription came back empty.")
  return text
}
