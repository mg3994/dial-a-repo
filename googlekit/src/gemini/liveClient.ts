/**
 * Gemini Live API & Live Translate Client over BidiGenerateContent WebSocket.
 * Connects to Gemini Live API (`gemini-3.1-flash-live-preview` or `gemini-3.5-live-translate-preview`).
 */

export interface GeminiLiveOptions {
  apiKey: string;
  model: "gemini-3.1-flash-live-preview" | "gemini-3.5-live-translate-preview";
  mode: "agent" | "translate";
  targetLanguageCode?: string;
  echoTargetLanguage?: boolean;
  voiceName?: string;
  tools?: any[];
  systemInstruction?: string;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;

  async connect(options: GeminiLiveOptions, handlers: {
    onAudioOutput?: (base64Audio: string) => void;
    onInputTranscript?: (text: string, lang?: string) => void;
    onOutputTranscript?: (text: string, lang?: string) => void;
    onToolCall?: (callId: string, name: string, args: any) => void;
  }): Promise<WebSocket> {
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(options.apiKey)}`;

    const resp = await fetch(wsUrl, {
      headers: {
        Upgrade: "websocket",
      },
    });

    const ws = resp.webSocket;
    if (!ws) throw new Error("Could not upgrade WebSocket for Gemini Live API");

    ws.accept();
    this.ws = ws;

    // Send BidiGenerateContentSetup message
    const setupMessage: any = {
      setup: {
        model: `models/${options.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    };

    if (options.mode === "translate") {
      setupMessage.setup.generationConfig.translationConfig = {
        targetLanguageCode: options.targetLanguageCode ?? "pl",
        echoTargetLanguage: options.echoTargetLanguage ?? true,
      };
    } else {
      if (options.voiceName) {
        setupMessage.setup.generationConfig.speechConfig = {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voiceName } },
        };
      }
      if (options.tools && options.tools.length > 0) {
        setupMessage.setup.tools = [{ functionDeclarations: options.tools }];
      }
      if (options.systemInstruction) {
        setupMessage.setup.systemInstruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }
    }

    ws.send(JSON.stringify(setupMessage));

    ws.addEventListener("message", (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (!msg.serverContent) return;

        const content = msg.serverContent;
        if (content.inputTranscription?.text) {
          handlers.onInputTranscript?.(content.inputTranscription.text, content.inputTranscription.languageCode);
        }
        if (content.outputTranscription?.text) {
          handlers.onOutputTranscript?.(content.outputTranscription.text, content.outputTranscription.languageCode);
        }

        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData?.data) {
              handlers.onAudioOutput?.(part.inlineData.data);
            }
            if (part.functionCall) {
              handlers.onToolCall?.(part.functionCall.id, part.functionCall.name, part.functionCall.args);
            }
          }
        }
      } catch {
        // ignore malformed
      }
    });

    return ws;
  }

  sendAudioChunk(base64Pcm16k: string): void {
    if (!this.ws) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm;rate=16000",
              data: base64Pcm16k,
            },
          ],
        },
      })
    );
  }

  sendToolResponse(callId: string, name: string, response: any): void {
    if (!this.ws) return;
    this.ws.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: [
            {
              response: { output: response },
              id: callId,
            },
          ],
        },
      })
    );
  }
}
