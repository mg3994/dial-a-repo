# Gemini Live API Setup & Configuration Guide

This document explains how to configure the **Gemini Live API** (`BidiGenerateContent` WebSocket endpoint) for real-time voice streaming and tool execution.

---

## 1. WebSocket Endpoint

```text
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=YOUR_API_KEY
```

---

## 2. BidiGenerateContentSetup Message

Upon connecting, send a `setup` frame:

```json
{
  "setup": {
    "model": "models/gemini-3.1-flash-live-preview",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "inputAudioTranscription": {},
      "outputAudioTranscription": {},
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": {
            "voiceName": "Kore"
          }
        }
      }
    },
    "tools": [
      {
        "functionDeclarations": [
          {
            "name": "mcp_get_order_details",
            "description": "Fetches order tracking and status.",
            "parameters": {
              "type": "OBJECT",
              "properties": {
                "orderId": { "type": "STRING", "description": "Order ID" }
              }
            }
          }
        ]
      }
    ]
  }
}
```

---

## 3. Streaming PCM Audio Chunks

Audio input must be 16-bit PCM mono at 16kHz (little-endian), sent as Base64-encoded strings:

```json
{
  "realtimeInput": {
    "mediaChunks": [
      {
        "mimeType": "audio/pcm;rate=16000",
        "data": "<BASE64_PCM_DATA>"
      }
    ]
  }
}
```
