import type { RAAchievement, RACredentials, RAPatchData } from "./types";

const RA_HOST = "https://retroachievements.org";
const MEDIA_HOST = "https://media.retroachievements.org";

export class RetroAchievementsClient {
  private baseUrl: string;

  constructor(baseUrl: string = RA_HOST) {
    this.baseUrl = baseUrl;
  }

  /**
   * Login or test credentials against RetroAchievements API.
   */
  async login(
    username: string,
    passwordOrToken: { password?: string; token?: string },
  ): Promise<{
    success: boolean;
    token?: string;
    username?: string;
    score?: number;
    error?: string;
  }> {
    const params = new URLSearchParams({
      r: "login2",
      u: username,
    });
    if (passwordOrToken.password) {
      params.append("p", passwordOrToken.password);
    } else if (passwordOrToken.token) {
      params.append("t", passwordOrToken.token);
    } else {
      return { success: false, error: "Password or token is required" };
    }

    try {
      const response = await fetch(`${this.baseUrl}/dorequest.php?${params.toString()}`);
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      if (data.Success) {
        return {
          success: true,
          token: data.Token,
          username: data.User || username,
          score: data.Score || 0,
        };
      }
      return {
        success: false,
        error: data.Error || "Invalid credentials",
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  /**
   * Get RetroAchievements Game ID by ROM hash.
   */
  async getGameIdByHash(hash: string): Promise<number | null> {
    if (!hash) return null;
    const params = new URLSearchParams({
      r: "gameid",
      m: hash.toLowerCase(),
    });

    try {
      const response = await fetch(`${this.baseUrl}/dorequest.php?${params.toString()}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (data.Success && data.GameID) {
        return Number(data.GameID);
      }
      return null;
    } catch (err) {
      console.warn("Failed to resolve Game ID by hash:", err);
      return null;
    }
  }

  /**
   * Get game achievements patch data.
   */
  async getPatchData(
    gameId: number,
    creds: RACredentials,
  ): Promise<RAPatchData | null> {
    const params = new URLSearchParams({
      r: "patch",
      g: String(gameId),
      u: creds.username,
      t: creds.token,
    });

    try {
      const response = await fetch(`${this.baseUrl}/dorequest.php?${params.toString()}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.Success || !data.PatchData) return null;

      const patch = data.PatchData;
      const achievements: RAAchievement[] = [];

      if (patch.Achievements && typeof patch.Achievements === "object") {
        for (const rawAch of Object.values(patch.Achievements) as any[]) {
          const badgeName = rawAch.BadgeName || "";
          achievements.push({
            id: Number(rawAch.ID),
            title: rawAch.Title || "Untitled",
            description: rawAch.Description || "",
            points: Number(rawAch.Points || 0),
            badgeName,
            badgeUrl: badgeName ? `${MEDIA_HOST}/Badge/${badgeName}.png` : undefined,
            unlocked: false,
          });
        }
      }

      return {
        gameId: Number(patch.ID || gameId),
        title: patch.Title || "Unknown Game",
        achievements,
      };
    } catch (err) {
      console.warn("Failed to fetch RetroAchievements patch data:", err);
      return null;
    }
  }

  /**
   * Get user unlocks for a specific game ID.
   */
  async getUnlocks(
    gameId: number,
    creds: RACredentials,
  ): Promise<Set<number>> {
    const params = new URLSearchParams({
      r: "unlocks",
      g: String(gameId),
      h: "0",
      u: creds.username,
      t: creds.token,
    });

    const unlockedSet = new Set<number>();
    try {
      const response = await fetch(`${this.baseUrl}/dorequest.php?${params.toString()}`);
      if (!response.ok) return unlockedSet;
      const data = await response.json();
      if (data.Success && Array.isArray(data.UserUnlocks)) {
        for (const unlockId of data.UserUnlocks) {
          unlockedSet.add(Number(unlockId));
        }
      }
    } catch (err) {
      console.warn("Failed to fetch RetroAchievements unlocks:", err);
    }
    return unlockedSet;
  }
}

export const raClient = new RetroAchievementsClient();
