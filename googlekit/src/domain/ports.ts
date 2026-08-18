/**
 * Domain Ports for GoogleKit Gemini Live API & Live Translate Platform.
 */

export interface IGeminiLiveConfig {
  model: "gemini-3.1-flash-live-preview" | "gemini-3.5-live-translate-preview";
  mode: "agent" | "translate";
  targetLanguageCode?: string;
  echoTargetLanguage?: boolean;
  voiceName?: string;
}

export interface IGeminiLiveClient {
  connect(config: IGeminiLiveConfig): Promise<void>;
  sendAudioChunk(base64Pcm16k: string): void;
  sendTextPrompt(text: string): void;
  close(): void;
}

export interface ISchemaService {
  extractJsonLd(content: string): Record<string, any> | null;
  fetchPostSchema(params: { blogId: string; postId: string }): Promise<Record<string, any> | null>;
  resolveAndLoadSchema(schema: Record<string, any>, options: { base: string }): Promise<Record<string, any>>;
  toGraphDocument(schemas: Record<string, any> | Record<string, any>[]): Record<string, any>;
}

export interface IMcpToolService {
  executeTool(name: string, args: Record<string, any>): Promise<{ status: "success" | "error"; data?: any; error?: string }>;
}

export interface IUserMemoryRepository {
  getProfile(phone: string): Promise<any>;
  saveLanguagePreference(phone: string, language: "hindi" | "english"): Promise<void>;
  recordCall(phone: string, record: any): Promise<void>;
}
