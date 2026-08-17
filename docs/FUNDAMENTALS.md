# Dial-a-Repo Fundamental Concepts & Engineering Guide

This document breaks down the **core engineering fundamentals** behind building real-time AI voice agents on serverless edge computing platforms.

---

## 1. Real-time Voice Architecture Fundamentals

### 1.1 Full-Duplex vs. Half-Duplex Audio
* **Half-Duplex (Walkie-Talkie Style):** Only one party can transmit at a time. The system must wait for the user to completely finish speaking, process the entire audio input, generate text, synthesize audio, and play it back.
* **Full-Duplex (Conversational Phone Call):** Both parties can transmit and receive audio simultaneously. Dial-a-Repo uses **full-duplex RTP/TLS audio streams** via SignalWire and xAI.

### 1.2 Voice Activity Detection (VAD) & Interruptions
In real-time voice agents, knowing *when* a caller starts and stops speaking is crucial.

```
Caller Speaking ----------> [Server VAD Sensor] ----------> Triggers Interruption
                                   |
                          Active Audio Output
                                   v
                      [Truncate AI Audio Stream]
```

* **Server VAD:** Dial-a-Repo enables `{ turn_detection: { type: "server_vad" } }`. xAI's real-time engine continuously analyzes incoming audio energy and spectral features.
* **Interruption Handling:** If the caller begins speaking while the AI is talking, Server VAD immediately fires a truncation event, cancels the current text-to-speech output, and transfers conversation context back to the caller.

---

## 2. Serverless Edge Computing & State Persistence

### 2.1 The Cloudflare Workers Request Model
Standard Cloudflare Workers are **stateless and short-lived**. They are designed to receive an HTTP request, process it within milliseconds, return a response, and shut down.
* *Problem:* A telephone call lasts several minutes and requires an open, long-lived WebSocket connection. A standard Worker background task (`waitUntil`) would time out.

### 2.2 Cloudflare Durable Objects (DO)
Durable Objects solve this by providing **stateful, single-instance compute actors** running on Cloudflare's edge:

```
+---------------------+          ctx.waitUntil()          +--------------------------+
| Cloudflare Worker   | --------------------------------> | CallSession DO Instance  |
| (`src/index.ts`)    |   Dispatches call_id stub        | (`src/callSession.ts`)   |
+---------------------+                                   +--------------------------+
  (Responds HTTP 200)                                       |
                                                            | Maintains WebSocket
                                                            v
                                                  +--------------------+
                                                  | xAI Realtime API   |
                                                  +--------------------+
```

1. **Identity & Singleton Guarantees:** Each Durable Object instance is identified by a unique key (e.g., `call_id` or `owner/repo`).
2. **Persistent Compute:** The DO instance stays alive for as long as its outbound WebSocket connection to xAI remains connected.
3. **Co-located Storage:** DO instances feature built-in transactional SQLite storage (`ctx.storage`), enabling local file storage without external database overhead.

---

## 3. Pure-JS Git & Virtual Filesystems (`@cloudflare/computer`)

### 3.1 Why traditional Git fails on serverless
Standard `git` requires:
* A POSIX operating system environment
* A native C/C++ `git` binary executable
* Access to a local file system disk

Serverless edge workers do not have access to native binary execution (`/bin/sh` or native `git`).

### 3.2 The `@cloudflare/computer` Solution
Dial-a-Repo uses `@cloudflare/computer` to run Git operations **purely in JavaScript**:

```
+-------------------------------------------------------------------------+
|                      RepoWorkspace Durable Object                       |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   | isomorphic-git (Pure JS Git Implementation)                     |   |
|   | - Parses HTTP smart protocol & packfiles in WebAssembly/JS      |   |
|   +-----------------------------------------------------------------+   |
|                                    |                                    |
|                                    v                                    |
|   +-----------------------------------------------------------------+   |
|   | @platformatic/vfs                                               |   |
|   | Virtual Filesystem Abstraction Layer                            |   |
|   +-----------------------------------------------------------------+   |
|                                    |                                    |
|                                    v                                    |
|   +-----------------------------------------------------------------+   |
|   | Durable Object SQLite Storage (`ctx.storage`)                    |   |
|   | Encapsulated POSIX-like blocks in SQLite                        |   |
|   +-----------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

* **Zero Containers:** Eliminates container cold starts and worker loader overhead.
* **Persistent Cache:** Once cloned into the DO's SQLite storage, any future call querying the same repository reuses the local clone instantly.

---

## 4. Webhook Security Fundamentals

Inbound webhooks are public HTTP endpoints (`POST /xai/incoming`). Without signature verification, anyone could forge incoming calls.

### 4.1 Standard Webhooks HMAC-SHA256 Flow
1. **Timestamp Freshness Guard:** Verifies `webhook-timestamp`. Requests older than 5 minutes are rejected to prevent **replay attacks**.
2. **Canonical Signed Payload:** Reconstructs the exact message signature string: `${webhook-id}.${webhook-timestamp}.${raw_body}`.
3. **HMAC Calculation:** Uses Web Crypto API (`crypto.subtle.sign`) with the shared secret (`XAI_WEBHOOK_SECRET`).
4. **Timing-Safe Comparison:** Uses constant-time bitwise operations (`timingSafeEqual`) to prevent **side-channel timing attacks**.

---

## 5. Tool Calling Lifecycle in Streaming Real-time Voice

When a caller asks a complex question (e.g., *"What changed in the last 3 commits?"*):

```
Caller: "What changed recently in octocat/Hello-World?"
   |
   v
[xAI Realtime API] detects intent and emits `response.function_call_arguments.done`
   |
   | JSON over WebSocket { name: "repo_recent_commits", args: { repo: "octocat/Hello-World", limit: 3 } }
   v
[CallSession DO] receives event
   |
   | RPC call to RepoWorkspace DO
   v
[RepoWorkspace DO] executes isomorphic-git `git.log()` against SQLite VFS
   |
   | Returns commit summary JSON
   v
[CallSession DO] sends `conversation.item.create` (function_call_output)
   |
   | Sends `response.create` frame over WebSocket
   v
[xAI Realtime API] synthesizes spoken response and streams audio to caller over SIP
```
