import userApi from "@/services/api/user";
import { RAMemoryReader } from "./RAMemoryReader";
import { RATriggerParser, type RATrigger } from "./RATriggerParser";

export interface MonitoredAchievement {
  id: number;
  title: string;
  points: number;
  badgeUrl?: string;
  triggerStr: string;
  trigger: RATrigger | null;
  unlocked: boolean;
}

export class RetroAchievementsRuntime {
  public memoryReader: RAMemoryReader = new RAMemoryReader();
  public achievements: MonitoredAchievement[] = [];
  public userId: number | null = null;
  public gameId: number | null = null;
  public isRunning: boolean = false;
  private animFrameId: number | null = null;
  private checkFrequencyHz: number = 60; // 60 Hz frame-synchronous evaluation (16.6ms)
  public onUnlockCallback?: (achievement: MonitoredAchievement) => void;

  private warmupTicks: number = 0;
  private warmupTarget: number = 180; // 180 frames (~3s at 60FPS) warmup delay
  private warmupCompleted: boolean = false;
  private frameIndex: number = 0;

  // Real-time FPS & Frequency Diagnostic Counters
  private lastTickTimestamp: number = performance.now();
  private tickTimestamps: number[] = [];
  public checksPerSecond: number = 60.0;
  public lastEvaluationMs: number = 0;

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
    this.loadAchievements(rawAchievements);
  }

  /**
   * Load and parse achievements list.
   */
  public loadAchievements(rawAchievements: any[]) {
    this.achievements = [];
    for (const raw of rawAchievements) {
      this.achievements.push(this.parseAchievement(raw));
    }
  }

  /**
   * Parse a single achievement entry into a MonitoredAchievement.
   */
  public parseAchievement(raw: any): MonitoredAchievement {
    const triggerStr = raw.MemAddr || raw.conditions || raw.trigger || "";
    let parsedTrigger: RATrigger | null = null;

    try {
      if (triggerStr) {
        parsedTrigger = RATriggerParser.parseTrigger(triggerStr);
      }
    } catch (err) {
      console.warn(`[RA Runtime] Failed to parse trigger for achievement ${raw.id}:`, err);
    }

    return {
      id: Number(raw.id || raw.ID),
      title: raw.title || raw.Title || "Untitled",
      points: Number(raw.points || raw.Points || 0),
      badgeUrl: raw.badgeUrl,
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

    const core = (window as any).EJS_core || "fceumm";

    this.memoryReader.raMemory.resolveMemory(core);

    console.group("%c[RA Runtime 60Hz Engine]", "color: #22c55e; font-weight: bold; font-size: 14px;");
    console.log("%cGame ID:", "font-weight: bold;", this.gameId);
    console.log("%cCore:", "font-weight: bold;", core);
    console.log("%cAchievements loaded:", "font-weight: bold;", this.achievements.length);
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
  public readMemory(address: number, size: 1 | 2 | 4 = 1, isDelta: boolean = false, isPrior: boolean = false): number {
    return this.memoryReader.readMemory(address, size, null, isDelta, isPrior);
  }

  /**
   * Detect if NES Super Mario Bros or core game is in Title / Demo Mode.
   */
  public isDemoModeActive(): boolean {
    const core = ((window as any).EJS_core || "fceumm").toLowerCase();
    if (core.includes("fceumm") || core.includes("nestopia") || core.includes("nes")) {
      const gameState = this.readMemory(0x0770, 1);
      if (gameState === 0) return true; // 0 = Title Screen / Demo Mode in SMB NES
    }
    return false;
  }

  /**
   * Evaluate active achievements frame by frame against core RAM.
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

    // Retry resolution if core WASM was still booting during start()
    if (!this.memoryReader.raMemory.isResolved) {
      const core = (window as any).EJS_core || "fceumm";
      const resolved = this.memoryReader.raMemory.resolveMemory(core);
      if (!resolved) return;
    }

    this.frameIndex++;

    // Advance frame delta & prior memory cache tracking
    this.memoryReader.beginFrame();

    // 1. Warmup / Game Stabilization Guard Rail
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

    const demoDetected = this.isDemoModeActive();
    const shouldLogDiagnostic = this.frameIndex % 300 === 0; // Log frequency diagnostic every 5 seconds (300 frames)

    if (shouldLogDiagnostic) {
      console.groupCollapsed(`%c[RA Evaluation Frequency] Frame #${this.frameIndex}`, "color: #3b82f6; font-weight: bold;");
      console.log("%c[RA Frequency Stats]", "color: #06b6d4; font-weight: bold;", {
        "Current frame": this.frameIndex,
        "Checks per second": `${this.checksPerSecond.toFixed(1)} Hz`,
        "Last evaluation time": `${this.lastEvaluationMs.toFixed(3)} ms`,
        "Demo State Detected": demoDetected ? "YES (Evaluation guarded/reset)" : "NO (In-Game)",
      });

      const memInfo = this.memoryReader.getDiagnosticInfo();
      console.log("%c[RA Memory Info]", "font-weight: bold;", {
        heapAvailable: memInfo.heapAvailable,
        heapSize: `${memInfo.heapSize} bytes`,
        ramOffset: `0x${memInfo.ramOffset.toString(16).toUpperCase()}`,
        ramSize: `${memInfo.ramSize} bytes`,
        source: memInfo.source,
      });

      const activeList = this.achievements.filter((a) => !a.unlocked);
      console.log(`[RA Runtime] Total active achievements: ${activeList.length}`);
      console.groupEnd();
    }

    const activeList = this.achievements.filter((a) => !a.unlocked && a.trigger);
    if (activeList.length === 0) return;

    for (const ach of activeList) {
      if (!ach.trigger) continue;

      const isSatisfied = RATriggerParser.evaluateTrigger(ach.trigger, this.memoryReader);

      if (isSatisfied) {
        const condDetails = ach.trigger.coreGroup.conditions.map((cond, idx) => {
          const leftVal = RATriggerParser.evaluateOperand(cond.left, this.memoryReader);
          const deltaVal = cond.left.type === "mem" ? this.readMemory(cond.left.address, cond.left.size, true) : null;
          const rightVal = RATriggerParser.evaluateOperand(cond.right, this.memoryReader);
          return {
            index: idx + 1,
            flag: cond.flag,
            operator: cond.operator,
            address: cond.left.type === "mem" ? `0x${cond.left.address.toString(16).toUpperCase()}` : "val",
            currentVal: leftVal,
            deltaVal: deltaVal,
            expectedVal: rightVal,
            currentHits: cond.currentHits,
            targetHits: cond.targetHits,
            satisfied: cond.targetHits > 0 ? cond.currentHits >= cond.targetHits : true,
          };
        });

        console.group("%c[RA Achievement Evaluation — UNLOCK DETECTED]", "color: #22c55e; font-weight: bold; font-size: 14px;");
        console.log("%cAchievement:", "font-weight: bold;", ach.title);
        console.log("%cFrame:", "font-weight: bold;", this.frameIndex);
        console.log("%cTrigger:", "font-weight: bold;", ach.triggerStr);
        console.log("%cChecks per second:", "font-weight: bold;", `${this.checksPerSecond.toFixed(1)} Hz`);
        console.log("%cDemo Mode Active:", "font-weight: bold;", demoDetected ? "YES" : "NO");

        console.group("%cConditions Breakdown:", "color: #eab308; font-weight: bold;");
        condDetails.forEach((c) => {
          console.log(
            `Condition #${c.index} [${c.flag}] | Address: ${c.address} | Current: ${c.currentVal} (Delta: ${c.deltaVal}) ${c.operator} Expected: ${c.expectedVal} | Hits: ${c.currentHits}/${c.targetHits} => Result: TRUE`
          );
        });
        console.groupEnd();

        console.log("%cAction:", "font-weight: bold;", "Unlocking achievement now!");
        console.groupEnd();

        this.unlockAchievement(ach.id);
      }
    }

    this.lastEvaluationMs = performance.now() - tStart;
  }

  /**
   * Unlock an achievement, dispatch award to backend relay, and trigger UI toast.
   */
  public async unlockAchievement(achievementId: number) {
    const ach = this.achievements.find((a) => a.id === achievementId);
    if (!ach || ach.unlocked) return;

    ach.unlocked = true;

    if (this.onUnlockCallback) {
      this.onUnlockCallback(ach);
    }

    if (this.userId && this.gameId) {
      try {
        console.log(`[RA Runtime] Submitting award to backend: game=${this.gameId}, ach=${achievementId}`);
        const res = await userApi.awardRetroAchievement(this.userId, this.gameId, achievementId);
        if (res.data.success) {
          console.log("[RA Runtime] Unlock successfully recorded on RetroAchievements!");
        } else {
          console.warn("[RA Runtime] Unlock submission returned error:", res.data.error);
        }
      } catch (err) {
        console.error("[RA Runtime] Failed to submit achievement unlock:", err);
      }
    }
  }
}

export const raRuntime = new RetroAchievementsRuntime();
