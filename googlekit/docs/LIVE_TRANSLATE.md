# Live Translation with Gemini Live API (`gemini-3.5-live-translate-preview`)

This document details how to configure real-time speech-to-speech translation between 70+ languages.

---

## 1. Setup Message for Translation

To enable Live Translation, specify `translationConfig` inside `generationConfig`:

```json
{
  "setup": {
    "model": "models/gemini-3.5-live-translate-preview",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "inputAudioTranscription": {},
      "outputAudioTranscription": {},
      "translationConfig": {
        "targetLanguageCode": "pl",
        "echoTargetLanguage": true
      }
    }
  }
}
```

* `targetLanguageCode`: BCP-47 language code (e.g., `pl` for Polish, `es` for Spanish, `hi` for Hindi, `ja` for Japanese, `de` for German).
* `echoTargetLanguage`: If `true`, repeats input audio in the target language. If `false`, stays silent when input audio is already in the target language.

---

## 2. Key Differences: Live Agent vs. Live Translation

| Feature | Live Agent (`gemini-3.1-flash`) | Live Translation (`gemini-3.5-live-translate`) |
| :--- | :--- | :--- |
| **Model Goal** | Conversational Assistant | Real-time Interpreter / Pipeline |
| **Interaction Model**| Turn-based with VAD & interruptions | Continuous stream processing as speaker talks |
| **Tool Calling** | Native function calling & search | Pure translation (no tools) |
| **Input Modality** | Multimodal (Audio, Video, Text) | Audio only (16kHz PCM) |
