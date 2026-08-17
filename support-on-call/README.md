# Support-on-Call: Ecommerce AI Voice Agent & Telephony Platform

**Support-on-Call** is a real-time AI voice customer support solution built on Cloudflare Workers, Cloudflare Durable Objects, SignalWire SIP Telephony, xAI Voice Agent API, and Schema.org / Blogger JSON-LD product feeds.

---

## Features

1. **Multi-Caller Concurrency & State Isolation:**
   - Hundreds of concurrent phone calls are handled simultaneously.
   - Each call runs in an isolated `SupportCallSession` Durable Object instance with 100% independent state and conversation context.

2. **Persistent User History & Mid-Call Drop Recovery:**
   - `UserMemory` Durable Objects key customer history by phone number (`from` SIP header).
   - If a call drops midway or a user calls back later, the AI agent remembers past orders, support tickets, preferred language, and call transcripts.

3. **Blogger JSON-LD & Schema.org Deep Resolver:**
   - `BloggerDataService` extracts `Product`, `ProductGroup`, and `Business` schemas from Blogger post feeds with or without script tags.
   - Recursively resolves `@id` references, deep merges property overrides, and outputs clean unified `@graph` documents.

4. **MCP (Model Context Protocol) Tools:**
   - Real-time tool execution for order tracking, payment verification, refund triggering, and SMS notifications.

5. **Hindi & English Language Selection:**
   - Automatic language prompt switching (Press/Say 1 for Hindi, Press/Say 2 for English) via DTMF and STT transcript detection.

6. **Human Support Agent Warm Merging & Quiet Standby Mode:**
   - Dials human support agents into a 3-way conference call (`SupportConference`).
   - AI assistant enters a quiet standby state while human agent and customer talk, and resumes automatically if the support agent drops off.
