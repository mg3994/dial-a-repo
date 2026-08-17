# Dial-a-Repo Architecture & Technical Deep Dive

This document provides a comprehensive breakdown of how the **Dial-a-Repo** codebase works, how phone calls are routed and handled, and how the various external services and internal components interact to enable real-time voice conversations about GitHub repositories.

---

## 1. System Architecture Overview

Dial-a-Repo allows a user to pick up a regular telephone, dial a phone number, and speak in real-time with an AI voice agent about any public GitHub repository.

```
+------------------+         SIP (TLS Audio)          +-----------------------+
|  User's Phone    | --------------------------------> | SignalWire SIP Gateway|
+------------------+                                  +-----------------------+
                                                                  |
                                                       SIP (TLS Audio)
                                                                  v
+------------------+      Signed Webhook (HTTPS)       +-----------------------+
| Cloudflare Worker| <-------------------------------- | xAI Voice Agent API   |
| (`src/index.ts`) |                                   | (Telephony + AI)      |
+------------------+                                   +-----------------------+
         |                                                        ^
         | Dispatches call_id                                     |
         v                                                        |
+----------------------------------+   Realtime WebSocket         |
| CallSession Durable Object       | <----------------------------+
| (`src/callSession.ts`)           | (Control events, JSON transcripts, tool calls)
+----------------------------------+
         |
         | Calls tool RPCs
         +---------------------------------------+
         |                                       |
         v                                       v
+------------------------+             +----------------------------------+
| Fast Digest            |             | RepoWorkspace Durable Object     |
| (`src/repoTool.ts`)    |             | (`src/repoWorkspace.ts`)        |
| - GitHub REST API      |             | - Persistent SQLite VFS          |
| - gitingest.com        |             | - @cloudflare/computer           |
+------------------------+             | - isomorphic-git (Pure JS Git)   |
                                       +----------------------------------+
```

---

## 2. Telephony & SIP Signal Forwarding

### 2.1 How the Call Reaches xAI
1. **Phone Number Provisioning:** The phone number (`+1 (607) 365-4321`) is owned and hosted on **SignalWire**.
2. **SIP Forwarding:** SignalWire uses a SIP Gateway resource configured to forward all inbound audio and call signals over SIP via TLS directly to xAI's fixed SIP endpoint:
   ```text
   sip:+16073654321@sip.voice.x.ai;transport=tls
   ```
3. **Bring-Your-Own-Trunk (BYO Trunk):** xAI receives the incoming SIP call and matches the destination phone number against registered `byo_trunk` phone numbers in xAI's system.
4. **Zero Raw Audio Handling by Cloudflare:** The actual voice audio stream (RTP over TLS) flows **directly between the caller's phone network, SignalWire, and xAI's SIP servers**. Raw PCM or Opus audio bytes **never** pass through the Cloudflare Worker or Durable Objects.

---

## 3. Inbound Webhook & Routing (`src/index.ts` & `src/webhook.ts`)

When xAI receives an incoming SIP call, it triggers an HTTP webhook request to notify the Cloudflare Worker.

### 3.1 Webhook Verification (`src/webhook.ts`)
* **Endpoint:** `POST /xai/incoming`
* **Security:** xAI signs webhooks using the [Standard Webhooks](https://www.standardwebhooks.com) specification.
* **Headers Verified:**
  * `webhook-id`: Unique message identifier.
  * `webhook-timestamp`: Unix timestamp (requests older than 5 minutes are rejected to prevent replay attacks).
  * `webhook-signature`: Space-separated list of signatures formatted as `v1,<base64_hmac>`.
* **Signature Algorithm:**
  1. The secret (`XAI_WEBHOOK_SECRET`) is stripped of its `whsec_` prefix and decoded from Base64.
  2. A signed content string is constructed: `${webhook-id}.${webhook-timestamp}.${raw_body}`.
  3. An HMAC-SHA256 signature is calculated using Web Crypto API (`crypto.subtle.sign`).
  4. Constant-time comparison (`timingSafeEqual`) checks if the calculated signature matches any signature candidate in the `webhook-signature` header.

### 3.2 Handoff to Durable Object
When a verified `realtime.call.incoming` event is received:
1. The Worker extracts `call_id` from `event.data.call_id`.
2. The Worker obtains a stub for the `CallSession` Durable Object keyed by `call_id`:
   ```ts
   const stub = env.CALL_SESSION.get(env.CALL_SESSION.idFromName(callId));
   ctx.waitUntil(stub.run(callId));
   ```
3. The Worker immediately responds with HTTP `200 OK` so xAI does not retry the webhook.
4. `ctx.waitUntil()` keeps the background task alive long enough for the Durable Object execution to kick off.

---

## 4. Real-time Conversation Lifecycle & Latency Performance (`src/callSession.ts`)

### 4.1 Is it Full-Duplex or do callers have to wait?
**Yes, it is true full-duplex.**

* **Direct Audio Stream:** Audio flows over full-duplex SIP (RTP/TLS) directly between the telephony network and xAI's server-side audio pipeline.
* **Server-side Voice Activity Detection (Server VAD):** Configured via `{ turn_detection: { type: "server_vad" } }`. The model listens continuously even while speaking. If the caller starts talking or interrupts mid-sentence, xAI immediately truncates its own audio playback and shifts turn control back to the caller.
* **Latency Profile:**
  * **Normal conversational turns (no tool call):** Very low latency (~300-800ms) because xAI streams output audio deltas as soon as token generation begins.
  * **Turns requiring tool calls (`load_repo` or `repo_file`):** Latency includes the time taken to execute the tool RPC (GitHub API / gitingest / git clone) over the network. To minimize perceived latency, `BASE_INSTRUCTIONS` tells the assistant to speak a brief filler like *"Let me pull that up..."* before invoking tool RPCs.

---

## 5. Keypad Inputs (DTMF) & Language Selection (e.g. Press 1 for Hindi, Press 2 for English)

### 5.1 Spoken Multilingual Support
xAI's underlying voice model automatically recognizes and responds in whichever language the caller speaks (e.g., Hindi, English, Spanish, French). No code changes are strictly needed for natural spoken language switching.

### 5.2 Keypad (DTMF) Input Integration
If you want explicit keypad menu navigation (e.g., "Press 1 for Hindi, Press 2 for English"):

1. **Option A: Spoken Speech Recognition (Recommended & Native to xAI Realtime)**
   Update `GREETING` and `BASE_INSTRUCTIONS` in `src/callSession.ts`:
   ```ts
   const GREETING = "Welcome to Dial-a-Repo. Say 1 or Hindi for Hindi, or say 2 or English for English.";
   ```
   When the caller says "1" or "Hindi", xAI's Grok transcription captures the word or digit, and the system prompt instructs the assistant to switch its response language and voice tone accordingly via `session.update`.

2. **Option B: SIP In-band DTMF Telephony Signals**
   SignalWire forwards SIP INFO or RFC 2833 DTMF digit events over SIP to xAI.
   When xAI surface DTMF events on the WebSocket:
   ```ts
   ws.addEventListener("message", (msg) => {
     const evt = JSON.parse(msg.data);
     if (evt.type === "conversation.item.input_dtmf") {
       const digit = evt.digit; // '1' or '2'
       if (digit === "1") {
         ws.send(JSON.stringify({
           type: "session.update",
           session: { instructions: BASE_INSTRUCTIONS + "\nAlways speak and respond in Hindi." }
         }));
       }
     }
   });
   ```

---

## 6. Tool Integration & Repository Inspection

The system provides two levels of repository inspection:

### 6.1 Fast Digest (`src/repoTool.ts`)
When `load_repo` is called:
1. **Name Resolution:**
   * If input is an exact `owner/repo` or GitHub URL (parsed by `parseRepoSpec`), it fetches metadata directly.
   * If input is a bare name (e.g. `"react"`, `"vite"`), it calls `searchRepoByName` using GitHub's REST API (`GET /search/repositories?q={name}+in:name+fork:false&sort=stars&order=desc`). Candidates below `MIN_STARS_FOR_FUZZY_MATCH` (500 stars) without an exact name match are rejected to avoid hallucinating incorrect low-star repos.
2. **Parallel Fetching:**
   * **GitHub REST API (`GET https://api.github.com/repos/{owner}/{repo}`):** Fetches metadata (stars, language, default branch, description, license, size).
   * **gitingest API (`GET https://gitingest.com/api/{owner}/{repo}?max_file_size=50`):** Fetches a pre-processed digest of the file tree and contents.
3. **Independent Content Truncation:**
   * File tree capped at `MAX_TREE_CHARS` (2,000 chars).
   * File contents capped at `MAX_CONTENT_CHARS` (10,000 chars).
   * Separate capping ensures large file trees don't starve actual file content from reaching the AI context.

---

### 6.2 Deep Git Tooling (`src/repoWorkspace.ts` & `@cloudflare/computer`)

For deep analysis (`repo_recent_commits`, `repo_file`, `repo_diff`), a flat digest is insufficient. Dial-a-Repo uses a second Durable Object class: **`RepoWorkspace`**.

#### Architectural Highlights of `RepoWorkspace`:
* **Cached Per Repository:** `RepoWorkspace` instances are keyed by repo slug (`owner/repo`), **not** by `call_id`. If multiple callers ask about `cloudflare/computer`, they share the same cached git clone in the Durable Object storage.
* **No Containers / Zero Shell:** Instead of requiring a full Linux container or Docker instance, Dial-a-Repo uses `@cloudflare/computer` with its **pure JavaScript git client** ([`isomorphic-git`](https://isomorphic-git.org/)).
* **SQLite-backed VFS:** Storage is managed via `@platformatic/vfs` over Cloudflare Durable Objects' native SQLite storage layer (`ctx.storage`).
* **Pure Worker Compatibility:** Runs under standard Cloudflare Workers with `nodejs_compat` enabled—no experimental flags or special runtime loaders required.

#### Git Operations & Safeguards:
1. **Size Guard (`MAX_REPO_SIZE_KB = 200,000`):** Rejects cloning repos over ~200 MB live on a phone call.
2. **Shallow Clone (`CLONE_DEPTH = 200`):** Clones with `--depth 200` and `--single-branch` for fast cloning over HTTP.
3. **Freshness Policy (`REFRESH_AFTER_MS = 15 min`):** Subsequent calls within 15 minutes reuse the existing clone instantly. Calls after 15 minutes execute a fast-forward `pull`.
4. **Git RPC Methods:**
   * `recentCommits(limit, sinceDays)`: Runs `git.log()`. Walks commits and formats author, date, message, and full 40-character commit hashes.
   * `fileAt(path, ref)`: Resolves ref via `git.revParse()`, reads object via `git.catFile()`, and decodes UTF-8 content (capped at 20,000 chars).
   * `diffRefs(from, to, path)`: Generates unified diffs via `git.diff()` (capped at 8,000 chars).

---

## 7. Summary of Protocols, APIs, & Dependencies

| Layer / Mechanism | Tech / Protocol | Endpoint / Library | Purpose |
| :--- | :--- | :--- | :--- |
| **Inbound Telephony** | SIP over TLS | `sip:+16073654321@sip.voice.x.ai;transport=tls` | Forwards phone calls from SignalWire to xAI. |
| **Call Webhook** | HTTPS / Standard Webhooks | `POST /xai/incoming` | xAI notifies Cloudflare Worker of inbound call. |
| **Webhook Auth** | HMAC-SHA256 | Web Crypto API (`crypto.subtle`) | Verifies webhook payload authenticity via `XAI_WEBHOOK_SECRET`. |
| **Realtime AI Bridge** | WebSocket over HTTPS | `wss://api.x.ai/v1/realtime?call_id=...` | Bidirectional control connection between Durable Object & xAI Voice API. |
| **Speech-to-Text / VAD**| Grok Transcribe & Server VAD | xAI Realtime Engine | Speech recognition & automatic conversational turn-taking / interruption detection. |
| **Text-to-Speech** | xAI Voice (`celeste`) | xAI Realtime Engine | Real-time audio synthesis sent directly to caller over SIP. |
| **Repo Metadata** | REST / HTTPS | `https://api.github.com` | Fetches repo stats & searches for bare repo names. |
| **Repo Digest** | REST / HTTPS | `https://gitingest.com/api` | Obtains condensed file tree and content snapshot. |
| **Virtual Filesystem** | SQLite VFS | `@cloudflare/computer` + `@platformatic/vfs` | Provides persistent filesystem storage inside Cloudflare Durable Objects. |
| **Git Engine** | Pure JavaScript Git | `isomorphic-git` | Executes git clone, log, cat-file, and diff inside VFS without containers or shell. |
