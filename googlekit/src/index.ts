export { GoogleKitCallSession } from "./callSession";
export { UserMemory } from "./memory/userMemory";
export { SupportConference } from "./conference";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("GoogleKit Gemini Live API & Live Translate Platform", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (url.pathname === "/gemini/incoming" && request.method === "POST") {
      const body = await request.json<any>();
      const callId = body.call_id ?? `call_${Date.now()}`;
      const mode = body.mode ?? "agent";
      const targetLang = body.target_lang ?? "pl";

      const stub = env.GOOGLEKIT_CALL_SESSION.get(env.GOOGLEKIT_CALL_SESSION.idFromName(callId));
      ctx.waitUntil(stub.run(callId, body.phone ?? "", mode, targetLang));

      return new Response(JSON.stringify({ ok: true, callId }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
