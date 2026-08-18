import { DurableObject } from "cloudflare:workers";

export class SupportConference extends DurableObject<Env> {
  private isAiQuietMode = false;

  setAiQuietMode(quiet: boolean): void {
    this.isAiQuietMode = quiet;
  }

  isQuiet(): boolean {
    return this.isAiQuietMode;
  }
}
