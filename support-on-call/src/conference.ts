import { DurableObject } from "cloudflare:workers";

export interface ConferenceParticipant {
  id: string;
  role: "caller" | "support_agent" | "ai_assistant";
  joinedAt: string;
  active: boolean;
}

/**
 * Durable Object managing 3-Way Conference Merging (Caller + Human Support Agent + AI).
 * Handles warm transfers, standby quiet mode for AI, and logging call transcripts to Cloudflare storage/R2 assets.
 */
export class SupportConference extends DurableObject<Env> {
  private participants: Map<string, ConferenceParticipant> = new Map();
  private isAiQuietMode = false;

  async startConference(conferenceId: string, callerPhone: string, agentPhone: string): Promise<void> {
    this.participants.set("caller", {
      id: callerPhone,
      role: "caller",
      joinedAt: new Date().toISOString(),
      active: true,
    });

    this.participants.set("support_agent", {
      id: agentPhone,
      role: "support_agent",
      joinedAt: new Date().toISOString(),
      active: true,
    });

    this.participants.set("ai_assistant", {
      id: "ai_bot",
      role: "ai_assistant",
      joinedAt: new Date().toISOString(),
      active: true,
    });

    // Put AI assistant in quiet/standby mode during human support call
    this.isAiQuietMode = true;
  }

  /**
   * Toggles AI quiet mode. AI remains silent unless explicitly addressed by human agent or caller.
   */
  setAiQuietMode(quiet: boolean): void {
    this.isAiQuietMode = quiet;
  }

  async handleParticipantDrop(participantId: string): Promise<{ remainingParticipants: number }> {
    for (const [key, p] of this.participants.entries()) {
      if (p.id === participantId) {
        p.active = false;
      }
    }

    const activeCount = Array.from(this.participants.values()).filter((p) => p.active).length;

    // If human agent drops, AI takes over again smoothly
    if (participantId === "support_agent" && this.isAiQuietMode) {
      this.isAiQuietMode = false;
    }

    return { remainingParticipants: activeCount };
  }
}
