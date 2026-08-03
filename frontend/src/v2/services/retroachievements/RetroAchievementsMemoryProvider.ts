export interface IMemoryProvider {
  name: string;
  isAvailable(): boolean;
  resolve(): boolean;
  readByte(address: number, bit?: number | null, isDelta?: boolean): number;
  readWord(address: number, isDelta?: boolean, endian?: "little" | "big"): number;
  readDword(address: number, isDelta?: boolean, endian?: "little" | "big"): number;
}

/**
 * Diagnostic logger for Emscripten & WASM exports.
 */
export function logWASMBinaryDetails() {
  const emu = (window as any).EJS_emulator;
  const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
  if (!mod) return;

  const asm = mod.asm || mod.wasmExports || {};
  const allModKeys = Object.keys(mod);
  const allAsmKeys = Object.keys(asm);
  const combinedKeys = Array.from(new Set(allModKeys.concat(allAsmKeys)));

  console.group("%c[RA WASM Deep Binary Inspection]", "color: #9333ea; font-weight: bold; font-size: 14px;");

  for (const fnName of ["EmulatorJSGetMemoryData", "_get_memory_data", "retro_get_memory_data", "_retro_get_memory_data"]) {
    const fn = mod[fnName] || asm[fnName];
    if (typeof fn === "function") {
      console.log(`%c[Function Source Dump] ${fnName}:`, "font-weight: bold; color: #a855f7;", {
        length: fn.length,
        source: fn.toString(),
      });
    } else {
      console.log(`[Function Source Dump] ${fnName}: Missing`);
    }
  }

  const searchKeywords = ["memory", "ram", "system", "save", "work", "cpu"];
  const matchingKeys = combinedKeys.filter((k) => {
    const lk = k.toLowerCase();
    return searchKeywords.some((kw) => lk.includes(kw));
  });

  console.log("%c[Keys matching memory/ram/system/save/work/cpu]:", "font-weight: bold; color: #3b82f6;", matchingKeys);
  console.log("%c[Complete WASM Export List]:", "font-weight: bold;", allAsmKeys);
  console.groupEnd();
}

/**
 * Strategy 1: EmulatorJSMemoryProvider
 * Tests standard Libretro memory key constants on EmulatorJSGetMemoryData(key).
 */
export class EmulatorJSMemoryProvider implements IMemoryProvider {
  public name = "EmulatorJS Custom Memory API Provider";
  public ramOffset: number = 0;
  public ramSize: number = 0;
  public isResolvedState: boolean = false;
  public activeFnName: string = "";

  public isAvailable(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const asm = mod?.asm || mod?.wasmExports || {};
    return typeof mod?.EmulatorJSGetMemoryData === "function" ||
      typeof asm?.EmulatorJSGetMemoryData === "function" ||
      typeof mod?._get_memory_data === "function" ||
      typeof asm?._get_memory_data === "function";
  }

  public resolve(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    if (!mod || !mod.HEAPU8) return false;

    const asm = mod.asm || mod.wasmExports || {};
    const validKeys: { key: string; result: any; pointer: number; size: number }[] = [];

    const fnToTest = mod.EmulatorJSGetMemoryData || asm.EmulatorJSGetMemoryData || mod._get_memory_data || asm._get_memory_data;

    const knownKeys = [
      "RETRO_MEMORY_SYSTEM_RAM",
      "RETRO_MEMORY_SAVE_RAM",
      "RETRO_MEMORY_VIDEO_RAM",
      "RETRO_MEMORY_RTC",
    ];

    if (typeof fnToTest === "function") {
      for (const strKey of knownKeys) {
        try {
          const res = fnToTest(strKey);
          if (res !== null && res !== undefined) {
            let ptr = 0;
            let sz = 0x80000;
            if (typeof res === "number" && res > 0 && res < mod.HEAPU8.length) {
              ptr = res;
            } else if (res instanceof Uint8Array || ArrayBuffer.isView(res)) {
              ptr = (res as any).byteOffset || 0;
              sz = (res as any).byteLength || 0x80000;
            } else if (typeof res === "object" && (res.buffer || res.pointer)) {
              ptr = res.byteOffset || res.pointer || 0;
              sz = res.byteLength || res.size || 0x80000;
            }

            if (ptr > 0 || (typeof res === "object" && res)) {
              validKeys.push({ key: strKey, result: res, pointer: ptr, size: sz });
              if (ptr > 0 && !this.isResolvedState) {
                this.ramOffset = ptr;
                this.ramSize = sz;
                this.isResolvedState = true;
                this.activeFnName = `EmulatorJSGetMemoryData("${strKey}")`;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    console.group("%c[RA EmulatorJS Valid Memory Keys]", "color: #10b981; font-weight: bold; font-size: 14px;");
    if (validKeys.length > 0) {
      for (const vk of validKeys) {
        console.log(`%ckey: "${vk.key}", pointer: 0x${vk.pointer.toString(16).toUpperCase()}, size: ${vk.size}`, "color: #22c55e; font-weight: bold;");
      }
    } else {
      console.log(`Tested ${knownKeys.length} known Libretro memory key constants. Awaiting key match...`);
    }
    console.groupEnd();

    return this.isResolvedState;
  }

  public readByte(address: number, bit?: number | null): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr >= heap.length) return 0;
    let val = heap[ptr];
    if (bit !== undefined && bit !== null && bit >= 0 && bit <= 7) {
      val = (val >> bit) & 1;
    }
    return val;
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 1 >= heap.length) return 0;
    return endian === "little" ? heap[ptr] | (heap[ptr + 1] << 8) : (heap[ptr] << 8) | heap[ptr + 1];
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 3 >= heap.length) return 0;
    return endian === "little"
      ? (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0
      : ((heap[ptr] << 24) | (heap[ptr + 1] << 16) | (heap[ptr + 2] << 8) | heap[ptr + 3]) >>> 0;
  }
}

/**
 * Strategy 2: LibretroMemoryProvider
 */
export class LibretroMemoryProvider implements IMemoryProvider {
  public name = "Libretro C API Provider";
  public ramOffset: number = 0;
  public ramSize: number = 0;
  public isResolvedState: boolean = false;

  public isAvailable(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const asm = mod?.asm || mod?.wasmExports || {};
    return typeof mod?._retro_get_memory_data === "function" ||
      typeof asm?._retro_get_memory_data === "function" ||
      typeof asm?.retro_get_memory_data === "function" ||
      typeof mod?.ccall === "function";
  }

  public resolve(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    if (!mod || !mod.HEAPU8) return false;

    const asm = mod.asm || mod.wasmExports || {};
    const getData = (id: number): number => {
      try {
        if (typeof mod._retro_get_memory_data === "function") return mod._retro_get_memory_data(id);
        if (typeof asm._retro_get_memory_data === "function") return asm._retro_get_memory_data(id);
        if (typeof asm.retro_get_memory_data === "function") return asm.retro_get_memory_data(id);
        if (typeof mod.ccall === "function") return mod.ccall("retro_get_memory_data", "number", ["number"], [id]);
      } catch {
        // ignore
      }
      return 0;
    };

    for (const sysId of [2, 1, 0]) {
      const ptr = getData(sysId);
      if (typeof ptr === "number" && ptr > 0) {
        this.ramOffset = ptr;
        this.ramSize = 0x80000;
        this.isResolvedState = true;
        return true;
      }
    }
    return false;
  }

  public readByte(address: number, bit?: number | null): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr >= heap.length) return 0;
    let val = heap[ptr];
    if (bit !== undefined && bit !== null && bit >= 0 && bit <= 7) {
      val = (val >> bit) & 1;
    }
    return val;
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 1 >= heap.length) return 0;
    return endian === "little" ? heap[ptr] | (heap[ptr + 1] << 8) : (heap[ptr] << 8) | heap[ptr + 1];
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 3 >= heap.length) return 0;
    return endian === "little"
      ? (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0
      : ((heap[ptr] << 24) | (heap[ptr + 1] << 16) | (heap[ptr + 2] << 8) | heap[ptr + 3]) >>> 0;
  }
}

/**
 * Strategy 3: EmulatorJSWasmMemoryProvider
 */
export class EmulatorJSWasmMemoryProvider implements IMemoryProvider {
  public name = "EmulatorJS WASM Memory Provider";
  public ramOffset: number = 0;
  public ramSize: number = 0;
  public isResolvedState: boolean = false;

  public isAvailable(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    return !!(emu?.gameManager || mod);
  }

  public resolve(): boolean {
    const emu = (window as any).EJS_emulator;
    const gameMgr = emu?.gameManager;
    const mod = gameMgr?.Module || emu?.Module || (window as any).Module;

    try {
      if (typeof gameMgr?.getRAM === "function") {
        const ram = gameMgr.getRAM();
        if (ram && ram.byteOffset !== undefined && ram.byteLength > 0) {
          this.ramOffset = ram.byteOffset;
          this.ramSize = ram.byteLength;
          this.isResolvedState = true;
          return true;
        }
      }
    } catch {
      // ignore
    }

    if (mod) {
      const candidates = ["_RAM", "RAM", "_system_ram", "_nes_ram", "_WRAM", "WRAM"];
      for (const k of candidates) {
        const val = mod[k];
        if (typeof val === "number" && val > 0 && val < (mod.HEAPU8?.length || 0)) {
          this.ramOffset = val;
          this.ramSize = 0x80000;
          this.isResolvedState = true;
          return true;
        }
      }
    }

    return false;
  }

  public readByte(address: number, bit?: number | null): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr >= heap.length) return 0;
    let val = heap[ptr];
    if (bit !== undefined && bit !== null && bit >= 0 && bit <= 7) {
      val = (val >> bit) & 1;
    }
    return val;
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 1 >= heap.length) return 0;
    return endian === "little" ? heap[ptr] | (heap[ptr + 1] << 8) : (heap[ptr] << 8) | heap[ptr + 1];
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 3 >= heap.length) return 0;
    return endian === "little"
      ? (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0
      : ((heap[ptr] << 24) | (heap[ptr + 1] << 16) | (heap[ptr + 2] << 8) | heap[ptr + 3]) >>> 0;
  }
}

/**
 * Strategy 4: CoreSpecificMemoryProvider
 */
export class CoreSpecificMemoryProvider implements IMemoryProvider {
  public name = "Core Specific Memory Provider";
  public ramOffset: number = 0;
  public ramSize: number = 0;
  public isResolvedState: boolean = false;

  public isAvailable(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    return !!(mod?.HEAPU8);
  }

  public resolve(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    if (!mod || !mod.HEAPU8) return false;

    if (mod.wasmTable && typeof mod.wasmTable.get === "function") {
      try {
        const tableLen = mod.wasmTable.length || 1000;
        for (let i = 0; i < Math.min(tableLen, 500); i++) {
          try {
            const fn = mod.wasmTable.get(i);
            if (typeof fn === "function" && fn.length === 1) {
              for (const sysId of [2, 1, 0]) {
                const ptr = fn(sysId);
                if (typeof ptr === "number" && ptr > 0x10000 && ptr < mod.HEAPU8.length) {
                  this.ramOffset = ptr;
                  this.ramSize = 0x80000;
                  this.isResolvedState = true;
                  return true;
                }
              }
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
    return false;
  }

  public readByte(address: number, bit?: number | null): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr >= heap.length) return 0;
    let val = heap[ptr];
    if (bit !== undefined && bit !== null && bit >= 0 && bit <= 7) {
      val = (val >> bit) & 1;
    }
    return val;
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 1 >= heap.length) return 0;
    return endian === "little" ? heap[ptr] | (heap[ptr + 1] << 8) : (heap[ptr] << 8) | heap[ptr + 1];
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 3 >= heap.length) return 0;
    return endian === "little"
      ? (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0
      : ((heap[ptr] << 24) | (heap[ptr + 1] << 16) | (heap[ptr + 2] << 8) | heap[ptr + 3]) >>> 0;
  }
}

/**
 * Strategy 5: WasmHeapScannerProvider
 * Live HEAPU8 snapshot mutation scanner to detect dynamic RAM regions during active gameplay.
 */
export class WasmHeapScannerProvider implements IMemoryProvider {
  public name = "WASM Heap Pointer Scanner Provider";
  public ramOffset: number = 0;
  public ramSize: number = 0x80000;
  public isResolvedState: boolean = false;

  private firstSnapshot: Uint8Array | null = null;
  private scanFrameCount: number = 0;

  public isAvailable(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    return !!(mod?.HEAPU8);
  }

  public resolve(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    if (!mod || !mod.HEAPU8) return false;

    const heap = mod.HEAPU8;
    this.scanFrameCount++;

    if (!this.firstSnapshot || this.firstSnapshot.length !== heap.length) {
      this.firstSnapshot = new Uint8Array(heap.length);
      this.firstSnapshot.set(heap);
      return false;
    }

    if (this.scanFrameCount % 30 !== 0) {
      return this.isResolvedState;
    }

    const candidateOffsets: { offset: number; mutations: number }[] = [];
    const stepSize = 1024;

    for (let offset = 0x10000; offset < Math.min(heap.length - 2048, 0x4000000); offset += stepSize) {
      let mutations = 0;
      for (let i = 0; i < 2048; i++) {
        if (heap[offset + i] !== this.firstSnapshot[offset + i]) {
          mutations++;
        }
      }
      if (mutations >= 10 && mutations <= 400) {
        candidateOffsets.push({ offset, mutations });
      }
    }

    this.firstSnapshot.set(heap);

    if (candidateOffsets.length > 0) {
      candidateOffsets.sort((a, b) => b.mutations - a.mutations);
      const bestCandidate = candidateOffsets[0];
      this.ramOffset = bestCandidate.offset;
      this.isResolvedState = true;

      console.group("%c[RA HEAP Scanner Candidates]", "color: #ec4899; font-weight: bold; font-size: 14px;");
      console.log(`%cFound ${candidateOffsets.length} active RAM candidate regions!`, "color: #22c55e; font-weight: bold;");
      console.log("%cTop Candidate #1:", "font-weight: bold;", {
        offset: `0x${bestCandidate.offset.toString(16).toUpperCase()}`,
        mutationsPerSec: bestCandidate.mutations,
        "readByte(0x0000)": heap[bestCandidate.offset],
        "readByte(0x0009)": heap[bestCandidate.offset + 0x0009],
      });
      console.log("%cAll Candidates:", "font-weight: bold;", candidateOffsets.map(c => `0x${c.offset.toString(16).toUpperCase()} (${c.mutations} mut/s)`));
      console.groupEnd();

      return true;
    }

    return false;
  }

  public readByte(address: number, bit?: number | null): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr >= heap.length) return 0;
    let val = heap[ptr];
    if (bit !== undefined && bit !== null && bit >= 0 && bit <= 7) {
      val = (val >> bit) & 1;
    }
    return val;
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 1 >= heap.length) return 0;
    return endian === "little" ? heap[ptr] | (heap[ptr + 1] << 8) : (heap[ptr] << 8) | heap[ptr + 1];
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    const ptr = this.ramOffset + address;
    if (!heap || ptr + 3 >= heap.length) return 0;
    return endian === "little"
      ? (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0
      : ((heap[ptr] << 24) | (heap[ptr + 1] << 16) | (heap[ptr + 2] << 8) | heap[ptr + 3]) >>> 0;
  }
}

/**
 * RetroAchievementsMemoryProviderManager: Pluggable manager orchestrating all Memory Provider strategies.
 */
export class RetroAchievementsMemoryProviderManager {
  public providers: IMemoryProvider[] = [
    new EmulatorJSMemoryProvider(),
    new LibretroMemoryProvider(),
    new EmulatorJSWasmMemoryProvider(),
    new CoreSpecificMemoryProvider(),
    new WasmHeapScannerProvider(),
  ];

  public activeProvider: IMemoryProvider | null = null;

  public resolveActiveProvider(): IMemoryProvider | null {
    logWASMBinaryDetails();

    console.group("%c[RA Memory Provider Selection]", "color: #3b82f6; font-weight: bold; font-size: 14px;");

    for (const p of this.providers) {
      if (p.isAvailable()) {
        const resolved = p.resolve();
        if (resolved) {
          this.activeProvider = p;
          console.log("%cSelected provider:", "color: #22c55e; font-weight: bold;", p.name);
          console.log("%cSample Byte Reads:", "font-weight: bold;", {
            "readByte(0x0000)": p.readByte(0x0000),
            "readByte(0x075A)": p.readByte(0x075A),
            "readByte(0x07FF)": p.readByte(0x07FF),
          });
          console.groupEnd();
          return p;
        }
      }
    }

    this.activeProvider = null;
    console.log("%cSelected provider:", "color: #ef4444; font-weight: bold;", "None (Awaiting WASM Heap Scanner snapshot...)");
    console.groupEnd();
    return null;
  }

  public readByte(address: number, bit?: number | null, isDelta?: boolean): number {
    if (!this.activeProvider) return 0;
    return this.activeProvider.readByte(address, bit, isDelta);
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.activeProvider) return 0;
    return this.activeProvider.readWord(address, isDelta, endian);
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little"): number {
    if (!this.activeProvider) return 0;
    return this.activeProvider.readDword(address, isDelta, endian);
  }
}
