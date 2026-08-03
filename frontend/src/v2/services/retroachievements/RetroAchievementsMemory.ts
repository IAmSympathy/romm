import { RetroAchievementsMemoryProviderManager } from "./RetroAchievementsMemoryProvider";

/**
 * RetroAchievementsMemory: Explicit Memory Resolver and Multi-Frame Memory Tracker.
 * Manages current, delta (previous frame), and prior (last value before change) memory reads.
 */
export class RetroAchievementsMemory {
  public isResolved: boolean = false;
  public ramOffset: number = 0;
  public ramSize: number = 0;
  public resolutionMethod: string = "Unresolved";
  public activeCore: string = "fceumm";

  public providerManager: RetroAchievementsMemoryProviderManager = new RetroAchievementsMemoryProviderManager();

  private currentCache: Map<string, number> = new Map();
  private deltaCache: Map<string, number> = new Map();
  private priorCache: Map<string, number> = new Map();
  private lastFrameValues: Map<string, number> = new Map();
  private loggedReadAddresses: Set<number> = new Set();

  /**
   * Return human-readable memory domain.
   */
  public getMemoryDomain(): string {
    return "System RAM";
  }

  /**
   * Print Build Version Banner.
   */
  public logBuildVersion() {
    console.group("%c[RA Build Version]", "color: #10b981; font-weight: bold; font-size: 14px;");
    console.log("%cMemoryProvider version:", "font-weight: bold;", "2026.08.03.v5-full-rcheevos");
    console.groupEnd();
  }

  /**
   * Memory Discovery Debug: Probe candidate global paths for WASM HEAP.
   */
  public discoverMemory(): {
    heap: Uint8Array | null;
    mod: any;
    location: string;
  } {
    const emu = (window as any).EJS_emulator;
    const winMod = (window as any).Module;

    const candidatePaths = [
      { path: "window.EJS_emulator.gameManager.Module", mod: emu?.gameManager?.Module },
      { path: "window.EJS_emulator.Module", mod: emu?.Module },
      { path: "window.EJS_emulator.gameManager", mod: emu?.gameManager },
      { path: "window.Module", mod: winMod },
    ];

    let foundHeap: Uint8Array | null = null;
    let foundMod: any = null;
    let foundLocation = "none";

    for (const cand of candidatePaths) {
      if (cand.mod) {
        const h = cand.mod.HEAPU8 || cand.mod.buffer || (cand.mod.wasmMemory ? new Uint8Array(cand.mod.wasmMemory.buffer) : null);
        if (h && !foundHeap) {
          foundHeap = h;
          foundMod = cand.mod;
          foundLocation = `${cand.path}.HEAPU8 (${h.byteLength || h.length} bytes)`;
        }
      }
    }

    return { heap: foundHeap, mod: foundMod, location: foundLocation };
  }

  /**
   * Probe WebAssembly Module exports to find memory pointer.
   */
  public resolveMemory(coreName?: string): boolean {
    this.activeCore = (coreName || (window as any).EJS_core || "fceumm").toLowerCase();
    this.isResolved = false;

    const activeProv = this.providerManager.resolveActiveProvider();
    if (activeProv) {
      this.isResolved = true;
      this.ramOffset = (activeProv as any).ramOffset || 0;
      this.ramSize = (activeProv as any).ramSize || 2048;
      this.resolutionMethod = activeProv.name;
      return true;
    }

    const discovery = this.discoverMemory();
    if (!discovery.heap) {
      return false;
    }

    return false;
  }

  /**
   * Map RetroAchievements addresses to console system RAM offsets.
   */
  public mapAddress(address: number): number {
    const core = this.activeCore;
    if (core.includes("snes") || core.includes("bsnes")) return address & 0x1ffff;
    if (core.includes("sega") || core.includes("genesis") || core.includes("megadrive") || core.includes("picodrive")) return address & 0xffff;
    if (core.includes("gb") || core.includes("gambatte") || core.includes("sameboy") || core.includes("gearboy")) return address & 0x1fff;
    if (core.includes("gba") || core.includes("vba") || core.includes("mgba")) return address >= 0x02000000 ? (address - 0x02000000) & 0x3ffff : address & 0x3ffff;
    if (core.includes("n64") || core.includes("mupen64plus")) return address & 0x7fffff;
    if (core.includes("nes") || core.includes("fceumm") || core.includes("nestopia") || core.includes("mesen")) return address & 0x07ff;
    return address;
  }

  /**
   * Resolve an address to mapped address and WASM pointer.
   */
  public resolveAddress(address: number): { raAddress: number; mappedAddress: number; wasmPointer: number } {
    const mappedAddress = this.mapAddress(address);
    const wasmPointer = this.isResolved ? this.ramOffset + mappedAddress : 0;
    return { raAddress: address, mappedAddress, wasmPointer };
  }

  /**
   * Synchronize frame delta and prior memory state caches at the start of each evaluation frame.
   */
  public beginFrame() {
    for (const [key, currVal] of this.currentCache.entries()) {
      const prevVal = this.lastFrameValues.get(key);
      if (prevVal !== undefined && prevVal !== currVal) {
        this.priorCache.set(key, prevVal);
      }
      this.lastFrameValues.set(key, currVal);
    }
    this.deltaCache = new Map(this.currentCache);
    this.currentCache.clear();
  }

  /**
   * Unified memory reading method supporting size (1, 2, 4), bit extraction, endianness, delta, and prior.
   */
  public readMemory(
    address: number,
    size: 1 | 2 | 4 = 1,
    bit?: number | null,
    isDelta: boolean = false,
    isPrior: boolean = false,
    endian: "little" | "big" = "little"
  ): number {
    const mappedAddress = this.mapAddress(address);
    const cacheKey = `${size}:${mappedAddress}:${bit ?? "all"}`;

    if (isPrior) {
      if (this.priorCache.has(cacheKey)) return this.priorCache.get(cacheKey)!;
      if (this.deltaCache.has(cacheKey)) return this.deltaCache.get(cacheKey)!;
    } else if (isDelta) {
      if (this.deltaCache.has(cacheKey)) return this.deltaCache.get(cacheKey)!;
    } else if (this.currentCache.has(cacheKey)) {
      return this.currentCache.get(cacheKey)!;
    }

    let val = 0;
    if (this.providerManager.activeProvider) {
      if (size === 1) val = this.providerManager.readByte(mappedAddress, bit);
      else if (size === 2) val = this.providerManager.readWord(mappedAddress, false, endian);
      else if (size === 4) val = this.providerManager.readDword(mappedAddress, false, endian);
    } else if (this.isResolved) {
      const { wasmPointer } = this.resolveAddress(address);
      const discovery = this.discoverMemory();
      const heap = discovery.heap;
      if (heap && wasmPointer < heap.length) {
        if (size === 1) {
          val = heap[wasmPointer];
          if (bit !== undefined && bit !== null && bit >= 0 && bit <= 7) {
            val = (val >> bit) & 1;
          }
        } else if (size === 2 && wasmPointer + 1 < heap.length) {
          val = endian === "little"
            ? heap[wasmPointer] | (heap[wasmPointer + 1] << 8)
            : (heap[wasmPointer] << 8) | heap[wasmPointer + 1];
        } else if (size === 4 && wasmPointer + 3 < heap.length) {
          val = endian === "little"
            ? (heap[wasmPointer] | (heap[wasmPointer + 1] << 8) | (heap[wasmPointer + 2] << 16) | (heap[wasmPointer + 3] << 24)) >>> 0
            : ((heap[wasmPointer] << 24) | (heap[wasmPointer + 1] << 16) | (heap[wasmPointer + 2] << 8) | heap[wasmPointer + 3]) >>> 0;
        }
      }
    }

    if (!this.loggedReadAddresses) {
      this.loggedReadAddresses = new Set();
    }
    if (!this.loggedReadAddresses.has(address)) {
      this.loggedReadAddresses.add(address);
      const provName = this.providerManager.activeProvider?.name || this.resolutionMethod || "Direct WASM Heap";
      const heapPtr = this.ramOffset + mappedAddress;
      console.group(`%c[RA Memory Read Diagnostic] Address 0x${address.toString(16).toUpperCase()}`, "color: #06b6d4; font-weight: bold;");
      console.log("%cAdresse demandée (rcheevos):", "font-weight: bold;", `0x${address.toString(16).toUpperCase()} (${address})`);
      console.log("%cMapped Offset:", "font-weight: bold;", `0x${mappedAddress.toString(16).toUpperCase()} (${mappedAddress})`);
      console.log("%cProvider mémoire utilisé:", "font-weight: bold;", provName);
      console.log("%cTaille disponible:", "font-weight: bold;", `${this.ramSize} bytes`);
      console.log("%cOffset réellement lu (Heap PTR):", "font-weight: bold;", `0x${heapPtr.toString(16).toUpperCase()} (${heapPtr})`);
      console.log("%cValeur lue:", "font-weight: bold;", val);
      console.groupEnd();
    }

    if (!isDelta && !isPrior) {
      this.currentCache.set(cacheKey, val);
    }
    return val;
  }

  public readByte(address: number, bit?: number | null, isDelta: boolean = false, isPrior: boolean = false): number {
    return this.readMemory(address, 1, bit, isDelta, isPrior);
  }

  public readWord(address: number, isDelta: boolean = false, isPrior: boolean = false, endian: "little" | "big" = "little"): number {
    return this.readMemory(address, 2, null, isDelta, isPrior, endian);
  }

  public readDword(address: number, isDelta: boolean = false, isPrior: boolean = false, endian: "little" | "big" = "little"): number {
    return this.readMemory(address, 4, null, isDelta, isPrior, endian);
  }
}
