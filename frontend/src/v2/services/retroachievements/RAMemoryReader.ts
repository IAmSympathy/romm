import { RetroAchievementsMemory } from "./RetroAchievementsMemory";
import { RetroAchievementsMemoryProviderManager } from "./RetroAchievementsMemoryProvider";

/**
 * RAMemoryReader: WebAssembly memory abstraction for Libretro cores in EmulatorJS.
 * Delegating to RetroAchievementsMemory and RetroAchievementsMemoryProviderManager.
 */
export class RAMemoryReader {
  public raMemory: RetroAchievementsMemory = new RetroAchievementsMemory();
  public providerManager: RetroAchievementsMemoryProviderManager = new RetroAchievementsMemoryProviderManager();

  public getRAMInfo(): { offset: number; size: number; method: string } | null {
    if (!this.raMemory.isResolved) {
      const core = (window as any).EJS_core || "fceumm";
      this.providerManager.resolveActiveProvider();
      this.raMemory.resolveMemory(core);
    }

    if (!this.raMemory.isResolved) {
      return null;
    }

    return {
      offset: this.raMemory.ramOffset,
      size: this.raMemory.ramSize,
      method: this.raMemory.resolutionMethod,
    };
  }

  public getDiagnosticInfo(): {
    heapAvailable: boolean;
    heapSize: number;
    ramOffset: number;
    ramSize: number;
    source: string;
  } {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8 || null;

    if (!heap) {
      return {
        heapAvailable: false,
        heapSize: 0,
        ramOffset: 0,
        ramSize: 0,
        source: "window.EJS_emulator.Module.HEAPU8 missing",
      };
    }

    const info = this.getRAMInfo();
    return {
      heapAvailable: true,
      heapSize: heap.byteLength || heap.length || 0,
      ramOffset: info ? info.offset : 0,
      ramSize: info ? info.size : 0,
      source: info ? info.method : "UNRESOLVED (0x0)",
    };
  }

  public mapAddress(address: number, coreName?: string): number {
    if (coreName) {
      this.raMemory.activeCore = coreName.toLowerCase();
    }
    return this.raMemory.mapAddress(address);
  }

  public beginFrame() {
    this.raMemory.beginFrame();
  }

  public readMemory(
    address: number,
    size: 1 | 2 | 4 = 1,
    bit?: number | null,
    isDelta: boolean = false,
    isPrior: boolean = false,
    endian: "little" | "big" = "little"
  ): number {
    return this.raMemory.readMemory(address, size, bit, isDelta, isPrior, endian);
  }
}
