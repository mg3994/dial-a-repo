# Step-by-Step Tutorial: Building a Voice Agent Codebase from Scratch

This step-by-step tutorial provides copy-pasteable TypeScript code files to build your own real-time voice agent from scratch on Cloudflare Workers and xAI.

---

## File 1: `wrangler.jsonc` (Cloudflare Worker & Durable Object Config)

Create `wrangler.jsonc` in your project root:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-custom-voice-agent",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-08",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      {
        "name": "CALL_SESSION",
        "class_name": "CallSession"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["CallSession"]
    }
  ]
}
```

---

## File 2: `src/webhook.ts` (Webhook Authentication)

Create `src/webhook.ts` to verify incoming HMAC-SHA256 signatures from xAI:

```ts
export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function readWebhookHeaders(request: Request): WebhookHeaders {
  return {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  };
}

export async function verifyWebhookSignature(
  body: string,
  headers: WebhookHeaders,
  secret: string
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  // Replay protection: reject requests older than 5 minutes
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signedContent = `${headers.id}.${headers.timestamp}.${body}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));

  const candidates = headers.signature.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
  return candidates.includes(expected);
}
```

---

## File 3: `src/index.ts` (Worker Entrypoint)

Create `src/index.ts` to receive webhooks and dispatch to the `CallSession` Durable Object:

```ts
import { readWebhookHeaders, verifyWebhookSignature } from "./webhook";
export { CallSession } from "./callSession";

interface IncomingCallEvent {
  type: string;
  data: { call_id: string };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/xai/incoming" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    const body = await request.text();
    const headers = readWebhookHeaders(request);
    const valid = await verifyWebhookSignature(body, headers, env.XAI_WEBHOOK_SECRET);

    if (!valid) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(body) as IncomingCallEvent;
    if (event.type !== "realtime.call.incoming") {
      return new Response("ok", { status: 200 });
    }

    const callId = event.data.call_id;
    const stub = env.CALL_SESSION.get(env.CALL_SESSION.idFromName(callId));

    // Hand off execution to Durable Object and return 200 immediately
    ctx.waitUntil(stub.run(callId));
    return new Response("ok", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
```

---

## File 4: `src/callSession.ts` (Durable Object WebSocket Session)

Create `src/callSession.ts` to manage the real-time AI conversation and tool calling loop:

```ts
import { DurableObject } from "cloudflare:workers";

export class CallSession extends DurableObject<Env> {
  async run(callId: string): Promise<void> {
    const wsUrl = `https://api.x.ai/v1/realtime?call_id=${encodeURIComponent(callId)}`;

    const resp = await fetch(wsUrl, {
      headers: {
        Upgrade: "websocket",
        Authorization: `Bearer ${this.env.XAI_API_KEY}`,
      },
    });

    const ws = resp.webSocket;
    if (!ws) return;

    ws.accept();

    // 1. Send session configuration
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          voice: "celeste",
          instructions: "You are a helpful phone assistant. Keep responses short and conversational.",
          turn_detection: { type: "server_vad" },
          tools: [
            {
              type: "function",
              name: "get_current_time",
              description: "Returns the current UTC server time.",
              parameters: { type: "object", properties: {} },
            },
          ],
        },
      })
    );

    // 2. Play verbatim greeting
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "force_message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello! How can I help you today?" }],
        },
      })
    );

    // 3. Event Loop
    ws.addEventListener("message", (msg: MessageEvent) => {
      try {
        const evt = JSON.parse(msg.data as string);
        if (evt.type === "response.function_call_arguments.done") {
          this.handleToolCall(ws, evt);
        }
      } catch {
        // Ignore malformed frames
      }
    });
  }

  private handleToolCall(ws: WebSocket, evt: any): void {
    const { name, call_id: fnCallId } = evt;
    let output = JSON.stringify({ result: "Unknown tool" });

    if (name === "get_current_time") {
      output = JSON.stringify({ time: new Date().toISOString() });
    }

    // Send tool result back to AI model
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: fnCallId, output },
      })
    );
    ws.send(JSON.stringify({ type: "response.create" }));
  }
}
```

---

## Deployment Instructions

```bash
# 1. Install dependencies
npm install cloudflare wrangler typescript

# 2. Generate configuration types
npx wrangler types

# 3. Put worker secrets
npx wrangler secret put XAI_API_KEY
npx wrangler secret put XAI_WEBHOOK_SECRET

# 4. Deploy live to Cloudflare
npx wrangler deploy
```
