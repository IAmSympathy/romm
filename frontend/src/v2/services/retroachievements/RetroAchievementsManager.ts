import { ref } from "vue";
import { RetroAchievementsClient } from "./RetroAchievementsClient";
import type {
  RACredentials,
  RANotificationItem,
  RANotificationType,
  RAPatchData,
} from "./types";

export interface SessionRomInput {
  id: number;
  name: string;
  ra_id?: number | null;
  platform_slug?: string;
  rom_files?: Array<{
    ra_hash?: string | null;
    md5_hash?: string | null;
  }>;
}

export interface SessionUserInput {
  id: number;
  ra_username?: string | null;
  ra_token?: string | null;
}

export class RetroAchievementsManager {
  private client: RetroAchievementsClient;
  public notifications = ref<RANotificationItem[]>([]);
  public activePatch = ref<RAPatchData | null>(null);
  public gameId = ref<number | null>(null);
  public credentials = ref<RACredentials | null>(null);
  public isInitialized = ref<boolean>(false);

  constructor(client: RetroAchievementsClient = new RetroAchievementsClient()) {
    this.client = client;
  }

  /**
   * Add a notification toast to the top-left notification queue.
   */
  public addNotification(
    type: RANotificationType,
    title: string,
    subtitle?: string,
    options: {
      points?: number;
      badgeUrl?: string;
      icon?: string;
      duration?: number;
    } = {},
  ) {
    const id = `ra-notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const notification: RANotificationItem = {
      id,
      type,
      title,
      subtitle,
      points: options.points,
      badgeUrl: options.badgeUrl,
      icon: options.icon,
      duration: options.duration ?? (type === "achievement_unlocked" ? 6000 : 4500),
    };

    this.notifications.value.unshift(notification);

    // Auto dismiss
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        this.dismissNotification(id);
      }, notification.duration);
    }

    return id;
  }

  public dismissNotification(id: string) {
    this.notifications.value = this.notifications.value.filter((n) => n.id !== id);
  }

  /**
   * Transparently initialize RetroAchievements for the current game launch session.
   */
  public async initializeSession(
    user: SessionUserInput | null,
    rom: SessionRomInput,
  ): Promise<boolean> {
    this.reset();

    const username = user?.ra_username?.trim();
    const token = user?.ra_token?.trim();

    if (!username || !token) {
      // User has not linked RetroAchievements account
      return false;
    }

    const creds: RACredentials = { username, token };
    this.credentials.value = creds;

    // Resolve Game ID
    let resolvedGameId: number | null = rom.ra_id ?? null;

    if (!resolvedGameId && rom.rom_files && rom.rom_files.length > 0) {
      const raHash = rom.rom_files[0]?.ra_hash || rom.rom_files[0]?.md5_hash;
      if (raHash) {
        resolvedGameId = await this.client.getGameIdByHash(raHash);
      }
    }

    if (!resolvedGameId || resolvedGameId <= 0) {
      // ROM unknown on RetroAchievements
      this.addNotification(
        "rom_unknown",
        "RetroAchievements",
        "Cette ROM n'est pas reconnue.",
        { icon: "mdi-alert-circle-outline" },
      );
      this.isInitialized.value = true;
      return false;
    }

    this.gameId.value = resolvedGameId;

    // Fetch achievements patch data & user unlocks in parallel
    const [patch, unlocks] = await Promise.all([
      this.client.getPatchData(resolvedGameId, creds),
      this.client.getUnlocks(resolvedGameId, creds),
    ]);

    if (!patch) {
      this.addNotification(
        "rom_unknown",
        "RetroAchievements",
        "Cette ROM n'est pas reconnue.",
        { icon: "mdi-alert-circle-outline" },
      );
      this.isInitialized.value = true;
      return false;
    }

    // Mark unlocked status
    let unlockedCount = 0;
    for (const ach of patch.achievements) {
      if (unlocks.has(ach.id)) {
        ach.unlocked = true;
        unlockedCount++;
      }
    }

    this.activePatch.value = patch;
    this.isInitialized.value = true;

    // Show game recognized notification
    const totalCount = patch.achievements.length;
    const gameTitle = patch.title || rom.name;

    this.addNotification(
      "game_detected",
      "RetroAchievements",
      `${gameTitle} (${unlockedCount}/${totalCount} succès débloqués)`,
      { icon: "mdi-trophy-outline" },
    );

    return true;
  }

  /**
   * Trigger an achievement unlock notification.
   */
  public triggerUnlock(achievementId: number) {
    if (!this.activePatch.value) return;

    const ach = this.activePatch.value.achievements.find((a) => a.id === achievementId);
    if (!ach) return;

    if (!ach.unlocked) {
      ach.unlocked = true;
    }

    this.addNotification(
      "achievement_unlocked",
      "Achievement Unlocked!",
      `${ach.title} (${ach.points} Points) - ${ach.description}`,
      {
        points: ach.points,
        badgeUrl: ach.badgeUrl,
        icon: "mdi-trophy-award",
      },
    );
  }

  public reset() {
    this.notifications.value = [];
    this.activePatch.value = null;
    this.gameId.value = null;
    this.credentials.value = null;
    this.isInitialized.value = false;
  }
}

export const raManager = new RetroAchievementsManager();
