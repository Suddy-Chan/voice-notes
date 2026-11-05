# Voice Notes

Voice Notes turns speech into a note you can read later. Record from the microphone, paste a transcript, or import an audio file. The app writes a title, a short summary, and the key points.

Live transcription uses the browser’s speech recognition, so it works best in Chrome or Edge. Summaries are written on this device, with no account required. Notes stay in the browser.

An optional API key, set in Settings, does two extra things:

- Transcribe an imported audio file.
- Rewrite the summary with a model.

OpenAI works with the defaults already in Settings (`gpt-4o-mini` for summaries, `whisper-1` for audio). The key stays in this browser and is sent only to the API address you set.

## Run it

```bash
npm install
npm run dev
```

Open the local address Vite prints, allow the microphone, and press the red record button. Press Esc to stop. A summary appears when the recording ends.
