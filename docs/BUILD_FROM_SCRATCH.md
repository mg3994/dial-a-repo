# Building a Real-time AI Voice Agent from Scratch: Blueprint & Architecture

This guide explains how to design and build a production-ready real-time AI voice agent from scratch on Cloudflare Workers and Durable Objects.

---

## 1. High-Level Blueprint & Core Components

To build a telephony voice agent from scratch, you need four essential layers:

```
+-----------------------------------------------------------------------------------+
| 1. TELEPHONY LAYER (SignalWire)                                                   |
|    - Purchases phone numbers                                                      |
|    - Forwards PSTN voice calls over SIP/TLS to xAI                                |
+-----------------------------------------------------------------------------------+
                                       | SIP/TLS Audio Stream
                                       v
+-----------------------------------------------------------------------------------+
| 2. REAL-TIME SPEECH & AI LAYER (xAI Voice Agent API)                             |
|    - Speech-to-Text (Grok Transcribe) & Text-to-Speech (Celeste/Ara)               |
|    - Server Voice Activity Detection (Server VAD) & interruption handling         |
|    - Emits signed HTTP Webhook to Cloudflare on incoming call                     |
|    - Exposes realtime WebSocket endpoint for control & tool execution             |
+-----------------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   | Inbound Webhook                       | Realtime WebSocket
                   v                                       v
+--------------------------------------+   +----------------------------------------+
| 3. INGRESS WORKER (`src/index.ts`)   |   | 4. CALL SESSION DO (`callSession.ts`)  |
|    - Standard Webhooks HMAC auth     |   |    - Long-lived WebSocket bridge       |
|    - Hands off call_id to DO         |   |    - Handles tool calls & RPCs         |
+--------------------------------------+   +----------------------------------------+
```

---

## 2. Recommended Directory Structure for a Custom Project

When designing a clean codebase from scratch, organize code into modular, single-responsibility files:

```
my-voice-agent/
├── src/
│   ├── index.ts           # Worker entrypoint (HTTP routing & webhook security)
│   ├── webhook.ts         # HMAC-SHA256 signature verification logic
│   ├── callSession.ts     # Durable Object: Real-time WebSocket session & tool dispatch
│   └── tools/             # Custom tools domain logic
│       ├── weatherTool.ts # Example custom tool
│       └── database.ts    # Database RPCs / state persistence
├── docs/
│   ├── ARCHITECTURE.md    # System architecture deep dive
│   ├── BUILD_TUTORIAL.md  # Step-by-step code walkthrough for building from scratch
│   ├── SIGNALWIRE.md      # Telephony configuration guide
│   ├── PRICING.md         # Cost analysis & quotas
│   └── FUNDAMENTALS.md    # Real-time engineering fundamentals
├── wrangler.jsonc         # Cloudflare Worker & Durable Object bindings
├── package.json           # Dependencies
└── tsconfig.json          # TypeScript configuration
```

---

## 3. Step-by-Step System Design

### Step 1: Ingress Webhook & Security (`src/webhook.ts`)
* Always verify the `webhook-signature` header using HMAC-SHA256 before processing an incoming call request.
* Prevent replay attacks by checking `webhook-timestamp` freshness (< 5 minutes).

### Step 2: Handoff to Durable Object (`src/index.ts`)
* A standard Worker request budget cannot sustain multi-minute phone calls.
* Pass `call_id` to a Durable Object (`CallSession`) and call `ctx.waitUntil(stub.run(callId))`.
* Immediately return HTTP `200 OK` to xAI so the webhook is acknowledged.

### Step 3: Real-time WebSocket Bridge (`src/callSession.ts`)
* Connect outbound to `https://api.x.ai/v1/realtime?call_id=...` with header `Upgrade: websocket`.
* Send `session.update` with voice persona instructions, server VAD enabled, and tool JSON schemas.
* Play scripted greetings using `force_message` items.

### Step 4: Custom Tool Execution Loop
* Listen for `response.function_call_arguments.done` over the WebSocket.
* Execute local RPC calls (e.g. database query, API fetch).
* Send `conversation.item.create` containing `type: "function_call_output"`.
* Send `response.create` to tell the AI engine to speak the result.

---

## 4. Next Steps & Detailed Code Guide

For complete, copy-pasteable TypeScript code snippets and exact setup commands to build this step-by-step, see **[BUILD_TUTORIAL.md](./BUILD_TUTORIAL.md)**.
