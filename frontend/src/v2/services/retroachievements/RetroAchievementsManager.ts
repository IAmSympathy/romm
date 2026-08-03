import { ref } from "vue";
import { RetroAchievementsClient } from "./RetroAchievementsClient";
import { raRuntime } from "./RetroAchievementsRuntime";
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
  private completionTriggered = false;
  public detectedGames = new Set<number>();
  public notifiedAchievementSets = new Set<number>();
  public loadedSetImages = new Map<number, string>();
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
      duration: options.duration ?? (type === "achievement_unlocked" || type === "set_completed" ? 6500 : 4500),
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
    // If this ROM & set has already been initialized and notified, avoid duplicate execution
    if (rom?.id && this.detectedGames.has(rom.id) && this.gameId.value && this.notifiedAchievementSets.has(this.gameId.value)) {
      return true;
    }

    this.reset();

    if (rom?.id) {
      this.detectedGames.add(rom.id);
    }

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

    // 1. Connection status notification at game boot
    if (!user?.id || !username || !token) {
      console.warn("[RA Debug] User credentials missing.");
      this.addNotification(
        "auth_failed",
        "Connexion RetroAchievements échouée",
        "Veuillez vérifier vos identifiants RetroAchievements dans votre profil.",
        { icon: "mdi-account-alert-outline" },
      );
      return false;
    }

    const creds: RACredentials = { username, token };
    this.credentials.value = creds;

    this.addNotification(
      "auth_success",
      "Connecté à RetroAchievements",
      `Connecté en tant que : ${username}`,
      { icon: "mdi-account-check-outline" },
    );

    // Resolve Game ID
    let resolvedGameId: number | null = rom.ra_id ?? null;

    if (!resolvedGameId && calculatedHash) {
      console.log(`[RA Debug] Request sent to RetroAchievements via RomM backend: r=gameid&m=${calculatedHash}`);
      resolvedGameId = await this.client.getGameIdByHash(user.id, calculatedHash);
      console.log("[RA Debug] GameID resolved by hash:", resolvedGameId);
    }

    // 2. Unknown ROM handling (Yellow + ?)
    if (!resolvedGameId || resolvedGameId <= 0) {
      console.warn("[RA Debug] RA response: Game not found (resolvedGameId is 0 or null)");
      this.addNotification(
        "rom_unknown",
        "RetroAchievements",
        "Jeu non reconnu par RetroAchievements",
        { icon: "mdi-help-circle-outline" },
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

    // 3. Known game with no active set or unsupported (Red + X)
    if (!patch || !patch.achievements || patch.achievements.length === 0) {
      console.warn("[RA Debug] RA response: Unsupported game or no active achievement set");
      this.addNotification(
        "set_unsupported",
        "RetroAchievements",
        "Ce jeu n'a pas de set RetroAchievements actif",
        { icon: "mdi-close-circle-outline" },
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
    const gameTitle = patch.title || rom.name || rom.fs_name || "Game";
    const percent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    // Track 100% completion so starting an already finished set won't duplicate completion toast
    this.completionTriggered = totalCount > 0 && unlockedCount === totalCount;

    // Initialize and start real-time RetroAchievementsRuntime
    raRuntime.initialize(user.id, resolvedGameId, patch.achievements);
    raRuntime.onUnlockCallback = (ach) => {
      this.triggerUnlock(ach.id);
    };
    raRuntime.start();

    // 4. Active achievement set notification (Guaranteed ONCE per set ID)
    if (!this.notifiedAchievementSets.has(resolvedGameId)) {
      this.notifiedAchievementSets.add(resolvedGameId);

      const setImageUrl = patch.iconUrl || (patch.achievements && patch.achievements[0]?.badgeUrl) || undefined;
      if (setImageUrl) {
        this.loadedSetImages.set(resolvedGameId, setImageUrl);
      }

      // Diagnostic log (Requirement 3)
      console.group("%c[RA Set Detection]", "color: #22c55e; font-weight: bold; font-size: 14px;");
      console.log("%cGame:", "font-weight: bold;", gameTitle);
      console.log("%cSet ID:", "font-weight: bold;", resolvedGameId);
      console.log("%cImage URL utilisée:", "font-weight: bold;", setImageUrl || "Aucune (Fallback icône local)");
      console.groupEnd();

      this.addNotification(
        "game_detected",
        gameTitle,
        `${unlockedCount} / ${totalCount} achievements débloqués (${percent}%)`,
        {
          badgeUrl: setImageUrl,
          icon: "mdi-check-decagram",
        },
      );
    }

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

    // Show clean achievement unlock notification (Title bold, Description below, points in badge)
    this.addNotification(
      "achievement_unlocked",
      ach.title,
      ach.description,
      {
        points: ach.points,
        badgeUrl: ach.badgeUrl,
        icon: "mdi-trophy-award",
      },
    );

    // 5. Special 100% completion notification (fires once per set)
    const totalCount = this.activePatch.value.achievements.length;
    const unlockedCount = this.activePatch.value.achievements.filter((a) => a.unlocked).length;

    if (totalCount > 0 && unlockedCount === totalCount && !this.completionTriggered) {
      this.completionTriggered = true;
      this.addNotification(
        "set_completed",
        "Set terminé à 100% !",
        "Félicitations, tous les achievements sont débloqués !",
        {
          icon: "mdi-trophy-crown",
          duration: 10000,
        },
      );
    }
  }

  public reset() {
    raRuntime.stop();
    this.notifications.value = [];
    this.activePatch.value = null;
    this.gameId.value = null;
    this.credentials.value = null;
    this.isInitialized.value = false;
    this.completionTriggered = false;
    this.detectedGames.clear();
    this.notifiedAchievementSets.clear();
    this.loadedSetImages.clear();
  }
}

export const raManager = new RetroAchievementsManager();
