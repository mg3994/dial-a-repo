import { DurableObject } from "cloudflare:workers";

export interface CallRecord {
  callId: string;
  timestamp: string;
  language: string;
  summary: string;
  droppedMidway: boolean;
  transcript: Array<{ role: string; text: string }>;
}

export interface UserProfile {
  phone: string;
  preferredLanguage?: "hindi" | "english";
  activeOrderId?: string;
  calls: CallRecord[];
}

/**
 * Durable Object tracking user history keyed by customer phone number (`from` SIP header).
 * Persists caller preferences, call records, dropped call history, and order context.
 */
export class UserMemory extends DurableObject<Env> {
  async getProfile(phone: string): Promise<UserProfile> {
    const profile = (await this.ctx.storage.get<UserProfile>("profile")) ?? {
      phone,
      calls: [],
    };
    return profile;
  }

  async saveLanguagePreference(phone: string, language: "hindi" | "english"): Promise<void> {
    const profile = await this.getProfile(phone);
    profile.preferredLanguage = language;
    await this.ctx.storage.put("profile", profile);
  }

  async recordCall(phone: string, record: CallRecord): Promise<void> {
    const profile = await this.getProfile(phone);
    profile.calls.unshift(record);
    if (profile.calls.length > 20) {
      profile.calls = profile.calls.slice(0, 20); // Keep last 20 call logs
    }
    await this.ctx.storage.put("profile", profile);
  }

  async setLastActiveOrder(phone: string, orderId: string): Promise<void> {
    const profile = await this.getProfile(phone);
    profile.activeOrderId = orderId;
    await this.ctx.storage.put("profile", profile);
  }
}
