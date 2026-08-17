# Support-on-Call Architecture Deep Dive

This document details the system architecture of the **Support-on-Call** ecommerce voice assistant.

```
+------------------+         SIP / TLS Audio          +-----------------------+
| Customer Phone   | --------------------------------> | SignalWire SIP Gateway|
+------------------+                                  +-----------------------+
                                                                  |
                                                       SIP / TLS Audio
                                                                  v
+------------------+      Signed Webhook (HTTPS)       +-----------------------+
| Cloudflare Worker| <-------------------------------- | xAI Voice Agent API   |
| (`src/index.ts`) |                                   | (Telephony + AI)      |
+------------------+                                   +-----------------------+
         |                                                        ^
         | Dispatches call_id + caller phone                      |
         v                                                        |
+----------------------------------+   Realtime WebSocket         |
| SupportCallSession DO            | <----------------------------+
| (`src/callSession.ts`)           | (Control events, MCP tool calls)
+----------------------------------+
    |                  |
    | Stores History   | Fetches Product Schemas
    v                  v
+----------------+   +------------------------------------+
| UserMemory DO  |   | BloggerDataService (`blogger.ts`)  |
| (Keyed by Tel) |   | - Extracts JSON-LD                 |
+----------------+   | - Resolves @id references          |
                     +------------------------------------+
```

---

## Key Subsystems

1. **`UserMemory` DO:** Keyed by caller phone number (`from` SIP header). Stores profile, active order ID, preferred language, and rolling call transcripts.
2. **`BloggerDataService`:** Parses JSON-LD product schemas, resolves relative or feed `@id` links, deep merges overrides, and assembles top-level `@graph` documents.
3. **`SupportConference` DO:** Manages 3-way conference bridging when escalating to human support agents. Transitions AI assistant into quiet standby mode while human agent speaks.
