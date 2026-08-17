import { DurableObject } from "cloudflare:workers";
import { ECOMMERCE_MCP_TOOLS, executeMcpTool } from "./mcp/tools";

const GREETING_PROMPT =
  "Welcome to Store Support! For Hindi press or say 1. For English press or say 2. " +
  "नमस्ते! हिंदी के लिए 1 दबाएं या कहें। English के लिए 2 दबाएं या कहें।";

const ENGLISH_INSTRUCTIONS = `You are a polite, expert Ecommerce Customer Support Assistant.
Help callers with order status, returns, refunds, product schemas, and payment queries.
You have access to MCP tools to inspect live orders, check payments, and trigger notifications.
Keep spoken responses short, polite, and clear.`;

const HINDI_INSTRUCTIONS = `आप एक विनम्र और अनुभवी ई-कॉमर्स सपोर्ट असिस्टेंट हैं।
ग्राहकों की ऑर्डर स्थिति, रिटर्न, रिफंड, प्रोडक्ट जानकारी और भुगतान संबंधी प्रश्नों में मदद करें।
आपके पास लाइव ऑर्डर चेक करने और एसएमएस अपडेट भेजने के लिए MCP टूल्स उपलब्ध हैं।
हिंदी में स्पष्ट और संक्षिप्त उत्तर दें।`;

export class SupportCallSession extends DurableObject<Env> {
  private selectedLanguage: "hindi" | "english" = "english";
  private transcript: Array<{ role: string; text: string }> = [];

  async run(callId: string, callerPhone: string): Promise<void> {
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

    // 1. Initial Session Update with language selection instructions & MCP tools
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          voice: "celeste",
          instructions: `${ENGLISH_INSTRUCTIONS}\nFirst, listen if caller presses/says 1 for Hindi or 2 for English.`,
          turn_detection: { type: "server_vad" },
          tools: ECOMMERCE_MCP_TOOLS,
          audio: { input: { transcription: { model: "grok-transcribe" } } },
        },
      })
    );

    // 2. Initial Greeting Prompt
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "force_message",
          role: "assistant",
          content: [{ type: "output_text", text: GREETING_PROMPT }],
        },
      })
    );

    await new Promise<void>((resolve) => {
      ws.addEventListener("message", (msg: MessageEvent) => {
        try {
          const evt = JSON.parse(msg.data as string);

          // Listen for DTMF input or spoken language choice
          if (evt.type === "conversation.item.input_dtmf") {
            const digit = evt.digit;
            if (digit === "1") this.switchToLanguage(ws, "hindi", callerPhone);
            if (digit === "2") this.switchToLanguage(ws, "english", callerPhone);
          }

          if (evt.type === "response.function_call_arguments.done") {
            this.handleMcpToolCall(ws, evt);
          }

          if (evt.transcript) {
            this.transcript.push({ role: "caller", text: evt.transcript });
            if (evt.transcript.includes("1") || evt.transcript.toLowerCase().includes("hindi")) {
              this.switchToLanguage(ws, "hindi", callerPhone);
            } else if (evt.transcript.includes("2") || evt.transcript.toLowerCase().includes("english")) {
              this.switchToLanguage(ws, "english", callerPhone);
            }
          }
        } catch {
          // ignore malformed frames
        }
      });

      ws.addEventListener("close", () => {
        this.handleCallDrop(callId, callerPhone);
        resolve();
      });

      ws.addEventListener("error", () => {
        this.handleCallDrop(callId, callerPhone);
        resolve();
      });
    });
  }

  private switchToLanguage(ws: WebSocket, lang: "hindi" | "english", callerPhone: string): void {
    if (this.selectedLanguage === lang) return;
    this.selectedLanguage = lang;

    const instructions = lang === "hindi" ? HINDI_INSTRUCTIONS : ENGLISH_INSTRUCTIONS;

    ws.send(
      JSON.stringify({
        type: "session.update",
        session: { instructions },
      })
    );

    const ack = lang === "hindi" ? "नमस्ते! मैं आपकी क्या सहायता कर सकता हूँ?" : "Great! How can I help you today?";
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "force_message",
          role: "assistant",
          content: [{ type: "output_text", text: ack }],
        },
      })
    );

    // Save user language preference in persistent memory DO
    if (callerPhone) {
      const memoryStub = this.env.USER_MEMORY.get(this.env.USER_MEMORY.idFromName(callerPhone));
      this.ctx.waitUntil(memoryStub.saveLanguagePreference(callerPhone, lang));
    }
  }

  private handleMcpToolCall(ws: WebSocket, evt: any): void {
    const { name, call_id: fnCallId, arguments: argsJson } = evt;
    void (async () => {
      let output: string;
      try {
        const args = JSON.parse(argsJson ?? "{}");
        const res = await executeMcpTool({ name, arguments: args });
        output = JSON.stringify(res);
      } catch (err) {
        output = JSON.stringify({ error: String(err) });
      }

      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: fnCallId, output },
        })
      );
      ws.send(JSON.stringify({ type: "response.create" }));
    })();
  }

  /**
   * Persists call history, transcript, and drop status to Cloudflare storage upon call completion or mid-call drop.
   */
  private handleCallDrop(callId: string, callerPhone: string): void {
    if (!callerPhone) return;

    const memoryStub = this.env.USER_MEMORY.get(this.env.USER_MEMORY.idFromName(callerPhone));
    this.ctx.waitUntil(
      memoryStub.recordCall(callerPhone, {
        callId,
        timestamp: new Date().toISOString(),
        language: this.selectedLanguage,
        summary: `Support call ended. ${this.transcript.length} turns recorded.`,
        droppedMidway: true,
        transcript: this.transcript,
      })
    );
  }
}
