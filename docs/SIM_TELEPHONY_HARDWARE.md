# Handling Multiple Independent Callers & Human Support Agent Call Forwarding

This guide explains how to handle **hundreds of simultaneous phone calls with distinct AI responses per caller**, and how to **forward or merge calls to human support agents**.

---

## 1. Handling Multiple Concurrent Callers with Independent Responses

### How Dial-a-Repo Keeps Responses 100% Isolated:
1. **Cloudflare Durable Objects Isolation:**
   Every incoming phone call generates a unique `call_id` from xAI/SignalWire. The Cloudflare Worker creates an **isolated `CallSession` Durable Object instance** for each `call_id`:
   ```ts
   const stub = env.CALL_SESSION.get(env.CALL_SESSION.idFromName(callId));
   ctx.waitUntil(stub.run(callId));
   ```
   * **Result:** Caller A talking about `facebook/react` and Caller B talking about `torvalds/linux` at the exact same second run in completely isolated memory contexts with zero state leakage.

2. **Tokio Async Isolation in Rust (`rust/src/main.rs`):**
   In the Rust implementation, every incoming call spawns an independent Tokio thread/task:
   ```rust
   tokio::spawn(async move {
       let client = XaiClient::new(api_key);
       client.run_session(call_id).await;
   });
   ```
   * **Result:** Each call maintains its own WebSocket connection, conversation memory, and AI response stream.

---

## 2. Call Forwarding & Merging with Human Support Agents

When an AI voice agent determines that a caller needs human assistance, you can execute **Call Transfer** or **3-Way Conference Merging**.

```
+-----------------------------------------------------------------------------------+
| CASE 1: SIP REFER (Blind Transfer to Human Agent)                                |
| Caller calls AI ---> AI detects need for human ---> Sends SIP REFER to PSTN       |
| Carrier bridges Caller directly to Human Support Agent phone number (+18001234567)|
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
| CASE 2: Warm 3-Way Conference Transfer (AI + Caller + Human Support Agent)        |
| 1. AI holds Caller on line                                                        |
| 2. AI dials Human Support Agent phone number                                      |
| 3. AI introduces context ("I have John on the line asking about repo react")      |
| 4. Software Audio Mixer bridges all 3 parties into a merged conference call        |
+-----------------------------------------------------------------------------------+
```

---

## 3. Implementation Patterns for Support Escalation

### Method 1: SIP `REFER` (Carrier-Level Call Forwarding)
The server sends a SIP `REFER` header to the telephony gateway (SignalWire/Asterisk), instructing the carrier to dial the support agent and drop the AI leg:

```text
REFER sip:+18001234567@sip.signalwire.com SIP/2.0
Referred-By: <sip:ai-agent@dial-a-repo>
Refer-To: <sip:+18005550199@pstn.carrier.com>
```

### Method 2: Warm Transfer via Audio Mixing in Rust
Using the PCM audio mixing function (`mix_pcm_samples`), the Rust server can bridge the AI Voice Agent, the Caller, and the Human Support Agent into a single merged call, allowing the AI to introduce the caller to the human agent before handing over control.
