/**
 * Use Case: Process Gemini Live Session, Language Preferences, and MCP Execution.
 */

import { IMcpToolService, IUserMemoryRepository } from "../domain/ports";

export class ProcessGeminiSessionUseCase {
  constructor(
    private readonly mcpToolService: IMcpToolService,
    private readonly userMemoryRepo: IUserMemoryRepository
  ) {}

  async updateLanguagePreference(phone: string, language: string): Promise<void> {
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
