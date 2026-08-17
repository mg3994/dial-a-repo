import { readWebhookHeaders, verifyWebhookSignature } from "../../src/webhook";

export { SupportCallSession } from "./callSession";
export { UserMemory } from "./memory/userMemory";
export { SupportConference } from "./conference";

interface IncomingCallEvent {
  type: string;
  data: {
    call_id: string;
    sip_headers?: Array<{ name: string; value: string }>;
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Ecommerce Support Voice Agent API", { headers: { "Content-Type": "text/plain" } });
    }

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
    const fromHeader = event.data.sip_headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";

    // Hand call session to SupportCallSession DO
    const stub = env.SUPPORT_CALL_SESSION.get(env.SUPPORT_CALL_SESSION.idFromName(callId));
    ctx.waitUntil(stub.run(callId, fromHeader));

    return new Response("ok", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
