import { DurableObject } from "cloudflare:workers";
import { GeminiLiveClient } from "./gemini/liveClient";
import { ECOMMERCE_MCP_TOOLS, executeMcpTool } from "./mcp/tools";

export class GoogleKitCallSession extends DurableObject<Env> {
  private transcript: Array<{ role: string; text: string }> = [];

  async run(callId: string, callerPhone: string, mode: "agent" | "translate" = "agent", targetLang = "pl"): Promise<void> {
    const client = new GeminiLiveClient();

    try {
      await client.connect(
        {
          apiKey: this.env.GEMINI_API_KEY ?? "test_key",
          model: mode === "translate" ? "gemini-3.5-live-translate-preview" : "gemini-3.1-flash-live-preview",
          mode,
          targetLanguageCode: targetLang,
          echoTargetLanguage: true,
          tools: mode === "agent" ? ECOMMERCE_MCP_TOOLS : undefined,
          systemInstruction: "You are an Ecommerce Support Agent powered by Gemini Live API. Respond politely in speech.",
        },
        {
          onInputTranscript: (text) => this.transcript.push({ role: "caller", text }),
          onOutputTranscript: (text) => this.transcript.push({ role: "gemini", text }),
          onToolCall: async (fnId, name, args) => {
            const result = await executeMcpTool({ name, arguments: args });
            client.sendToolResponse(fnId, name, result);
          },
        }
      );
    } catch (err) {
      console.error("Gemini Live connection error:", err);
    }
  }
}
