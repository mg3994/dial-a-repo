import { DurableObject } from "cloudflare:workers";

export interface CallRecord {
  callId: string;
  timestamp: string;
  language: string;
  mode: "agent" | "translate";
  summary: string;
  transcript: Array<{ role: string; text: string }>;
}

export interface UserProfile {
  phone: string;
  preferredLanguage?: string;
  calls: CallRecord[];
}

export class UserMemory extends DurableObject<Env> {
  async getProfile(phone: string): Promise<UserProfile> {
    return (await this.ctx.storage.get<UserProfile>("profile")) ?? { phone, calls: [] };
  }

  async saveLanguagePreference(phone: string, language: string): Promise<void> {
    const profile = await this.getProfile(phone);
    profile.preferredLanguage = language;
    await this.ctx.storage.put("profile", profile);
  }

  async recordCall(phone: string, record: CallRecord): Promise<void> {
    const profile = await this.getProfile(phone);
    profile.calls.unshift(record);
    if (profile.calls.length > 20) profile.calls = profile.calls.slice(0, 20);
    await this.ctx.storage.put("profile", profile);
  }
}
