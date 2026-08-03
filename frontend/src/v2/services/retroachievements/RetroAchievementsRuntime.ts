import userApi from "@/services/api/user";
import type { MonitoredChallengeItem } from "@/v2/components/Player/RAChallengeIndicators.vue";
import { RCheevosEngine } from "./RCheevosEngine";
import { RCConditionType, RCTriggerState, type RCTrigger } from "./RCheevosTypes";

export enum AchievementPipelineStatus {
  LOCAL_TRIGGERED = "LOCAL_TRIGGERED",
  AWARD_PENDING = "AWARD_PENDING",
  AWARD_ACCEPTED = "AWARD_ACCEPTED",
  AWARD_REJECTED = "AWARD_REJECTED",
  ALREADY_UNLOCKED = "ALREADY_UNLOCKED",
}

export interface MonitoredAchievement {
  id: number;
  title: string;
  description?: string;
  points: number;
  badgeUrl?: string;
  triggerStr: string;
  trigger: RCTrigger | null;
  unlocked: boolean;
  pipelineStatus?: AchievementPipelineStatus;
  detectionTime?: string;
}

export class RetroAchievementsRuntime {
  public memoryReader: RAMemoryReader = new RAMemoryReader();
  public achievements: MonitoredAchievement[] = [];
  public userId: number | null = null;
  public gameId: number | null = null;
  public isRunning: boolean = false;
  private animFrameId: number | null = null;

  public onUnlockCallback?: (achievement: MonitoredAchievement) => void;
  public onProgressNotificationCallback?: (
    achievement: MonitoredAchievement,
    prevVal: number,
    curVal: number,
    targetVal: number
  ) => void;
  public onChallengeIndicatorsCallback?: (challenges: MonitoredChallengeItem[]) => void;

  private warmupTicks: number = 0;
  private warmupTarget: number = 180; // 180 frames (~3s at 60FPS) warmup delay
  private warmupCompleted: boolean = false;
  private frameIndex: number = 0;

  // Real-time FPS & Frequency Diagnostic Counters
  private lastTickTimestamp: number = performance.now();
  private tickTimestamps: number[] = [];
  public checksPerSecond: number = 60.0;
  public lastEvaluationMs: number = 0;

  // Real-time progress & challenge indicators tracking state
  private prevProgressMap: Map<number, number> = new Map<number, number>();
  public activeChallenges: MonitoredChallengeItem[] = [];

  /**
   * Format badge image URL to use backend proxy resolving browser CORS/CORP restrictions.
   */
  public formatBadgeUrl(rawBadgeUrl?: string): string {
    const fallback = "/assets/romm/resources/metadata_providers/ra.png";
    if (!rawBadgeUrl) {
      console.log(`[RA Badge Proxy] Original: "${rawBadgeUrl}" | Converted: "${fallback}" | img.src: "${fallback}"`);
      return fallback;
    }

    let badgeFilename = "";
    const match = rawBadgeUrl.match(/Badge\/([^/]+)$/i);
    if (match && match[1]) {
      badgeFilename = match[1];
    } else if (rawBadgeUrl.startsWith("http://") || rawBadgeUrl.startsWith("https://")) {
      const parts = rawBadgeUrl.split("/");
      badgeFilename = parts[parts.length - 1];
    } else {
      badgeFilename = rawBadgeUrl.replace(/^\//, "");
    }

    const converted = `/api/users/ra/badge/${badgeFilename}`;
    console.log(`[RA Badge Proxy] Original: "${rawBadgeUrl}" | Converted: "${converted}" | img.src: "${converted}"`);
    return converted;
  }

  /**
   * Initialize runtime for a specific user and game.
   */
  public initialize(userId: number, gameId: number, rawAchievements: any[]) {
    this.stop();
    this.userId = userId;
    this.gameId = gameId;
    this.warmupTicks = 0;
    this.warmupCompleted = false;
    this.frameIndex = 0;
    this.tickTimestamps = [];
    this.prevProgressMap.clear();
    this.activeChallenges = [];
    this.loadAchievements(rawAchievements);
  }

  /**
   * Load and parse achievements list with detailed diagnostic output and robust deduplication.
   */
  public loadAchievements(rawAchievements: any[]) {
    this.achievements = [];
    const mapByDedupKey = new Map<string, MonitoredAchievement>();

    console.group("%c[RA Runtime] loadAchievements Diagnostic", "color: #3b82f6; font-weight: bold; font-size: 13px;");
    console.log(`[RA Runtime] Total raw achievements fetched from API: ${rawAchievements.length}`);

    for (const raw of rawAchievements) {
      const ach = this.parseAchievement(raw);
      if (!ach.id || !ach.triggerStr) continue;

      const normTitle = ach.title
        .toLowerCase()
        .replace(/\(copy\)/gi, "")
        .replace(/\[copy\]/gi, "")
        .replace(/[^a-z0-9]/g, "");

      const normTrigger = ach.triggerStr.toUpperCase().replace(/\s+/g, "");
      const dedupKey = `${normTitle}::${normTrigger}`;
      const isCopy = ach.title.toLowerCase().includes("(copy)") || ach.title.toLowerCase().includes("[copy]");

      console.log(
        `%c[RA Item] ID: ${ach.id} | Original Title: "${ach.title}" | Clean Title: "${normTitle}" | Key: "${dedupKey}" | isCopy: ${isCopy}`,
        "color: #64748b;"
      );

      if (!mapByDedupKey.has(dedupKey)) {
        mapByDedupKey.set(dedupKey, ach);
      } else {
        const existing = mapByDedupKey.get(dedupKey)!;
        const existingIsCopy =
          existing.title.toLowerCase().includes("(copy)") || existing.title.toLowerCase().includes("[copy]");

        if (existingIsCopy && !isCopy) {
          console.log(
            `%c[RA Dedup REPLACED] Preferred official ID:${ach.id} ("${ach.title}") over copy ID:${existing.id} ("${existing.title}")`,
            "color: #eab308; font-weight: bold;"
          );
          mapByDedupKey.set(dedupKey, ach);
        } else if (existingIsCopy === isCopy && ach.id < existing.id) {
          console.log(
            `%c[RA Dedup REPLACED] Preferred lower official ID:${ach.id} over higher ID:${existing.id} for "${ach.title}"`,
            "color: #06b6d4; font-weight: bold;"
          );
          mapByDedupKey.set(dedupKey, ach);
        } else {
          console.log(
            `%c[RA Dedup DISCARDED] Ignored duplicate ID:${ach.id} ("${ach.title}") in favor of active ID:${existing.id} ("${existing.title}")`,
            "color: #94a3b8;"
          );
        }
      }
    }

    this.achievements = Array.from(mapByDedupKey.values());
    console.log(
      `%c[RA Runtime] Final deduplicated achievements count: ${this.achievements.length}`,
      "color: #22c55e; font-weight: bold; font-size: 13px;"
    );
    console.groupEnd();
  }

  /**
   * Parse a single achievement entry into a MonitoredAchievement using official RCheevosEngine.
   */
  public parseAchievement(raw: any): MonitoredAchievement {
    const triggerStr = raw.MemAddr || raw.conditions || raw.trigger || "";
    let parsedTrigger: RCTrigger | null = null;

    try {
      if (triggerStr) {
        parsedTrigger = RCheevosEngine.parseTrigger(triggerStr);
      }
    } catch (err) {
      console.warn(`[RA Runtime] Failed to parse rcheevos trigger for achievement ${raw.id}:`, err);
    }

    const rawBadge = raw.badgeUrl || raw.BadgeURL || (raw.BadgeName ? `https://media.retroachievements.org/Badge/${raw.BadgeName}.png` : undefined);

    return {
      id: Number(raw.id || raw.ID),
      title: raw.title || raw.Title || "Untitled",
      description: raw.description || raw.Description || "",
      points: Number(raw.points || raw.Points || 0),
      badgeUrl: this.formatBadgeUrl(rawBadge),
      triggerStr,
      trigger: parsedTrigger,
      unlocked: Boolean(raw.unlocked),
    };
  }

  /**
   * Start the frame-synchronous 60 Hz memory evaluation loop.
   */
  public start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.warmupTicks = 0;
    this.warmupCompleted = false;
    this.frameIndex = 0;
    this.lastTickTimestamp = performance.now();
    this.tickTimestamps = [];
    this.prevProgressMap.clear();
    this.activeChallenges = [];

    const core = (window as any).EJS_core || "fceumm";

    this.memoryReader.raMemory.resolveMemory(core);

    console.group("%c[RA rcheevos 60Hz Engine]", "color: #22c55e; font-weight: bold; font-size: 14px;");
    console.log("%cGame ID:", "font-weight: bold;", this.gameId);
    console.log("%cCore:", "font-weight: bold;", core);
    console.log("%cAchievements loaded (deduped):", "font-weight: bold;", this.achievements.length);
    console.log("%cTarget frequency:", "font-weight: bold;", "60.0 Hz (Frame-Synchronous)");
    console.groupEnd();

    const loop = () => {
      if (!this.isRunning) return;
      this.evaluateAchievements();
      this.animFrameId = window.requestAnimationFrame(loop);
    };

    this.animFrameId = window.requestAnimationFrame(loop);
  }

  /**
   * Stop the evaluation loop.
   */
  public stop() {
    if (this.animFrameId !== null) {
      window.cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.isRunning = false;
  }

  /**
   * Real-time memory read abstraction wrapper.
   */
  public readMemory(address: number, size: 1 | 2 | 4 = 1): number {
    return this.memoryReader.readMemory(address, size);
  }

  /**
   * Evaluate active achievements frame by frame using official RCheevosEngine.
   */
  public evaluateAchievements() {
    if (!this.isRunning) return;

    const tStart = performance.now();

    // Frequency calculation over rolling 1 second window
    this.tickTimestamps.push(tStart);
    while (this.tickTimestamps.length > 0 && this.tickTimestamps[0] < tStart - 1000) {
      this.tickTimestamps.shift();
    }
    this.checksPerSecond = this.tickTimestamps.length;

    if (!this.memoryReader.raMemory.isResolved) {
      const core = (window as any).EJS_core || "fceumm";
      const resolved = this.memoryReader.raMemory.resolveMemory(core);
      if (!resolved) return;
    }

    this.frameIndex++;

    this.memoryReader.beginFrame();

    if (!this.warmupCompleted) {
      this.warmupTicks++;
      if (this.warmupTicks % 60 === 1 || this.warmupTicks === this.warmupTarget) {
        console.log(`[RA Runtime] Waiting for game stabilization... Frame: ${this.warmupTicks}/${this.warmupTarget}`);
      }

      if (this.warmupTicks >= this.warmupTarget) {
        this.warmupCompleted = true;
        console.log("%c[RA Runtime] Achievement evaluation enabled (60 FPS)", "color: #22c55e; font-weight: bold; font-size: 13px;");
      } else {
        return;
      }
    }

    const shouldLogDiagnostic = this.frameIndex % 300 === 0;

    if (shouldLogDiagnostic) {
      console.groupCollapsed(`%c[RA rcheevos Evaluation] Frame #${this.frameIndex}`, "color: #3b82f6; font-weight: bold;");
      console.log("%c[RA Frequency Stats]", "color: #06b6d4; font-weight: bold;", {
        "Current frame": this.frameIndex,
        "Checks per second": `${this.checksPerSecond.toFixed(1)} Hz`,
        "Last evaluation time": `${this.lastEvaluationMs.toFixed(3)} ms`,
      });

      const activeList = this.achievements.filter((a) => !a.unlocked);
      console.log(`[RA Runtime] Total active achievements: ${activeList.length}`);
      console.groupEnd();
    }

    const activeList = this.achievements.filter((a) => !a.unlocked && a.trigger);
    if (activeList.length === 0) return;

    const currentChallenges: MonitoredChallengeItem[] = [];

    for (const ach of activeList) {
      if (!ach.trigger) continue;

      const evalRes = RCheevosEngine.evaluateTriggerWithDebug(ach.trigger, this.memoryReader);

      // --- Progress & Challenge Indicators Calculation ---
      let currentValue = ach.trigger.measuredValue || 0;
      let targetValue = ach.trigger.measuredTarget || 0;
      let isMeasuredType = false;

      // Inspect conditions if targetValue is 0 or to calculate max hits
      const allCondSets = [];
      if (ach.trigger.requirement) allCondSets.push(ach.trigger.requirement);
      if (ach.trigger.alternative) allCondSets.push(...ach.trigger.alternative);

      for (const cs of allCondSets) {
        for (const cond of cs.conditions) {
          if (cond.type === RCConditionType.RC_CONDITION_MEASURED) {
            isMeasuredType = true;
          }
          if (cond.requiredHits > 0) {
            if (targetValue === 0) targetValue = cond.requiredHits;
            if (currentValue === 0) currentValue = cond.currentHits;
          }
        }
      }

      // Check step change in progress for progress notification
      const prevVal = this.prevProgressMap.get(ach.id) ?? 0;
      if (currentValue > prevVal && targetValue > 0) {
        console.group("%c[RA Progress Notification]", "color: #f59e0b; font-weight: bold; font-size: 13px;");
        console.log("%cAchievement:", "font-weight: bold;", ach.title);
        console.log("%cPrevious:", "font-weight: bold;", prevVal);
        console.log("%cCurrent:", "font-weight: bold;", currentValue);
        console.log("%cTarget:", "font-weight: bold;", targetValue);
        console.groupEnd();

        if (this.onProgressNotificationCallback) {
          this.onProgressNotificationCallback(ach, prevVal, currentValue, targetValue);
        }
      }
      this.prevProgressMap.set(ach.id, currentValue);

      // Build active challenge item if progress is active and not yet completed
      if (currentValue > 0 && targetValue > 0 && currentValue < targetValue) {
        const formattedProgress = ach.trigger.measuredAsPercent
          ? `${Math.floor((currentValue / targetValue) * 100)}%`
          : `${currentValue} / ${targetValue}`;

        const challengeItem: MonitoredChallengeItem = {
          id: ach.id,
          title: ach.title,
          description: ach.description,
          points: ach.points,
          badgeUrl: ach.badgeUrl,
          currentValue,
          targetValue,
          isPercent: ach.trigger.measuredAsPercent,
          formattedProgress,
        };

        currentChallenges.push(challengeItem);

        if (shouldLogDiagnostic) {
          console.groupCollapsed(`%c[RA Challenge Indicator] ${ach.title}`, "color: #eab308; font-weight: bold;");
          console.log("%cAchievement:", "font-weight: bold;", ach.title);
          console.log("%cID:", "font-weight: bold;", ach.id);
          console.log("%cType:", "font-weight: bold;", isMeasuredType ? "Measured" : "HitTarget");
          console.log("%cCurrent value:", "font-weight: bold;", currentValue);
          console.log("%cTarget value:", "font-weight: bold;", targetValue);
          console.log("%cProgress:", "font-weight: bold;", formattedProgress);
          console.groupEnd();
        }
      }

      // Check unlock state
      if (evalRes.state === RCTriggerState.RC_TRIGGER_STATE_TRIGGERED) {
        console.group("%c[RA rcheevos Frame Evaluation — UNLOCK DETECTED]", "color: #22c55e; font-weight: bold; font-size: 14px;");
        console.log("%cAchievement:", "font-weight: bold;", `${ach.title} (ID: ${ach.id})`);
        console.log("%cFrame:", "font-weight: bold;", this.frameIndex);
        console.log("%cTrigger:", "font-weight: bold;", ach.triggerStr);
        console.log("%cState Transition:", "font-weight: bold;", `${evalRes.frameDebug.triggerStateBefore} -> ${evalRes.frameDebug.triggerStateAfter}`);

        console.group("%cCondSets Breakdown:", "color: #eab308; font-weight: bold;");
        evalRes.frameDebug.groups.forEach((group) => {
          console.group(`CondSet [${group.groupName}] — Status: ${group.passed ? "PASSED" : group.isPaused ? "PAUSED" : group.wasReset ? "RESET" : "FAILED"}`);
          group.conditions.forEach((c) => {
            console.log(
              `  Cond #${c.index} [${c.type}] | Addr: ${c.leftAddr} | Val: ${c.leftVal} ${c.op} Expected: ${c.rightVal} | Hits: ${c.hitsBefore} -> ${c.hitsAfter}/${c.requiredHits} => ${c.finalPass ? "PASS" : "FAIL"}`
            );
          });
          console.groupEnd();
        });
        console.groupEnd();

        console.log("%cAction:", "font-weight: bold;", "Initiating Award Request Flow...");
        console.groupEnd();

        this.unlockAchievement(ach.id);
      }
    }

    // Update active challenges list if changed
    this.activeChallenges = currentChallenges;
    if (this.onChallengeIndicatorsCallback) {
      this.onChallengeIndicatorsCallback(currentChallenges);
    }

    this.lastEvaluationMs = performance.now() - tStart;
  }

  /**
   * Unlock an achievement, dispatch award to backend relay, validate response, and trigger UI toast.
   */
  public async unlockAchievement(achievementId: number) {
    const ach = this.achievements.find((a) => a.id === achievementId);
    if (!ach || ach.unlocked || ach.pipelineStatus === AchievementPipelineStatus.AWARD_PENDING) return;

    ach.detectionTime = new Date().toISOString();
    ach.pipelineStatus = AchievementPipelineStatus.LOCAL_TRIGGERED;

    ach.pipelineStatus = AchievementPipelineStatus.AWARD_PENDING;

    // 1. [RA Award Request] Log
    console.group("%c[RA Award Request]", "color: #3b82f6; font-weight: bold; font-size: 13px;");
    console.log("%cachievementId:", "font-weight: bold;", achievementId);
    console.log("%cgameId:", "font-weight: bold;", this.gameId);
    console.log("%cusername/userId:", "font-weight: bold;", this.userId);
    console.log("%cpayload:", "font-weight: bold;", {
      id: this.userId,
      achievement_id: achievementId,
      game_id: this.gameId,
    });
    console.groupEnd();

    let httpStatus = 0;
    let resData: any = {};

    if (this.userId && this.gameId) {
      try {
        const res = await userApi.awardRetroAchievement(this.userId, this.gameId, achievementId);
        httpStatus = res.status;
        resData = res.data;
      } catch (err: any) {
        httpStatus = err.response?.status || 500;
        resData = err.response?.data || { success: false, error: err.message };
      }
    }

    // 2. [RA Award Response] Log
    console.group("%c[RA Award Response]", "color: #a855f7; font-weight: bold; font-size: 13px;");
    console.log("%cstatus:", "font-weight: bold;", httpStatus);
    console.log("%cresponse body:", "font-weight: bold;", resData);
    console.log("%cparsed result:", "font-weight: bold;", {
      success: resData?.success,
      status: resData?.status,
      error: resData?.error,
    });
    console.groupEnd();

    // Determine final status based on backend response
    if (resData?.status === "ALREADY_UNLOCKED" || (resData?.error && String(resData.error).toLowerCase().includes("already"))) {
      ach.pipelineStatus = AchievementPipelineStatus.ALREADY_UNLOCKED;
    } else if (resData?.status === "AWARD_ACCEPTED" || resData?.success === true) {
      ach.pipelineStatus = AchievementPipelineStatus.AWARD_ACCEPTED;
    } else {
      ach.pipelineStatus = AchievementPipelineStatus.AWARD_REJECTED;
    }

    // Mark unlocked if accepted or already unlocked
    if (ach.pipelineStatus === AchievementPipelineStatus.AWARD_ACCEPTED || ach.pipelineStatus === AchievementPipelineStatus.ALREADY_UNLOCKED) {
      ach.unlocked = true;
    }

    // 3. [RA Achievement Pipeline] Summary Table Log
    console.group("%c[RA Achievement Pipeline]", "color: #22c55e; font-weight: bold; font-size: 14px;");
    console.table({
      "Achievement ID": ach.id,
      "Achievement Name": ach.title,
      "Trigger State": "RC_TRIGGER_STATE_TRIGGERED",
      "Detection Time": ach.detectionTime,
      "Award Request Sent": true,
      "Award HTTP Status": httpStatus,
      "Award Response": resData?.status || (resData?.success ? "SUCCESS" : "ERROR"),
      "Final Status": ach.pipelineStatus,
    });
    console.groupEnd();

    // 4. Trigger UI notification callback only on ACCEPTED or ALREADY_UNLOCKED
    if (
      (ach.pipelineStatus === AchievementPipelineStatus.AWARD_ACCEPTED ||
        ach.pipelineStatus === AchievementPipelineStatus.ALREADY_UNLOCKED) &&
      this.onUnlockCallback
    ) {
      this.onUnlockCallback(ach);
    }
  }
}

export const raRuntime = new RetroAchievementsRuntime();
