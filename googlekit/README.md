# GoogleKit: Gemini Live API & Live Translate Platform

**GoogleKit** is a real-time voice platform and e-commerce support assistant built on **Google's Gemini Live API** (`gemini-3.1-flash-live-preview` & `gemini-3.5-live-translate-preview`).

---

## 1. Capabilities

### 1.1 Live Agent (`gemini-3.1-flash-live-preview`)
- Acts as a conversational voice assistant.
- Listens, reasons, and executes function calls via MCP tools.
- Real-time speech-to-speech interaction with `responseModalities: ["AUDIO"]`.

### 1.2 Live Translate (`gemini-3.5-live-translate-preview`)
- Continuous stream processing for voice-to-voice translation between 70+ languages.
- Translates spoken audio in real-time as the user speaks.
- Configurable `targetLanguageCode` (e.g. `pl`, `es`, `hi`, `de`, `ja`) and `echoTargetLanguage` toggle.

---

## 2. Directory Structure

```
googlekit/
├── src/
│   ├── index.ts              # Ingress Worker (routing & DO handoff)
│   ├── callSession.ts        # GoogleKitCallSession Durable Object
│   ├── conference.ts         # SupportConference 3-way call bridging DO
│   ├── domain/
│   │   └── ports.ts          # Clean Architecture domain interfaces
│   ├── gemini/
│   │   └── liveClient.ts     # Gemini Live API BidiGenerateContent WebSocket client
│   ├── mcp/
│   │   └── tools.ts          # MCP tool declarations & handlers
│   ├── memory/
│   │   └── userMemory.ts     # UserMemory DO (persistent history by phone)
│   └── schema/
│       ├── blogger.ts        # Blogger JSON-LD extraction & @id path resolution
│       └── validator.ts      # Schema.org Product, ProductGroup & Offer validator
├── docs/
│   ├── ARCHITECTURE.md       # Architecture overview
│   ├── GEMINI_LIVE_API.md    # Gemini Live API configuration
│   └── LIVE_TRANSLATE.md     # Live Translate model setup & supported languages
└── wrangler.jsonc            # Cloudflare Worker configuration
```
