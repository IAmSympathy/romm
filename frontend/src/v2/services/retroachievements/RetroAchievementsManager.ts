import { ref } from "vue";
import type { Rom } from "@/types";
import storeAuth from "@/stores/auth";
import type { MonitoredChallengeItem } from "@/v2/components/Player/RAChallengeIndicators.vue";
import { raClient } from "./RetroAchievementsClient";
import { raRuntime } from "./RetroAchievementsRuntime";
import type { RAAchievement, RAPatchData } from "./types";

export interface RANotificationItem {
  id: string;
  type:
    | "auth_success"
    | "auth_failed"
    | "game_detected"
    | "rom_unknown"
    | "set_unsupported"
    | "achievement_unlocked"
    | "set_completed";
  title: string;
  subtitle?: string;
  points?: number;
  badgeUrl?: string;
  icon?: string;
}

export class RetroAchievementsManager {
  public isInitialized = ref(false);
  public isLoading = ref(false);
  public activePatch = ref<RAPatchData | null>(null);
  public notifications = ref<RANotificationItem[]>([]);
  public activeChallenges = ref<MonitoredChallengeItem[]>([]);

  // Persistent deduplication tracking across current application session
  private notifiedAchievementSets = new Set<number>();
  private notifiedUnknownRoms = new Set<string>();
  private loadedSetImages = new Map<number, string>();
  private completionTriggered = false;

  public clearNotifications() {
    this.notifications.value = [];
  }

  public removeNotification(id: string) {
    this.notifications.value = this.notifications.value.filter((n) => n.id !== id);
  }

  public addNotification(
    type: RANotificationItem["type"],
    title: string,
    subtitle?: string,
    options: { points?: number; badgeUrl?: string; icon?: string } = {},
  ) {
    const id = `ra-notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const notif: RANotificationItem = {
      id,
      type,
      title,
      subtitle,
      points: options.points,
      badgeUrl: options.badgeUrl,
      icon: options.icon,
    };

    this.notifications.value.push(notif);

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      this.removeNotification(id);
    }, 6000);
  }

  /**
   * Main entry point when launching a game in EmulatorJS.
   */
  async initForRom(rom: Rom) {
    this.isLoading.value = true;
    this.isInitialized.value = false;
    this.activePatch.value = null;
    this.completionTriggered = false;
    this.activeChallenges.value = [];

    const auth = storeAuth();
    const user = auth.user;

    // 1. Check user login credentials
    if (!user || !user.ra_username || !user.ra_token) {
      this.isLoading.value = false;
      this.addNotification(
        "auth_failed",
        "Compte non connecté",
        "Connectez votre compte RetroAchievements dans vos réglages.",
        { icon: "mdi-account-alert-outline" },
      );
      return;
    }

    // 2. Resolve ROM hash to RA Game ID
    const hash = rom.ra_hash || (rom.file_hashes ? rom.file_hashes.md5 : "") || "";
    const romKey = `${rom.id}-${hash || rom.fs_name}`;

    let resolvedGameId: number | null = rom.ra_id || null;
    if (!resolvedGameId && hash) {
      resolvedGameId = await raClient.getGameIdByHash(user.id, hash);
    }

    if (!resolvedGameId) {
      this.isLoading.value = false;
      if (!this.notifiedUnknownRoms.has(romKey)) {
        this.notifiedUnknownRoms.add(romKey);
        this.addNotification(
          "rom_unknown",
          "ROM non reconnue par RetroAchievements",
          "Aucun succès trouvé pour le hash de ce jeu.",
          { icon: "mdi-help-circle-outline" },
        );
      }
      return;
    }

    // 3. Fetch patch data and user unlocks
    const [patch, unlocks] = await Promise.all([
      raClient.getPatchData(user.id, resolvedGameId),
      raClient.getUnlocks(user.id, resolvedGameId),
    ]);

    this.isLoading.value = false;

    if (!patch || !patch.achievements || patch.achievements.length === 0) {
      if (!this.notifiedAchievementSets.has(resolvedGameId)) {
        this.notifiedAchievementSets.add(resolvedGameId);
        this.addNotification(
          "set_unsupported",
          patch?.title || rom.name || "Jeu détecté",
          "Ce jeu n'a pas de liste de succès enregistrée.",
          { icon: "mdi-close-circle-outline" },
        );
      }
      return;
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
    const gameTitle = patch.title || rom.name || rom.fs_name || "Jeu";
    const percent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    // Track 100% completion
    this.completionTriggered = totalCount > 0 && unlockedCount === totalCount;

    // Initialize and start real-time RetroAchievementsRuntime
    raRuntime.initialize(user.id, resolvedGameId, patch.achievements);
    raRuntime.onUnlockCallback = (ach) => {
      this.triggerUnlock(ach.id);
    };
    raRuntime.onProgressNotificationCallback = (ach, prevVal, curVal, targetVal) => {
      const isPercent = ach.trigger?.measuredAsPercent;
      const progressStr = isPercent
        ? `${Math.floor((curVal / targetVal) * 100)}%`
        : `${curVal} / ${targetVal}`;

      this.addNotification(
        "achievement_unlocked",
        ach.title,
        `Progression : ${progressStr}`,
        {
          badgeUrl: ach.badgeUrl,
          points: ach.points,
          icon: "mdi-trophy-outline",
        }
      );
    };
    raRuntime.onChallengeIndicatorsCallback = (challenges) => {
      this.activeChallenges.value = challenges;
    };
    raRuntime.start();

    // 4. Active achievement set notification
    if (!this.notifiedAchievementSets.has(resolvedGameId)) {
      this.notifiedAchievementSets.add(resolvedGameId);

      const setImageUrl = patch.iconUrl || (patch.achievements && patch.achievements[0]?.badgeUrl) || undefined;
      if (setImageUrl) {
        this.loadedSetImages.set(resolvedGameId, setImageUrl);
      }

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
  }

  /**
   * Trigger achievement unlock event and check Mastered status.
   */
  public triggerUnlock(achievementId: number) {
    if (!this.activePatch.value) return;

    const ach = this.activePatch.value.achievements.find((a) => a.id === achievementId);
    if (!ach) return;

    ach.unlocked = true;

    // Show achievement unlocked notification
    this.addNotification(
      "achievement_unlocked",
      ach.title,
      ach.description || `+${ach.points} points`,
      {
        points: ach.points,
        badgeUrl: ach.badgeUrl,
        icon: "mdi-trophy-award",
      },
    );

    // Check if 100% completion is reached
    const totalCount = this.activePatch.value.achievements.length;
    const unlockedCount = this.activePatch.value.achievements.filter((a) => a.unlocked).length;

    if (totalCount > 0 && unlockedCount === totalCount && !this.completionTriggered) {
      this.completionTriggered = true;
      const setImageUrl =
        this.loadedSetImages.get(this.activePatch.value.gameId) ||
        this.activePatch.value.iconUrl ||
        ach.badgeUrl;

      setTimeout(() => {
        this.addNotification(
          "set_completed",
          "MAÎTRISÉ !",
          `Félicitations ! Vous avez débloqué 100% des succès (${unlockedCount}/${totalCount}) !`,
          {
            badgeUrl: setImageUrl,
            icon: "mdi-trophy-crown",
          },
        );
      }, 1500);
    }
  }

  /**
   * Stop runtime monitoring loop on player exit.
   */
  public stop() {
    raRuntime.stop();
    this.isInitialized.value = false;
    this.activePatch.value = null;
    this.activeChallenges.value = [];
  }
}

export const raManager = new RetroAchievementsManager();
