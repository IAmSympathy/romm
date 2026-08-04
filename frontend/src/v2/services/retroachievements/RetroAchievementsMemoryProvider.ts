export interface MemoryRegion {
  source: string;
  cpuStart: number;
  cpuEnd: number;
  wasmPointer: number;
  size: number;
}

export class MemoryRegionResolver {
  public regions: MemoryRegion[] = [];
  public unmappedAddressesCount: Map<number, number> = new Map();
  private loggedUnmappedSet: Set<number> = new Set();

  public registerRegion(region: MemoryRegion) {
    this.regions.push(region);
    console.log(
      `%c[RA MemoryRegionResolver] Registered region "${region.source}": CPU 0x${region.cpuStart.toString(16).toUpperCase()}-0x${region.cpuEnd.toString(16).toUpperCase()} -> WASM 0x${region.wasmPointer.toString(16).toUpperCase()} (${region.size} bytes)`,
      "color: #10b981; font-weight: bold;"
    );
  }

  public clear() {
    this.regions = [];
    this.unmappedAddressesCount.clear();
    this.loggedUnmappedSet.clear();
  }

  public resolveWasmPointer(cpuAddress: number): { wasmPointer: number; region: MemoryRegion | null; isUnmapped: boolean } {
    for (const reg of this.regions) {
      if (cpuAddress >= reg.cpuStart && cpuAddress <= reg.cpuEnd) {
        const offset = cpuAddress - reg.cpuStart;
        if (offset >= 0 && offset < reg.size) {
          return { wasmPointer: reg.wasmPointer + offset, region: reg, isUnmapped: false };
        }
      }
    }

    if (!this.loggedUnmappedSet.has(cpuAddress)) {
      this.loggedUnmappedSet.add(cpuAddress);
      const addrHex = `0x${cpuAddress.toString(16).toUpperCase().padStart(4, "0")}`;
      console.warn(`[RA Unmapped Memory] CPU address ${addrHex} is UNMAPPED (no matching memory region). Returning 0.`);
    }
    const count = this.unmappedAddressesCount.get(cpuAddress) || 0;
    this.unmappedAddressesCount.set(cpuAddress, count + 1);

    return { wasmPointer: -1, region: null, isUnmapped: true };
  }
}

export interface HRAMCandidate {
  wasmPointer: number;
  label: string;
  asciiRatio: number;
  uniqueBytes: number;
  zeroRatio: number;
  ffRatio: number;
  changedBytesCount: number;
  confidenceScore: number;
  accepted: boolean;
  reason: string;
  sampleHex: string;
}

export class GambatteHRAMResolver {
  public name = "Gambatte Core HRAM Resolver";

  public resolveHRAM(ramOffset: number, ramSize: number, heap: Uint8Array, mod: any): MemoryRegion | null {
    if (ramOffset <= 0 || !heap) return null;

    console.group("%c[RA Gambatte HRAM Resolver Structural Inspection]", "color: #ec4899; font-weight: bold; font-size: 14px;");

    const asm = mod?.asm || mod?.wasmExports || {};
    const symbolKeys = ["_hram", "hram", "_hram_", "_io_ram", "_gambatte_hram", "hram_"];
    let foundPtr = 0;
    let foundSymbol = "";

    for (const key of symbolKeys) {
      const sym = mod?.[key] || asm?.[key];
      if (typeof sym === "number" && sym > 0 && sym < heap.length) {
        foundPtr = sym;
        foundSymbol = key;
        break;
      }
    }

    if (foundPtr > 0) {
      const sampleHexArr: string[] = [];
      for (let i = 0; i < 16 && foundPtr + i < heap.length; i++) {
        sampleHexArr.push(heap[foundPtr + i].toString(16).toUpperCase().padStart(2, "0"));
      }

      console.log(
        `%c[RA Gambatte HRAM Resolver] Status: EXPLICIT WASM SYMBOL FOUND ("${foundSymbol}" at 0x${foundPtr.toString(16).toUpperCase()})`,
        "color: #10b981; font-weight: bold;"
      );
      console.log("%cSample Hex:", "font-weight: bold;", sampleHexArr.join(" "));
      console.groupEnd();

      return {
        source: `Gambatte HRAM (WASM Symbol: ${foundSymbol})`,
        cpuStart: 0xff80,
        cpuEnd: 0xfffe,
        wasmPointer: foundPtr,
        size: 127,
      };
    }

    console.log(
      "%c[RA Gambatte HRAM Resolver] Status: NOT EXPOSED BY WASM BUILD\n" +
      "Gambatte core retro_get_memory_data(RETRO_MEMORY_SYSTEM_RAM) returns only 8192B WRAM.\n" +
      "HRAM (0xFF80-0xFFFE) is an internal C++ member unexported in this WASM binary build.\n" +
      "CPU addresses 0xFF80-0xFFFE are safely handled as UNMAPPED (returning 0) without blind heap scanning.",
      "color: #f59e0b; font-weight: bold;"
    );
    console.groupEnd();

    return null;
  }
}

export interface IMemoryProvider {
  name: string;
  resolver?: MemoryRegionResolver;
  isAvailable(): boolean;
  resolve(): boolean;
  readByte(address: number, bit?: number | null, realAddress?: number): number;
  readWord(address: number, isDelta?: boolean, endian?: "little" | "big", realAddress?: number): number;
  readDword(address: number, isDelta?: boolean, endian?: "little" | "big", realAddress?: number): number;
}

/**
 * Diagnostic logger for Emscripten & WASM exports.
 */
export function logWASMBinaryDetails() {
  const emu = (window as any).EJS_emulator;
  const gameMgr = emu?.gameManager;
  const mod = gameMgr?.Module || emu?.Module || (window as any).Module;
  const asm = mod?.asm || mod?.wasmExports || {};

  console.group("%c[RA WASM & EmulatorJS Direct Binary & Buffer Inspection]", "color: #9333ea; font-weight: bold; font-size: 14px;");

  // 1. Raw WASM export keys
  const asmKeys = Object.keys(asm);
  const modKeys = mod ? Object.keys(mod) : [];
  console.log("%c[Module.asm keys count]:", "font-weight: bold; color: #10b981;", asmKeys.length, asmKeys);
  console.log("%c[Module.wasmExports keys count]:", "font-weight: bold; color: #10b981;", mod?.wasmExports ? Object.keys(mod.wasmExports).length : 0, mod?.wasmExports ? Object.keys(mod.wasmExports) : []);

  // 2. Function name matcher (keywords: memory, ram, read, write, cpu, bus, gb, gambatte)
  const fnKeywords = ["memory", "ram", "read", "write", "cpu", "bus", "gb", "gambatte"];
  const searchFunctionsInObject = (obj: any, label: string) => {
    if (!obj) return;
    const matchedFns: { name: string; fnLength: number }[] = [];
    for (const k of Object.keys(obj)) {
      try {
        if (typeof obj[k] === "function") {
          const lk = k.toLowerCase();
          if (fnKeywords.some((kw) => lk.includes(kw))) {
            matchedFns.push({ name: k, fnLength: obj[k].length });
          }
        }
      } catch {}
    }
    console.log(`%c[Function Key Search: ${label}] (${matchedFns.length} functions matched):`, "font-weight: bold; color: #06b6d4;", matchedFns);
  };

  searchFunctionsInObject(emu, "window.EJS_emulator");
  searchFunctionsInObject(gameMgr, "EJS_emulator.gameManager");
  searchFunctionsInObject(mod, "Module");
  searchFunctionsInObject(asm, "Module.asm / wasmExports");

  // 3. TypedArray, ArrayBuffer, WebAssembly.Memory, and Numeric Pointer inspection
  const inspectBuffersAndNumbers = (obj: any, label: string) => {
    if (!obj) return;
    const inspected: any[] = [];
    for (const k of Object.keys(obj)) {
      try {
        const val = obj[k];
        if (!val) continue;

        if (typeof val === "object" || typeof val === "function" || typeof val === "number") {
          let typeName = typeof val;
          let byteLen = 0;
          let len = 0;
          let isTargetMatch = false;

          if (val instanceof Uint8Array || ArrayBuffer.isView(val)) {
            typeName = val.constructor?.name || "TypedArray";
            byteLen = (val as any).byteLength || 0;
            len = (val as any).length || 0;
          } else if (val instanceof ArrayBuffer) {
            typeName = "ArrayBuffer";
            byteLen = val.byteLength;
            len = val.byteLength;
          } else if (typeof (window as any).WebAssembly?.Memory === "function" && val instanceof (window as any).WebAssembly.Memory) {
            typeName = "WebAssembly.Memory";
            byteLen = val.buffer?.byteLength || 0;
            len = val.buffer?.byteLength || 0;
          } else if (typeof val === "number" && val > 0) {
            typeName = "number pointer";
            byteLen = val;
            len = val;
          } else {
            continue;
          }

          if (byteLen === 8192 || len === 8192 || byteLen === 128 || len === 128 || byteLen === 127 || len === 127 || byteLen === 65536 || len === 65536) {
            isTargetMatch = true;
          }

          inspected.push({
            property: `${label}.${k}`,
            type: typeName,
            byteLength: byteLen,
            length: len,
            targetMatch: isTargetMatch ? "★ MATCH (WRAM/HRAM/CPU Bus)" : "No",
          });
        }
      } catch {}
    }
    if (inspected.length > 0) {
      console.log(`%c[Buffer & Pointer Properties: ${label}] (${inspected.length} properties):`, "font-weight: bold; color: #ec4899;");
      console.table(inspected);
    }
  };

  inspectBuffersAndNumbers(emu, "window.EJS_emulator");
  inspectBuffersAndNumbers(gameMgr, "EJS_emulator.gameManager");
  inspectBuffersAndNumbers(mod, "Module");
  inspectBuffersAndNumbers(asm, "Module.asm / wasmExports");

  console.groupEnd();
}

export interface RetroMemoryDescriptor {
  flags: number;
  ptr: number;
  offset: number;
  start: number;
  select: number;
  disconnect: number;
  len: number;
  addrspace: string;
}

export interface RetroMemoryMap {
  descriptors: RetroMemoryDescriptor[];
  numDescriptors: number;
}

export function parseWasmMemoryMap(mmapPtr: number, heap: Uint8Array): RetroMemoryMap | null {
  if (mmapPtr <= 0 || mmapPtr >= heap.length - 8) return null;

  try {
    const view = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
    const descriptorsPtr = view.getUint32(mmapPtr, true);
    const numDescriptors = view.getUint32(mmapPtr + 4, true);

    if (numDescriptors === 0 || numDescriptors > 64 || descriptorsPtr <= 0 || descriptorsPtr >= heap.length) {
      return null;
    }

    const descriptors: RetroMemoryDescriptor[] = [];
    const descSize = 36;

    for (let i = 0; i < numDescriptors; i++) {
      const descPtr = descriptorsPtr + i * descSize;
      if (descPtr + descSize > heap.length) break;

      const ptr = view.getUint32(descPtr + 8, true);
      const offset = view.getUint32(descPtr + 12, true);
      const start = view.getUint32(descPtr + 16, true);
      const select = view.getUint32(descPtr + 20, true);
      const disconnect = view.getUint32(descPtr + 24, true);
      const len = view.getUint32(descPtr + 28, true);
      const addrspacePtr = view.getUint32(descPtr + 32, true);

      let addrspace = "";
      if (addrspacePtr > 0 && addrspacePtr < heap.length) {
        let str = "";
        for (let s = 0; s < 64; s++) {
          const b = heap[addrspacePtr + s];
          if (b === 0) break;
          str += String.fromCharCode(b);
        }
        addrspace = str;
      }

      descriptors.push({
        flags: view.getUint32(descPtr, true),
        ptr,
        offset,
        start,
        select,
        disconnect,
        len,
        addrspace,
      });
    }

    return { descriptors, numDescriptors: descriptors.length };
  } catch {
    return null;
  }
}

export function resolveDescriptorAddress(
  mmap: RetroMemoryMap,
  realAddress: number
): { desc: RetroMemoryDescriptor; offset: number; wasmPointer: number } | null {
  for (const desc of mmap.descriptors) {
    if (desc.ptr === 0) continue;

    if (desc.select === 0) {
      if (realAddress >= desc.start && realAddress < desc.start + desc.len) {
        const offset = realAddress - desc.start;
        const wasmPointer = desc.ptr + desc.offset + offset;
        return { desc, offset, wasmPointer };
      }
    } else {
      if (((desc.start ^ realAddress) & desc.select) === 0) {
        let reducedAddress = realAddress - desc.start;
        let disconnectMask = desc.disconnect;
        while (disconnectMask !== 0) {
          const tmp = (disconnectMask - 1) & ~disconnectMask;
          reducedAddress = (reducedAddress & tmp) | ((reducedAddress >> 1) & ~tmp);
          disconnectMask = (disconnectMask & (disconnectMask - 1)) >> 1;
        }
        if (reducedAddress < desc.len) {
          const wasmPointer = desc.ptr + desc.offset + reducedAddress;
          return { desc, offset: reducedAddress, wasmPointer };
        }
      }
    }
  }

  return null;
}

export function scanWasmHeapForMemoryMap(heap: Uint8Array): RetroMemoryMap | null {
  try {
    const view = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
    const knownStarts = new Set([
      0xc000, 0xd000, 0xe000, 0xff80, 0x0000, 0x7e0000, 0x7f0000,
      0x02000000, 0x03000000, 0x80000000, 0xff0000
    ]);

    const maxSearch = Math.min(heap.length - 8, 4 * 1024 * 1024);
    for (let ptr = 4; ptr < maxSearch; ptr += 4) {
      const descriptorsPtr = view.getUint32(ptr, true);
      const numDescriptors = view.getUint32(ptr + 4, true);

      if (numDescriptors >= 1 && numDescriptors <= 32 && descriptorsPtr > 0 && descriptorsPtr < heap.length - 36) {
        const descStart = view.getUint32(descriptorsPtr + 16, true);
        const descLen = view.getUint32(descriptorsPtr + 28, true);
        const descWasmPtr = view.getUint32(descriptorsPtr + 8, true);

        if (knownStarts.has(descStart) && descLen > 0 && descLen <= 16777216 && descWasmPtr > 0 && descWasmPtr < heap.length) {
          const mmap = parseWasmMemoryMap(ptr, heap);
          if (mmap && mmap.descriptors.length === numDescriptors) {
            console.log(`%c[RA WASM Heap Scanner] Found retro_memory_map at WASM address 0x${ptr.toString(16).toUpperCase()}`, "color: #10b981; font-weight: bold;");
            return mmap;
          }
        }
      }
    }
  } catch {}
  return null;
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
  public parsedMemoryMap: RetroMemoryMap | null = null;
  public resolver: MemoryRegionResolver = new MemoryRegionResolver();
  public hramReadCount: number = 0;
  public hramUniqueAddresses: Set<number> = new Set();
  public hramSampleValues: Map<number, number> = new Map();

  public isAvailable(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const asm = mod?.asm || mod?.wasmExports || {};
    return typeof mod?.EmulatorJSGetMemoryData === "function" ||
      typeof asm?.EmulatorJSGetMemoryData === "function" ||
      typeof mod?._get_memory_data === "function" ||
      typeof asm?._get_memory_data === "function";
  }

  public probeLibretroMemoryMap(): RetroMemoryMap | null {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    if (!mod || !mod.HEAPU8) return null;

    const asm = mod.asm || mod.wasmExports || {};
    const heap: Uint8Array = mod.HEAPU8;

    const mapFn = mod.EmulatorJSGetMemoryMap || asm.EmulatorJSGetMemoryMap ||
                  mod._retro_get_memory_map || asm._retro_get_memory_map ||
                  mod.retro_get_memory_map || asm.retro_get_memory_map ||
                  mod._get_memory_map || asm._get_memory_map;

    let mmapPtr = 0;

    if (typeof mapFn === "function") {
      try {
        const res = mapFn();
        if (typeof res === "number" && res > 0 && res < heap.length) {
          mmapPtr = res;
        } else if (typeof res === "object" && res.descriptors) {
          this.parsedMemoryMap = res;
        }
      } catch (e) {
        console.warn("[RA Memory Map Probe] Error calling memory map function:", e);
      }
    }

    if (mmapPtr === 0) {
      const symPtr = mod.retro_memory_map || mod._retro_memory_map || asm.retro_memory_map || asm._retro_memory_map;
      if (typeof symPtr === "number" && symPtr > 0 && symPtr < heap.length) {
        mmapPtr = symPtr;
      }
    }

    if (mmapPtr > 0 && !this.parsedMemoryMap) {
      this.parsedMemoryMap = parseWasmMemoryMap(mmapPtr, heap);
    }

    const fnToTest = mod.EmulatorJSGetMemoryData || asm.EmulatorJSGetMemoryData || mod._get_memory_data || asm._get_memory_data;
    const fnSize = mod.EmulatorJSGetMemorySize || asm.EmulatorJSGetMemorySize || mod._get_memory_size || asm._get_memory_size || mod.retro_get_memory_size || asm.retro_get_memory_size;

    const probedResults: { id: number; method: string; ptr: number; size: number; first32Hex: string; last32Hex: string }[] = [];

    const testGetter = (methodName: string, getFn: (id: number) => number) => {
      for (let id = 0; id <= 32; id++) {
        try {
          const ptr = getFn(id);
          if (typeof ptr === "number" && ptr > 0 && ptr < heap.length) {
            const sz = typeof fnSize === "function" ? (fnSize(id) || 0) : 0;
            const effectiveSize = sz > 0 ? sz : 256;
            const first32: string[] = [];
            for (let b = 0; b < 32 && ptr + b < heap.length; b++) {
              first32.push(heap[ptr + b].toString(16).toUpperCase().padStart(2, "0"));
            }
            const last32: string[] = [];
            const startLast = Math.max(0, effectiveSize - 32);
            for (let b = 0; b < 32 && ptr + startLast + b < heap.length; b++) {
              last32.push(heap[ptr + startLast + b].toString(16).toUpperCase().padStart(2, "0"));
            }
            probedResults.push({
              id,
              method: methodName,
              ptr,
              size: sz,
              first32Hex: first32.join(" "),
              last32Hex: last32.join(" "),
            });
          }
        } catch {}
      }
    };

    if (typeof fnToTest === "function") {
      testGetter("fnToTest", (id) => fnToTest(id));
    }
    if (typeof mod._retro_get_memory_data === "function") {
      testGetter("mod._retro_get_memory_data", (id) => mod._retro_get_memory_data(id));
    }
    if (typeof asm._retro_get_memory_data === "function") {
      testGetter("asm._retro_get_memory_data", (id) => asm._retro_get_memory_data(id));
    }
    if (typeof mod.ccall === "function") {
      testGetter("ccall(_retro_get_memory_data)", (id) => mod.ccall("_retro_get_memory_data", "number", ["number"], [id]));
      testGetter("ccall(retro_get_memory_data)", (id) => mod.ccall("retro_get_memory_data", "number", ["number"], [id]));
    }

    console.group("%c[RA Memory Provider Selection Diagnostic]", "color: #8b5cf6; font-weight: bold; font-size: 14px;");
    if (this.parsedMemoryMap && this.parsedMemoryMap.numDescriptors > 0) {
      console.log(`%cFound official retro_memory_map with ${this.parsedMemoryMap.numDescriptors} descriptor(s):`, "color: #22c55e; font-weight: bold;");
      this.parsedMemoryMap.descriptors.forEach((d, idx) => {
        console.log(
          `  [Desc #${idx + 1}] Start: 0x${d.start.toString(16).toUpperCase()} | Len: 0x${d.len.toString(16).toUpperCase()} (${d.len} bytes) | WASM Ptr: 0x${d.ptr.toString(16).toUpperCase()} | Select: 0x${d.select.toString(16).toUpperCase()} | Disconnect: 0x${d.disconnect.toString(16).toUpperCase()} | AddrSpace: "${d.addrspace}"`
        );
      });
    } else {
      console.log("%cNo official retro_memory_map descriptor table exported by WASM module exports.", "color: #f59e0b; font-weight: bold;");
    }

    if (probedResults.length > 0) {
      console.log("%c[Probed Libretro Integer Memory IDs 0..32 Results]:", "color: #06b6d4; font-weight: bold;");
      probedResults.forEach((item) => {
        console.log(
          `  [${item.method}] ID ${item.id}: Pointer 0x${item.ptr.toString(16).toUpperCase()} | Size: ${item.size} bytes\n` +
          `      First 32 bytes: ${item.first32Hex}\n` +
          `      Last 32 bytes:  ${item.last32Hex}`
        );
      });
    } else {
      console.log("%c[Probed Libretro Integer Memory IDs 0..32]: No non-zero pointers returned across all tested getters & ccall methods.", "color: #ef4444; font-weight: bold;");
    }
    console.groupEnd();

    return this.parsedMemoryMap;
  }

  public resolve(): boolean {
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    if (!mod || !mod.HEAPU8) return false;

    const asm = mod.asm || mod.wasmExports || {};
    const validKeys: { key: string; result: any; pointer: number; size: number; previewHex: string }[] = [];

    const fnToTest = mod.EmulatorJSGetMemoryData || asm.EmulatorJSGetMemoryData || mod._get_memory_data || asm._get_memory_data;
    const fnSize = mod.EmulatorJSGetMemorySize || asm.EmulatorJSGetMemorySize || mod._get_memory_size || asm._get_memory_size || mod.retro_get_memory_size || asm.retro_get_memory_size;

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

            if (typeof fnSize === "function" && strKey === "RETRO_MEMORY_SYSTEM_RAM") {
              const actualSz = fnSize(2);
              if (typeof actualSz === "number" && actualSz > 0) {
                sz = actualSz;
              }
            }

            const heap: Uint8Array = mod.HEAPU8;
            const bytes: string[] = [];
            if (ptr > 0 && heap) {
              for (let b = 0; b < 32 && ptr + b < heap.length; b++) {
                bytes.push(heap[ptr + b].toString(16).toUpperCase().padStart(2, "0"));
              }
            }

            if (ptr > 0 || (typeof res === "object" && res)) {
              validKeys.push({ key: strKey, result: res, pointer: ptr, size: sz, previewHex: bytes.join(" ") });
              if (ptr > 0 && !this.isResolvedState && strKey === "RETRO_MEMORY_SYSTEM_RAM") {
                this.ramOffset = ptr;
                this.ramSize = sz;
                this.isResolvedState = true;
                this.activeFnName = `EmulatorJSGetMemoryData("${strKey}")`;

                this.resolver.clear();
                const core = ((window as any).EJS_core || "").toLowerCase();

                if (core.includes("gb") || core.includes("gambatte") || core.includes("sameboy") || core.includes("gearboy")) {
                  this.resolver.registerRegion({
                    source: "Game Boy WRAM (0xC000-0xDFFF)",
                    cpuStart: 0xc000,
                    cpuEnd: 0xdfff,
                    wasmPointer: ptr,
                    size: Math.min(sz, 8192)
                  });
                  this.resolver.registerRegion({
                    source: "Game Boy Echo RAM (0xE000-0xFDFF)",
                    cpuStart: 0xe000,
                    cpuEnd: 0xfdff,
                    wasmPointer: ptr,
                    size: Math.min(sz, 7680)
                  });

                  // Execute Gambatte HRAM Resolver
                  const gambatteResolver = new GambatteHRAMResolver();
                  const hramReg = gambatteResolver.resolveHRAM(ptr, sz, mod.HEAPU8, mod);
                  if (hramReg) {
                    this.resolver.registerRegion(hramReg);
                  }
                } else if (core.includes("nes") || core.includes("fceumm") || core.includes("nestopia") || core.includes("mesen")) {
                  this.resolver.registerRegion({
                    source: "NES Internal RAM (0x0000-0x07FF)",
                    cpuStart: 0x0000,
                    cpuEnd: 0x07ff,
                    wasmPointer: ptr,
                    size: Math.min(sz, 2048)
                  });
                  this.resolver.registerRegion({
                    source: "NES RAM Mirror (0x0800-0x1FFF)",
                    cpuStart: 0x0800,
                    cpuEnd: 0x1fff,
                    wasmPointer: ptr,
                    size: Math.min(sz, 2048)
                  });
                } else if (core.includes("snes") || core.includes("bsnes")) {
                  this.resolver.registerRegion({
                    source: "SNES WRAM (0x7E0000-0x7FFFFF)",
                    cpuStart: 0x7e0000,
                    cpuEnd: 0x7fffff,
                    wasmPointer: ptr,
                    size: Math.min(sz, 131072)
                  });
                  this.resolver.registerRegion({
                    source: "SNES Low WRAM (0x0000-0x1FFF)",
                    cpuStart: 0x0000,
                    cpuEnd: 0x1fff,
                    wasmPointer: ptr,
                    size: Math.min(sz, 8192)
                  });
                } else if (core.includes("sega") || core.includes("genesis") || core.includes("megadrive") || core.includes("picodrive")) {
                  this.resolver.registerRegion({
                    source: "Genesis System RAM (0x0000-0xFFFF)",
                    cpuStart: 0x0000,
                    cpuEnd: 0xffff,
                    wasmPointer: ptr,
                    size: Math.min(sz, 65536)
                  });
                } else {
                  this.resolver.registerRegion({
                    source: `System RAM (${this.activeFnName})`,
                    cpuStart: 0x0000,
                    cpuEnd: sz - 1,
                    wasmPointer: ptr,
                    size: sz
                  });
                }
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
        console.log(`%ckey: "${vk.key}", pointer: 0x${vk.pointer.toString(16).toUpperCase()}, size: ${vk.size} | First 32 bytes: ${vk.previewHex}`, "color: #22c55e; font-weight: bold;");
      }
    } else {
      console.log(`Tested ${knownKeys.length} known Libretro memory key constants. Awaiting key match...`);
    }
    console.log(`%cSelected SYSTEM_RAM Provider: "${this.activeFnName}", pointer: 0x${this.ramOffset.toString(16).toUpperCase()}, size: ${this.ramSize} bytes`, "color: #06b6d4; font-weight: bold;");
    console.groupEnd();

    this.probeLibretroMemoryMap();

    if (this.parsedMemoryMap && this.parsedMemoryMap.descriptors) {
      for (const desc of this.parsedMemoryMap.descriptors) {
        if (desc.ptr > 0 && desc.len > 0) {
          this.resolver.registerRegion({
            source: `retro_memory_map (${desc.addrspace || "Descriptor"})`,
            cpuStart: desc.start,
            cpuEnd: desc.start + desc.len - 1,
            wasmPointer: desc.ptr + desc.offset,
            size: desc.len
          });
        }
      }
    }

    if (this.isResolvedState) {
      this.dumpGameBoyHRAMDiagnostic();
      this.logGameBoyAddressDiagnosticTable();
    }

    return this.isResolvedState;
  }

  public logGameBoyAddressDiagnosticTable() {
    if (!this.isResolvedState || this.ramOffset <= 0) return;

    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap: Uint8Array | null = mod?.HEAPU8 || null;
    if (!heap) return;

    const testAddresses = [0xc000, 0xc201, 0xda02, 0xff80, 0xff99, 0xff9f, 0xffb3];

    console.group("%c[RA Game Boy Address Mapping Comparison Diagnostic]", "color: #f43f5e; font-weight: bold; font-size: 14px;");
    console.log(`%cWRAM Pointer (ramOffset): 0x${this.ramOffset.toString(16).toUpperCase()} | Heap Length: ${heap.length} bytes`, "font-weight: bold;");

    const tableData: any[] = [];

    for (const addr of testAddresses) {
      const addrHex = `0x${addr.toString(16).toUpperCase().padStart(4, "0")}`;

      const res = this.resolver.resolveWasmPointer(addr);
      const val = !res.isUnmapped && res.wasmPointer >= 0 && res.wasmPointer < heap.length ? heap[res.wasmPointer] : "UNMAPPED";

      tableData.push({
        "CPU Address": addrHex,
        "Resolved WASM Pointer": res.wasmPointer >= 0 ? `0x${res.wasmPointer.toString(16).toUpperCase()}` : "UNMAPPED",
        "Matched Region": res.region ? res.region.source : "None",
        "Value": val,
      });
    }

    console.table(tableData);
    console.groupEnd();
  }

  public dumpGameBoyHRAMDiagnostic() {
    if (!this.isResolvedState || this.ramOffset <= 0) return;

    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap: Uint8Array | null = mod?.HEAPU8 || null;
    if (!heap) return;

    console.group("%c[RA Game Boy HRAM Memory Dump Diagnostic]", "color: #ec4899; font-weight: bold; font-size: 14px;");
    console.log(`%cWRAM Pointer (ramOffset): 0x${this.ramOffset.toString(16).toUpperCase()}`, "font-weight: bold;");

    const formatHexChunk = (startOffset: number, length: number) => {
      const rows: string[] = [];
      let nonZeroCount = 0;

      for (let i = 0; i < length; i += 16) {
        const rowAddr = startOffset + i;
        const rowHexAddr = `0x${rowAddr.toString(16).toUpperCase().padStart(4, "0")}`;
        const bytes: string[] = [];

        for (let j = 0; j < 16 && i + j < length; j++) {
          const ptr = this.ramOffset + startOffset + i + j;
          const byteVal = ptr < heap.length ? heap[ptr] : 0;
          if (byteVal !== 0) nonZeroCount++;
          bytes.push(byteVal.toString(16).toUpperCase().padStart(2, "0"));
        }
        rows.push(`${rowHexAddr}: ${bytes.join(" ")}`);
      }

      return { rows, nonZeroCount };
    };

    // Range 1: 0x1F00 - 0x1FFF (8000 - 8191, end of 8KB WRAM)
    const range1 = formatHexChunk(0x1f00, 256);
    console.group(`%c1. SYSTEM_RAM Offsets 0x1F00-0x1FFF (${range1.nonZeroCount} non-zero bytes)`, "color: #3b82f6; font-weight: bold;");
    console.log(range1.rows.join("\n"));
    console.groupEnd();

    console.groupEnd();
  }

  private loggedResolverReads: Set<number> = new Set();

  public readByte(address: number, bit?: number | null, realAddress?: number): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    if (!heap) return 0;

    const targetAddr = realAddress !== undefined ? realAddress : address;
    let ptr = -1;
    let matchedRegion = "UNMAPPED";

    if (this.parsedMemoryMap && targetAddr !== undefined) {
      const resolvedDesc = resolveDescriptorAddress(this.parsedMemoryMap, targetAddr);
      if (resolvedDesc) {
        ptr = resolvedDesc.wasmPointer;
        matchedRegion = `retro_memory_map (${resolvedDesc.desc.addrspace || "Descriptor"})`;
      }
    }

    if (ptr < 0 && targetAddr !== undefined) {
      const res = this.resolver.resolveWasmPointer(targetAddr);
      if (!res.isUnmapped && res.wasmPointer >= 0) {
        ptr = res.wasmPointer;
        matchedRegion = res.region ? res.region.source : "Matched Region";
      }
    }

    if (ptr < 0 || ptr >= heap.length) {
      if (targetAddr >= 0xff80 && targetAddr <= 0xfffe) {
        this.hramReadCount++;
        this.hramUniqueAddresses.add(targetAddr);
        this.hramSampleValues.set(targetAddr, 0);

        if (this.hramReadCount % 5000 === 0) {
          console.group(`%c[RA HRAM Stats - ${this.hramReadCount} Reads (UNMAPPED HRAM)]`, "color: #ef4444; font-weight: bold; font-size: 13px;");
          console.log("%cTotal HRAM reads:", "font-weight: bold;", this.hramReadCount);
          console.log("%cUnique HRAM addresses:", "font-weight: bold;", this.hramUniqueAddresses.size);
          console.groupEnd();
        }
      }
      return 0;
    }

    let val = heap[ptr];
    if (bit !== undefined && bit !== null && bit >= 0 && bit <= 7) {
      val = (val >> bit) & 1;
    }

    if (!this.loggedResolverReads.has(targetAddr)) {
      this.loggedResolverReads.add(targetAddr);
      const addrHex = `0x${targetAddr.toString(16).toUpperCase().padStart(4, "0")}`;
      console.log(
        `%c[RA Resolver Read] CPU address ${addrHex} | Matched region: "${matchedRegion}" | WASM Pointer: 0x${ptr.toString(16).toUpperCase()} | Value: ${val}`,
        "color: #10b981; font-weight: bold;"
      );
    }

    if (targetAddr >= 0xff80 && targetAddr <= 0xfffe) {
      this.hramReadCount++;
      this.hramUniqueAddresses.add(targetAddr);
      this.hramSampleValues.set(targetAddr, val);

      if (this.hramReadCount % 5000 === 0) {
        console.group(`%c[RA HRAM Stats - ${this.hramReadCount} Reads]`, "color: #f59e0b; font-weight: bold; font-size: 13px;");
        console.log("%cTotal HRAM reads:", "font-weight: bold;", this.hramReadCount);
        console.log("%cUnique HRAM addresses:", "font-weight: bold;", this.hramUniqueAddresses.size);
        const examples: Record<string, number> = {};
        for (const [addr, sampleVal] of this.hramSampleValues.entries()) {
          examples[`0x${addr.toString(16).toUpperCase()}`] = sampleVal;
        }
        console.log("%cAddress samples:", "font-weight: bold;", examples);
        console.groupEnd();
      }
    }

    return val;
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little", realAddress?: number): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    if (!heap) return 0;

    const targetAddr = realAddress !== undefined ? realAddress : address;
    let ptr = -1;
    let matchedRegion = "UNMAPPED";

    if (this.parsedMemoryMap && targetAddr !== undefined) {
      const resolvedDesc = resolveDescriptorAddress(this.parsedMemoryMap, targetAddr);
      if (resolvedDesc) {
        ptr = resolvedDesc.wasmPointer;
        matchedRegion = `retro_memory_map (${resolvedDesc.desc.addrspace || "Descriptor"})`;
      }
    }

    if (ptr < 0 && targetAddr !== undefined) {
      const res = this.resolver.resolveWasmPointer(targetAddr);
      if (!res.isUnmapped && res.wasmPointer >= 0) {
        ptr = res.wasmPointer;
        matchedRegion = res.region ? res.region.source : "Matched Region";
      }
    }

    if (ptr < 0 || ptr + 1 >= heap.length) return 0;
    const val = endian === "little" ? heap[ptr] | (heap[ptr + 1] << 8) : (heap[ptr] << 8) | heap[ptr + 1];

    if (!this.loggedResolverReads.has(targetAddr)) {
      this.loggedResolverReads.add(targetAddr);
      const addrHex = `0x${targetAddr.toString(16).toUpperCase().padStart(4, "0")}`;
      console.log(
        `%c[RA Resolver Read] CPU address ${addrHex} (Word) | Matched region: "${matchedRegion}" | WASM Pointer: 0x${ptr.toString(16).toUpperCase()} | Value: ${val}`,
        "color: #10b981; font-weight: bold;"
      );
    }

    return val;
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little", realAddress?: number): number {
    if (!this.isResolvedState) return 0;
    const emu = (window as any).EJS_emulator;
    const mod = emu?.gameManager?.Module || emu?.Module || (window as any).Module;
    const heap = mod?.HEAPU8;
    if (!heap) return 0;

    const targetAddr = realAddress !== undefined ? realAddress : address;
    let ptr = -1;
    let matchedRegion = "UNMAPPED";

    if (this.parsedMemoryMap && targetAddr !== undefined) {
      const resolvedDesc = resolveDescriptorAddress(this.parsedMemoryMap, targetAddr);
      if (resolvedDesc) {
        ptr = resolvedDesc.wasmPointer;
        matchedRegion = `retro_memory_map (${resolvedDesc.desc.addrspace || "Descriptor"})`;
      }
    }

    if (ptr < 0 && targetAddr !== undefined) {
      const res = this.resolver.resolveWasmPointer(targetAddr);
      if (!res.isUnmapped && res.wasmPointer >= 0) {
        ptr = res.wasmPointer;
        matchedRegion = res.region ? res.region.source : "Matched Region";
      }
    }

    if (ptr < 0 || ptr + 3 >= heap.length) return 0;
    const val = endian === "little"
      ? (heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)) >>> 0
      : ((heap[ptr] << 24) | (heap[ptr + 1] << 16) | (heap[ptr + 2] << 8) | heap[ptr + 3]) >>> 0;

    if (!this.loggedResolverReads.has(targetAddr)) {
      this.loggedResolverReads.add(targetAddr);
      const addrHex = `0x${targetAddr.toString(16).toUpperCase().padStart(4, "0")}`;
      console.log(
        `%c[RA Resolver Read] CPU address ${addrHex} (Dword) | Matched region: "${matchedRegion}" | WASM Pointer: 0x${ptr.toString(16).toUpperCase()} | Value: ${val}`,
        "color: #10b981; font-weight: bold;"
      );
    }

    return val;
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

  public readByte(address: number, bit?: number | null, realAddress?: number): number {
    if (!this.activeProvider) return 0;
    return this.activeProvider.readByte(address, bit, realAddress);
  }

  public readWord(address: number, isDelta?: boolean, endian: "little" | "big" = "little", realAddress?: number): number {
    if (!this.activeProvider) return 0;
    return this.activeProvider.readWord(address, isDelta, endian, realAddress);
  }

  public readDword(address: number, isDelta?: boolean, endian: "little" | "big" = "little", realAddress?: number): number {
    if (!this.activeProvider) return 0;
    return this.activeProvider.readDword(address, isDelta, endian, realAddress);
  }
}
