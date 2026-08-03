import userApi from "@/services/api/user";
import type { RAAchievement, RACredentials, RAPatchData } from "./types";

const MEDIA_HOST = "https://media.retroachievements.org";

export class RetroAchievementsClient {
  /**
   * Login or test credentials against RetroAchievements API.
   */
  async login(
    userId: number,
    username: string,
    passwordOrToken: { password?: string; token?: string },
  ): Promise<{
    success: boolean;
    token?: string;
    username?: string;
    score?: number;
    error?: string;
  }> {
    try {
      const response = await userApi.testRetroAchievements({
        id: userId,
        ra_username: username,
        ra_password: passwordOrToken.password,
        ra_token: passwordOrToken.token,
      });
      return response.data;
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  /**
   * Get RetroAchievements Game ID by ROM hash via RomM backend.
   */
  async getGameIdByHash(userId: number, hash: string): Promise<number | null> {
    if (!hash) return null;
    try {
      const response = await userApi.getRetroAchievementsGameId(userId, hash);
      if (response.data.success && response.data.game_id) {
        return Number(response.data.game_id);
      }
      return null;
    } catch (err) {
      console.warn("Failed to resolve Game ID by hash:", err);
      return null;
    }
  }

  /**
   * Get game achievements patch data via RomM backend.
   */
  async getPatchData(
    userId: number,
    gameId: number,
  ): Promise<RAPatchData | null> {
    try {
      const response = await userApi.getRetroAchievementsPatch(userId, gameId);
      if (!response.data.success || !response.data.patch_data) return null;

      const patch = response.data.patch_data;
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
            trigger: rawAch.MemAddr || rawAch.Mem || rawAch.Conditions || "",
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
   * Get user unlocks for a specific game ID via RomM backend.
   */
  async getUnlocks(
    userId: number,
    gameId: number,
  ): Promise<Set<number>> {
    const unlockedSet = new Set<number>();
    try {
      const response = await userApi.getRetroAchievementsUnlocks(userId, gameId);
      if (response.data.success && Array.isArray(response.data.unlocks)) {
        for (const unlockId of response.data.unlocks) {
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
