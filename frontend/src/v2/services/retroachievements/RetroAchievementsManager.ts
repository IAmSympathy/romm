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
  name?: string | null;
  fs_name?: string;
  fs_extension?: string;
  fs_size_bytes?: number;
  ra_id?: number | null;
  platform_slug?: string;
  files?: Array<{
    file_name?: string;
    ra_hash?: string | null;
    md5_hash?: string | null;
    crc_hash?: string | null;
  }>;
  rom_files?: Array<{
    file_name?: string;
    ra_hash?: string | null;
    md5_hash?: string | null;
    crc_hash?: string | null;
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

    const fileList = rom.files || rom.rom_files || [];
    const mainFile = fileList[0];
    const calculatedHash = mainFile?.ra_hash || mainFile?.md5_hash || null;
    const originalFile = rom.fs_name || rom.name || "Unknown";
    const detectedFormat = rom.fs_extension?.toUpperCase() || originalFile.split(".").pop()?.toUpperCase() || "UNKNOWN";
    const extractedRom = mainFile?.file_name || originalFile;
    const romSize = rom.fs_size_bytes || 0;

    console.group("%c[RA Debug]", "color: #9333ea; font-weight: bold; font-size: 14px;");
    console.log("%cOriginal file:", "font-weight: bold;", originalFile);
    console.log("%cDetected format:", "font-weight: bold;", detectedFormat);
    console.log("%cExtracted ROM:", "font-weight: bold;", extractedRom);
    console.log("%cROM size:", "font-weight: bold;", romSize ? `${romSize} bytes` : "Unknown");
    console.log("%cRomM ra_id:", "font-weight: bold;", rom.ra_id ?? "Not set");
    console.log("%cCalculated RA hash:", "font-weight: bold;", calculatedHash ?? "None");
    console.groupEnd();

    if (!user?.id) {
      console.warn("[RA Debug] User ID missing.");
      return false;
    }

    const creds: RACredentials = { username, token };
    this.credentials.value = creds;

    // Resolve Game ID
    let resolvedGameId: number | null = rom.ra_id ?? null;

    if (!resolvedGameId && calculatedHash) {
      console.log(`[RA Debug] Request sent to RetroAchievements via RomM backend: r=gameid&m=${calculatedHash}`);
      resolvedGameId = await this.client.getGameIdByHash(user.id, calculatedHash);
      console.log("[RA Debug] GameID resolved by hash:", resolvedGameId);
    }

    if (!resolvedGameId || resolvedGameId <= 0) {
      console.warn("[RA Debug] RA response: Game not found (resolvedGameId is 0 or null)");
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

    console.log(`[RA Debug] Request sent to RetroAchievements via RomM backend: r=patch&g=${resolvedGameId}&u=${username}`);
    const [patch, unlocks] = await Promise.all([
      this.client.getPatchData(user.id, resolvedGameId),
      this.client.getUnlocks(user.id, resolvedGameId),
    ]);

    if (!patch) {
      console.warn("[RA Debug] RA response: Failed to fetch patch data or CORS/HTTP error");
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

    const totalCount = patch.achievements.length;
    const gameTitle = patch.title || rom.name;

    // Detailed Runtime Diagnostic Log
    console.group("%c[RA Runtime Debug]", "color: #eab308; font-weight: bold; font-size: 14px;");
    console.log("%cNombre d'achievements chargés :", "font-weight: bold;", totalCount);
    console.log("%cNombre d'achievements surveillés :", "font-weight: bold;", 0, "(Aucune boucle d'évaluation active)");
    console.log("%cFréquence de vérification :", "font-weight: bold;", "0 Hz (Absence de la boucle d'update)");
    console.log("%cValeurs mémoire lues :", "font-weight: bold;", "Non connectées (Core RAM non transmise à l'évaluateur)");
    console.log("%cRésultat des évaluations :", "font-weight: bold;", "Aucune évaluation exécutée pendant le jeu");
    console.log("%cAppels d'unlock envoyés :", "font-weight: bold;", 0);
    console.groupEnd();

    // Show game recognized notification
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
