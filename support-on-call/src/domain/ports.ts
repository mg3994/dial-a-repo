/**
 * Clean Architecture Ports (Interfaces) for the Support-on-Call Domain.
 * Follows SOLID principles (Interface Segregation & Dependency Inversion).
 */

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
  setLastActiveOrder(phone: string, orderId: string): Promise<void>;
}

export interface IConferenceManager {
  startConference(conferenceId: string, callerPhone: string, agentPhone: string): Promise<void>;
  setAiQuietMode(quiet: boolean): void;
  handleParticipantDrop(participantId: string): Promise<{ remainingParticipants: number }>;
}
