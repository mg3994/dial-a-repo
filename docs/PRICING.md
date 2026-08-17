# Dial-a-Repo Services Pricing, Quotas, and Free Tiers

This document details the pricing structures, free tier allocations, quotas, and billing rates for all external services and cloud infrastructure utilized by the **Dial-a-Repo** project.

---

## 1. Cloudflare (Workers, Durable Objects, & `@cloudflare/computer`)

Cloudflare powers the application logic, incoming webhook routing, call sessions, and persistent git workspace storage.

### 1.1 Cloudflare Workers & Durable Objects
Dial-a-Repo requires the **Cloudflare Workers Paid Plan** because Durable Objects are a paid feature.

| Feature / Resource | Free Plan | Paid Plan ($5/mo Base) | Additional Usage Rates (Paid) |
| :--- | :--- | :--- | :--- |
| **Worker Requests** | 100,000 / day | 10,000,000 / month included | $0.30 per 1,000,000 requests |
| **Durable Objects** | *Not available* | Included in $5/mo base | - |
| **DO Requests** | - | 1,000,000 / month included | $0.15 per 1,000,000 requests |
| **DO Duration (GB-s)** | - | 400,000 GB-s / month included | $12.50 per 1,000,000 GB-s |
| **DO Storage (SQLite/VFS)** | - | 1 GB included | $0.20 per GB / month |

### 1.2 `@cloudflare/computer` Costs
* `@cloudflare/computer` uses the native **Durable Objects SQLite Storage Layer**.
* Storage for cloned repositories in `RepoWorkspace` counts directly against your Durable Object Storage quota (1 GB included on Paid tier).
* Because git operations run via `isomorphic-git` inside standard Workers compute with `nodejs_compat`, there are **no additional container or Worker Loader charges** (unlike worker-shell container setups).

---

## 2. xAI Voice Agent & Realtime API

xAI provides the speech recognition (STT), real-time conversational LLM (Grok), text-to-speech (TTS), and SIP telephony bridge layer.

| Service / Capability | Free Allowance / Trial | Paid Rates | Quota / Limits |
| :--- | :--- | :--- | :--- |
| **xAI Console Credits** | ~$25 one-time API credit on new accounts | Pay-as-you-go | Subject to account credit balance |
| **Voice Agent Session** | None | ~$0.05 - $0.10 per call minute | Varies by voice model selection |
| **Audio Input (STT - Grok Transcribe)** | Included in audio pricing | ~$0.006 per minute | Real-time concurrent call limit |
| **Audio Output (TTS)** | Included in audio pricing | ~$0.024 per minute | Real-time audio streaming |
| **Text Tokens (Prompt & Output)** | - | Standard Grok API token rates ($2.00 / $10.00 per 1M tokens) | Rate limits apply based on account tier |

---

## 3. SignalWire (Telephony & SIP Gateway)

SignalWire provides the US phone number (`+1 607 365-4321`) and forwards PSTN phone calls over SIP/TLS to xAI.

| Item / Resource | Free Tier | Standard Paid Rate | Notes / Quotas |
| :--- | :--- | :--- | :--- |
| **Free Trial Credit** | $5.00 trial credit upon sign-up | - | Expires after trial period |
| **US Local Phone Number** | - | **$0.08 / month** | Per active phone number |
| **US Toll-Free Phone Number** | - | **$1.00 / month** | Optional alternative |
| **Inbound PSTN Voice Calls** | - | **$0.00255 / minute** | Inbound call routing |
| **SIP Trunking / Direct SIP** | - | **$0.0025 / minute** | SIP forwarding to `sip.voice.x.ai` |
| **E911 Emergency Fee** | - | $0.75 / month per number | Required for active US numbers |

*Estimated monthly cost for 100 minutes of incoming calls:*
* Phone Number: $0.08
* 100 Inbound Minutes: 100 x $0.00255 = $0.255
* Total SignalWire Cost: **~$0.34 / month**

---

## 4. GitHub REST & Search APIs

Used by `src/repoTool.ts` to fetch repository metadata and resolve bare project names (e.g., `"react"` -> `react/react`).

| Access Type | Free Allowance / Rate Limit | Cost | Notes |
| :--- | :--- | :--- | :--- |
| **Unauthenticated REST API** | **60 requests / hour** per IP | $0.00 | Shared IP bucket on Cloudflare Worker egress |
| **Unauthenticated Search API** | **10 requests / minute** per IP | $0.00 | Stricter limit for bare name lookups |
| **Authenticated API (Personal Access Token)** | **5,000 requests / hour** | $0.00 | Optional: set `GITHUB_TOKEN` to raise limit |

---

## 5. gitingest.com (Repo Digest API)

Used by `src/repoTool.ts` to fetch a pre-processed digest of file trees and contents.

| Item | Cost | Quota / Limits |
| :--- | :--- | :--- |
| **Public API (`https://gitingest.com/api`)** | **$0.00 (Free)** | Hosted open-source community service; no formal SLA |
| **Self-Hosted Instance** | Docker host cost | Optional fallback if hosted gitingest API experiences downtime |

---

## 6. Summary: Estimated Cost per 5-Minute Phone Call

| Service | Cost Components | Approx. Cost per 5-Min Call |
| :--- | :--- | :--- |
| **SignalWire** | $0.00255/min inbound voice | **~$0.013** |
| **xAI Voice Agent** | Realtime voice + token generation | **~$0.25 - $0.40** |
| **Cloudflare Workers & DO**| Worker invocation + DO compute time | **~$0.001** (Covered by $5/mo base) |
| **Total Estimated Cost** | - | **~$0.27 - $0.42 per call** |
