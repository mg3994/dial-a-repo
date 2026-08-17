/**
 * Use Case: Process E-commerce Call Session & Language Preferences.
 * Follows Single Responsibility Principle (SRP).
 */

import { IMcpToolService, IUserMemoryRepository } from "../domain/ports";

export interface ProcessCallSessionInput {
  callId: string;
  callerPhone: string;
  selectedLanguage: "hindi" | "english";
}

export class ProcessCallSessionUseCase {
  constructor(
    private readonly mcpToolService: IMcpToolService,
    private readonly userMemoryRepo: IUserMemoryRepository
  ) {}

  async updateLanguagePreference(phone: string, language: "hindi" | "english"): Promise<void> {
    if (!phone) return;
    await this.userMemoryRepo.saveLanguagePreference(phone, language);
  }

  async executeMcpTool(name: string, args: Record<string, any>): Promise<any> {
    return this.mcpToolService.executeTool(name, args);
  }

  async recordCallDrop(phone: string, record: any): Promise<void> {
    if (!phone) return;
    await this.userMemoryRepo.recordCall(phone, record);
  }
}
