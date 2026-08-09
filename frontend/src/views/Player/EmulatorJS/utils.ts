import Bowser from "bowser";
import { type SaveSchema } from "@/__generated__";
import { type StateSchema } from "@/__generated__";
import saveApi from "@/services/api/save";
import stateApi from "@/services/api/state";
import { type DetailedRom } from "@/stores/roms";

function buildStateName(rom: DetailedRom): string {
  const romName = rom.fs_name_no_ext.trim();
  return `${romName} [${new Date().toISOString().replace(/[:.]/g, "-").replace("T", " ").replace("Z", "")}]`;
}

function buildSaveName(rom: DetailedRom): string {
  const romName = rom.fs_name_no_ext.trim();
  return `${romName} [${new Date().toISOString().replace(/[:.]/g, "-").replace("T", " ").replace("Z", "")}]`;
}

export async function captureCanvasScreenshot(): Promise<ArrayBuffer | null> {
  try {
    if (window.EJS_emulator?.gameManager?.screenshot) {
      const res = await window.EJS_emulator.gameManager.screenshot();
      if (res instanceof ArrayBuffer) return res;
      if (res instanceof Uint8Array) return res.buffer as ArrayBuffer;
      if (res instanceof Blob) return await res.arrayBuffer();
      if (typeof res === "string" && res.startsWith("data:")) {
        const bin = atob(res.split(",")[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr.buffer as ArrayBuffer;
      }
    }
  } catch (e) {
    console.warn("gameManager.screenshot failed:", e);
  }

  // Fallback: grab directly from canvas in #game element
  try {
    const canvas = document.querySelector("#game canvas") as HTMLCanvasElement | null;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) return await blob.arrayBuffer();
    }
  } catch (e) {
    console.warn("Canvas capture failed:", e);
  }

  return null;
}

export async function normalizeScreenshotBuffer(
  input?: any
): Promise<ArrayBuffer | null> {
  if (!input) return await captureCanvasScreenshot();

  if (input instanceof ArrayBuffer) return input;
  if (input instanceof Uint8Array) return input.buffer as ArrayBuffer;
  if (input instanceof Blob) return await input.arrayBuffer();
  if (typeof input === "string" && input.startsWith("data:")) {
    const bin = atob(input.split(",")[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer as ArrayBuffer;
  }

  return await captureCanvasScreenshot();
}

export function initEmulatorJSPopupObserver() {
  const container = document.getElementById("game");
  if (!container) return;

  const observer = new MutationObserver(() => {
    const popups = container.querySelectorAll<HTMLElement>(
      ".ejs_popup_container, .ejs_popup_container_box, .ejs_cheat_parent"
    );

    popups.forEach((popup) => {
      // 1. Hide any bottom "Fermer" or "Close" text buttons
      const buttons = popup.querySelectorAll<HTMLElement>("button, a.ejs_button");
      buttons.forEach((btn) => {
        const text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
        if (
          text === "fermer" ||
          text === "close" ||
          btn.classList.contains("ejs_subpopup_close_btn") ||
          btn.classList.contains("ejs_close_btn")
        ) {
          btn.style.display = "none";
          btn.style.visibility = "hidden";
        }
      });

      // 2. Ensure top-right ✕ close button exists
      if (!popup.querySelector(".romm-popup-close-btn, .ejs_close_icon")) {
        const closeBtn = document.createElement("a");
        closeBtn.className = "romm-popup-close-btn";
        closeBtn.innerHTML = "✕";
        closeBtn.title = "Fermer";
        closeBtn.setAttribute("role", "button");
        closeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          const nativeCloseBtn = popup.querySelector<HTMLElement>(
            "a.ejs_close_icon, button.ejs_close_btn, a.ejs_subpopup_close_btn, button.ejs_subpopup_close_btn"
          );
          if (nativeCloseBtn) {
            nativeCloseBtn.click();
          } else {
            popup.style.display = "none";
          }
        };
        popup.appendChild(closeBtn);
      }
    });
  });

  observer.observe(container, { childList: true, subtree: true, attributes: true });
}

export async function saveState({
  rom,
  stateFile,
  screenshotFile,
}: {
  rom: DetailedRom;
  stateFile: ArrayBuffer;
  screenshotFile?: any;
}): Promise<StateSchema | null> {
  // A zero-length buffer means the core failed to serialize its state (a torn
  // read from a running threaded core). Refuse to upload it so a broken
  // capture can't overwrite the user's good states on the server.
  if (stateFile.byteLength === 0) {
    console.error("Refusing to upload empty state file");
    return null;
  }

  // Ensure every save state gets a valid PNG screenshot preview
  const shotBuffer = await normalizeScreenshotBuffer(screenshotFile);

  const filename = buildStateName(rom);
  try {
    const uploadedStates = await stateApi.uploadStates({
      rom: rom,
      emulator: window.EJS_core,
      statesToUpload: [
        {
          stateFile: new File([stateFile], `${filename}.state`, {
            type: "application/octet-stream",
          }),
          screenshotFile: shotBuffer
            ? new File([shotBuffer], `${filename}.png`, {
                type: "image/png",
              })
            : undefined,
        },
      ],
    });

    const uploadedState = uploadedStates[0];
    if (uploadedState.status == "fulfilled") {
      if (rom) rom.user_states.unshift(uploadedState.value);
      return uploadedState.value;
    }
  } catch (error) {
    console.error("Failed to upload state", error);
  }

  return null;
}

export async function saveSave({
  rom,
  save,
  saveFile,
  screenshotFile,
  deviceId,
}: {
  rom: DetailedRom;
  save: SaveSchema | null;
  saveFile: ArrayBuffer;
  screenshotFile?: ArrayBuffer;
  deviceId?: string;
}): Promise<SaveSchema | null> {
  if (save) {
    try {
      const { data: updatedSave } = await saveApi.updateSave({
        save: save,
        saveFile: new File([saveFile], save.file_name, {
          type: "application/octet-stream",
        }),
        screenshotFile:
          screenshotFile && save.screenshot
            ? new File([screenshotFile], save.screenshot.file_name, {
                type: "application/octet-stream",
              })
            : undefined,
        deviceId,
      });

      // Update the save in the rom object
      const index = rom.user_saves.findIndex((s) => s.id === updatedSave.id);
      rom.user_saves[index] = updatedSave;

      return updatedSave;
    } catch (error) {
      console.error("Failed to update save", error);
      return null;
    }
  }

  const filename = buildSaveName(rom);
  try {
    const uploadedSaves = await saveApi.uploadSaves({
      rom: rom,
      emulator: window.EJS_core,
      deviceId,
      savesToUpload: [
        {
          saveFile: new File([saveFile], `${filename}.srm`, {
            type: "application/octet-stream",
          }),
          screenshotFile: screenshotFile
            ? new File([screenshotFile], `${filename}.png`, {
                type: "application/octet-stream",
              })
            : undefined,
        },
      ],
    });

    const uploadedSave = uploadedSaves[0];
    if (uploadedSave.status == "fulfilled") {
      if (rom) rom.user_saves.unshift(uploadedSave.value);
      return uploadedSave.value;
    }
  } catch (error) {
    console.error("Failed to upload save", error);
  }

  return null;
}

export function loadEmulatorJSSave(save: Uint8Array) {
  const FS = window.EJS_emulator.gameManager.FS;
  const path = window.EJS_emulator.gameManager.getSaveFilePath();
  const paths = path.split("/");
  let cp = "";
  for (let i = 0; i < paths.length - 1; i++) {
    if (paths[i] === "") continue;
    cp += "/" + paths[i];
    if (!FS.analyzePath(cp).exists) FS.mkdir(cp);
  }
  if (FS.analyzePath(path).exists) FS.unlink(path);
  FS.writeFile(path, save);
  window.EJS_emulator.gameManager.loadSaveFiles();
}

export function loadEmulatorJSState(state: Uint8Array) {
  window.EJS_emulator.gameManager.loadState(state);
}

export function invalidateEmulatorJSRomCacheIfRenamed(rom: {
  id: number;
  fs_name: string;
}) {
  const fsNameStorageKey = `player:${rom.id}:fs_name`;
  const previousFsName = localStorage.getItem(fsNameStorageKey);

  if (previousFsName && previousFsName !== rom.fs_name) {
    window.indexedDB.deleteDatabase("EmulatorJS-roms");
  }

  localStorage.setItem(fsNameStorageKey, rom.fs_name);
}

// EmulatorJS drops the config.yaml defaults (EJS_defaultOptions) in two spots:
// - preGetSetting short-circuits to the saved-settings localStorage object
//   once ANY setting or control was changed, returning undefined for keys the
//   user never touched (webgl2Enabled, vsync, shader, ...).
// - getCoreSettings builds the RetroArch core options file, but returns ""
//   when localStorage is enabled and holds no saved entry yet, so on a fresh
//   launch core options (e.g. mupen64plus-FXAA) never reach the core.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function installDefaultOptionsFallback(emulator: any) {
  if (emulator.__rommSettingsPatched) return;
  emulator.__rommSettingsPatched = true;

  const originalPreGetSetting = emulator.preGetSetting.bind(emulator);
  emulator.preGetSetting = (setting: string) => {
    const value = originalPreGetSetting(setting);
    if (value !== undefined && value !== null) return value;
    const defaults = emulator.config?.defaultOptions ?? {};
    return defaults[setting] !== undefined ? defaults[setting] : null;
  };

  emulator.getCoreSettings = () => {
    const defaults: Record<string, unknown> =
      emulator.config?.defaultOptions ?? {};
    let saved: Record<string, unknown> = {};
    if (window.localStorage && !emulator.config?.disableLocalStorage) {
      try {
        const raw = localStorage.getItem(emulator.getLocalStorageKey());
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.settings instanceof Object) saved = parsed.settings;
      } catch (error) {
        console.warn("Could not load previous settings", error);
      }
    }
    const merged = { ...defaults, ...saved };
    let output = "";
    for (const key in merged) {
      const value = merged[key];
      // Match upstream formatting: numeric values unquoted, strings quoted.
      const formatted = Number.isNaN(Number(value)) ? `"${value}"` : value;
      output += `${key} = ${formatted}\n`;
    }
    return output;
  };

  // Recompute the values the constructor captured via the unpatched
  // preGetSetting. They are consumed after this point: rewindEnabled when
  // GameManager writes retroarch.cfg, webgl2Enabled when the core variant is
  // picked during download, videoRotation on the first resize.
  emulator.rewindEnabled =
    emulator.preGetSetting("rewindEnabled") === "enabled";
  if (![0, 1, 2, 3].includes(emulator.config?.videoRotation)) {
    emulator.videoRotation = emulator.preGetSetting("videoRotation") || 0;
  }
  const webgl2Setting = emulator.preGetSetting("webgl2Enabled");
  if (webgl2Setting === "disabled" || !emulator.supportsWebgl2) {
    emulator.webgl2Enabled = false;
  } else if (webgl2Setting === "enabled") {
    emulator.webgl2Enabled = true;
  } else {
    emulator.webgl2Enabled = null;
  }
}

function installAudioTap() {
  const w = window as any;
  if (w.__ejsNetplayAudioTapInstalled) return;
  if (typeof AudioNode === "undefined") return;
  w.__ejsNetplayAudioTapInstalled = true;

  const savedVolStr = localStorage.getItem("romm_saved_volume") || localStorage.getItem("volume");
  const initVol = savedVolStr !== null && !isNaN(parseFloat(savedVolStr)) ? parseFloat(savedVolStr) : 1.0;
  w.__ejsCurrentVolume = initVol;

  const tap = (w.__ejsNetplayAudioTap = {
    caps: new WeakMap(),
    last: null as AudioContext | null,
  });
  const origConnect = AudioNode.prototype.connect as any;

  AudioNode.prototype.connect = function (this: AudioNode, target: any): any {
    try {
      const ctx = this.context as AudioContext & { __masterVolumeGain?: GainNode };
      if (ctx && target === ctx.destination) {
        tap.last = ctx;
        const curVolStr = localStorage.getItem("romm_saved_volume");
        const currentVol =
          curVolStr !== null && !isNaN(parseFloat(curVolStr)) ? parseFloat(curVolStr) : w.__ejsCurrentVolume;

        if (!ctx.__masterVolumeGain) {
          const masterGain = ctx.createGain();
          masterGain.gain.value = currentVol;
          origConnect.call(masterGain, ctx.destination);
          ctx.__masterVolumeGain = masterGain;
        } else {
          ctx.__masterVolumeGain.gain.value = currentVol;
        }

        let cap = tap.caps.get(ctx);
        if (!cap) {
          cap = ctx.createMediaStreamDestination();
          tap.caps.set(ctx, cap);
        }
        origConnect.call(this, cap);
        return origConnect.call(this, ctx.__masterVolumeGain);
      }
    } catch {
      // Ignore audio tap errors
    }
    return origConnect.apply(this, arguments as any);
  };

  w.__setEjsGlobalVolume = function (vol: number) {
    vol = Math.max(0, Math.min(1, parseFloat(vol as any)));
    w.__ejsCurrentVolume = vol;
    try {
      localStorage.setItem("romm_saved_volume", vol.toString());
      localStorage.setItem("volume", vol.toString());
    } catch {}

    if (w.__ejsNetplayAudioTap && w.__ejsNetplayAudioTap.last) {
      const ctx = w.__ejsNetplayAudioTap.last;
      if (ctx.__masterVolumeGain) {
        ctx.__masterVolumeGain.gain.value = vol;
      }
    }
    if (
      w.EJS_emulator &&
      w.EJS_emulator.Module &&
      w.EJS_emulator.Module.AL &&
      w.EJS_emulator.Module.AL.currentCtx &&
      w.EJS_emulator.Module.AL.currentCtx.sources
    ) {
      w.EJS_emulator.Module.AL.currentCtx.sources.forEach((s: any) => {
        if (s && s.gain && s.gain.gain) {
          s.gain.gain.value = vol;
        }
      });
    }
    if (w.EJS_emulator) {
      w.EJS_emulator.volume = vol;
    }
  };

  if (!w.__ejsVolumeSyncInterval) {
    w.__ejsVolumeSyncInterval = setInterval(() => {
      const curSaved = parseFloat(
        localStorage.getItem("romm_saved_volume") || w.__ejsCurrentVolume || "1.0"
      );
      if (w.__ejsNetplayAudioTap && w.__ejsNetplayAudioTap.last) {
        const ctx = w.__ejsNetplayAudioTap.last;
        if (ctx.__masterVolumeGain && Math.abs(ctx.__masterVolumeGain.gain.value - curSaved) > 0.001) {
          ctx.__masterVolumeGain.gain.value = curSaved;
        }
      }

      const volSliders = document.querySelectorAll<HTMLInputElement>(
        'input[data-range="volume"], .ejs_volume_parent input[type="range"]'
      );
      volSliders.forEach((slider) => {
        if (!slider.dataset.volumeFixed) {
          slider.dataset.volumeFixed = "true";
          slider.value = curSaved.toString();

          const updateVol = () => {
            const val = parseFloat(slider.value);
            w.__setEjsGlobalVolume(val);
          };

          ["input", "change", "mousemove", "touchmove", "mouseup", "touchend"].forEach((evt) => {
            slider.addEventListener(evt, updateVol, { passive: true });
          });
        } else if (!document.activeElement || document.activeElement !== slider) {
          if (Math.abs(parseFloat(slider.value) - curSaved) > 0.01) {
            slider.value = curSaved.toString();
          }
        }
      });
    }, 200);
  }
}

function patchNetplayAudio(netplay: any) {
  if (!netplay || netplay.__netplayAudioFixed) return;
  netplay.__netplayAudioFixed = true;

  netplay._captureHostAudio = function (this: any) {
    try {
      const w = window as any;
      const tap = w.__ejsNetplayAudioTap;
      const ctx =
        (tap && tap.last) ||
        (this.emu &&
          this.emu.Module &&
          this.emu.Module.AL &&
          this.emu.Module.AL.currentCtx &&
          this.emu.Module.AL.currentCtx.audioCtx) ||
        (this.emu && this.emu.gameManager && this.emu.gameManager.audioContext);

      if (!ctx) return null;
      if (ctx.state !== "running") ctx.resume().catch(() => {});

      let cap = tap && tap.caps.get(ctx);
      if (!cap) {
        cap = ctx.createMediaStreamDestination();
        if (tap) tap.caps.set(ctx, cap);
      }
      this._hostAudioDest = cap;
      const stream = cap.stream;
      const tracks = stream ? stream.getAudioTracks() : [];
      return tracks.length ? stream : null;
    } catch {
      return null;
    }
  };
}

export const EJS_LCD_GRID_SHADER_GLSL = `#if defined(VERTEX)

#if __VERSION__ >= 130
#define COMPAT_VARYING out
#define COMPAT_ATTRIBUTE in
#define COMPAT_TEXTURE texture
#else
#define COMPAT_VARYING varying
#define COMPAT_ATTRIBUTE attribute
#define COMPAT_TEXTURE texture2D
#endif

#ifdef GL_ES
#define COMPAT_PRECISION mediump
#else
#define COMPAT_PRECISION
#endif

COMPAT_ATTRIBUTE vec4 VertexCoord;
COMPAT_ATTRIBUTE vec4 COLOR;
COMPAT_ATTRIBUTE vec4 TexCoord;
COMPAT_VARYING vec4 COL0;
COMPAT_VARYING vec4 TEX0;

uniform mat4 MVPMatrix;
uniform COMPAT_PRECISION int FrameDirection;
uniform COMPAT_PRECISION int FrameCount;
uniform COMPAT_PRECISION vec2 OutputSize;
uniform COMPAT_PRECISION vec2 TextureSize;
uniform COMPAT_PRECISION vec2 InputSize;

void main() {
    gl_Position = MVPMatrix * VertexCoord;
    COL0 = COLOR;
    TEX0.xy = TexCoord.xy;
}

#elif defined(FRAGMENT)

#if __VERSION__ >= 130
#define COMPAT_VARYING in
#define COMPAT_TEXTURE texture
out vec4 FragColor;
#else
#define COMPAT_VARYING varying
#define COMPAT_TEXTURE texture2D
#define FragColor gl_FragColor
#endif

#ifdef GL_ES
#define COMPAT_PRECISION mediump
#else
#define COMPAT_PRECISION
#endif

uniform COMPAT_PRECISION int FrameDirection;
uniform COMPAT_PRECISION int FrameCount;
uniform COMPAT_PRECISION vec2 OutputSize;
uniform COMPAT_PRECISION vec2 TextureSize;
uniform COMPAT_PRECISION vec2 InputSize;
uniform sampler2D Texture;
COMPAT_VARYING vec4 TEX0;

void main() {
    vec2 texCoord = TEX0.xy;
    vec4 color = COMPAT_TEXTURE(Texture, texCoord);
    
    vec2 pos = fract(texCoord * TextureSize);
    vec2 grid = smoothstep(0.0, 0.15, pos) * smoothstep(1.0, 0.85, pos);
    float mask = grid.x * grid.y * 0.3 + 0.7;
    
    FragColor = vec4(color.rgb * mask, color.a);
}

#endif
`;

export function installEJSShaders() {
  const w = window as any;
  w.EJS_shaders = {
    "LCD Grid": EJS_LCD_GRID_SHADER_GLSL,
    ...(w.EJS_shaders || {}),
  };
}

// Trap the window.EJS_emulator assignment so the instance is patched right
// after the constructor returns, before the async core download and boot
// consume any of the patched values. Patching later (e.g. in EJS_onGameStart)
// is too late: by then the GL context exists, retroarch.cfg and the core
// options file are written, and saved settings were already applied.
export function installEJSDefaultOptionsTrap() {
  installAudioTap();
  installEJSShaders();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let instance: any;
  Object.defineProperty(window, "EJS_emulator", {
    configurable: true,
    get: () => instance,
    set: (value) => {
      instance = value;
      if (value) {
        installDefaultOptionsFallback(value);
        if (value.netplay) patchNetplayAudio(value.netplay);
      }
    },
  });
}

const IOS_FULLSCREEN_NAV_SELECTOR =
  ".v-app-bar, .v-bottom-navigation, .v-navigation-drawer";
const IOS_FULLSCREEN_STYLE = `
  [data-ios-fullscreen-active] {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100svh !important;
    z-index: 99999 !important;
    background: #000 !important;
  }
  [data-ios-fullscreen-hidden] { display: none !important; }
`;

function isIOSFullscreenShimRequired() {
  const osName = Bowser.getParser(navigator.userAgent).getOSName(true);
  return (
    osName === "ios" ||
    // iPadOS 13+ reports as macOS with touch support, so fall back to that check.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function installIOSFullscreenShim() {
  if (!isIOSFullscreenShimRequired()) {
    return () => {};
  }

  const proto = HTMLElement.prototype;
  const overrides: Array<{
    target: object;
    key: PropertyKey;
    prev?: PropertyDescriptor;
  }> = [];
  const override = (
    target: object,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
  ) => {
    overrides.push({
      target,
      key,
      prev: Object.getOwnPropertyDescriptor(target, key),
    });
    Object.defineProperty(target, key, { configurable: true, ...descriptor });
  };

  const styleEl = document.createElement("style");
  styleEl.textContent = IOS_FULLSCREEN_STYLE;
  document.head.appendChild(styleEl);

  let fullscreenElement: HTMLElement | null = null;

  const dispatchChange = (target: HTMLElement) => {
    document.dispatchEvent(new Event("fullscreenchange"));
    target.dispatchEvent(new Event("fullscreenchange"));
  };

  const enter = (el: HTMLElement) => {
    if (fullscreenElement === el) return Promise.resolve();
    if (fullscreenElement) void exit();

    el.setAttribute("data-ios-fullscreen-active", "");
    document
      .querySelectorAll<HTMLElement>(IOS_FULLSCREEN_NAV_SELECTOR)
      .forEach((nav) => nav.setAttribute("data-ios-fullscreen-hidden", ""));
    fullscreenElement = el;
    dispatchChange(el);
    return Promise.resolve();
  };

  const exit = () => {
    const el = fullscreenElement;
    if (!el) return Promise.resolve();
    el.removeAttribute("data-ios-fullscreen-active");
    document
      .querySelectorAll<HTMLElement>("[data-ios-fullscreen-hidden]")
      .forEach((nav) => nav.removeAttribute("data-ios-fullscreen-hidden"));
    fullscreenElement = null;
    dispatchChange(el);
    return Promise.resolve();
  };

  override(document, "fullscreenEnabled", { get: () => true });
  override(document, "fullscreenElement", { get: () => fullscreenElement });
  override(document, "exitFullscreen", { value: exit, writable: true });
  override(proto, "requestFullscreen", {
    value: function (this: HTMLElement) {
      return enter(this);
    },
    writable: true,
  });
  override(proto, "webkitRequestFullscreen", {
    value: function (this: HTMLElement) {
      void enter(this);
    },
    writable: true,
  });

  return () => {
    void exit();
    styleEl.remove();
    while (overrides.length) {
      const { target, key, prev } = overrides.pop()!;
      if (prev) Object.defineProperty(target, key, prev);
      else Reflect.deleteProperty(target, key);
    }
  };
}

export function createQuickLoadButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "presentation");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("viewBox", "2 2 20 20");
  svg.innerHTML =
    '<path d="M12,7L17,12H14V16H10V12H7L12,7M19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21M19,19V5H5V19H19Z"></path>';
  const text = document.createElement("span");
  text.classList.add("ejs_menu_text");
  text.innerText = "Load Latest State";
  button.classList.add("ejs_menu_button");
  button.appendChild(svg);
  button.appendChild(text);

  const ejsMenuBar = document.querySelector("#game .ejs_menu_bar");
  const loadStateBtn = ejsMenuBar?.querySelector(
    ".ejs_menu_button:nth-child(5)",
  );
  if (ejsMenuBar && loadStateBtn) {
    ejsMenuBar.insertBefore(button, loadStateBtn);
  }

  return button;
}

export function createExitEmulationButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "presentation");
  svg.setAttribute("focusable", "false");
  svg.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 460"><path style="fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(255,255,255);stroke-opacity:1;stroke-miterlimit:4;" d="M 14.000061 7.636414 L 14.000061 4.5 C 14.000061 4.223877 13.776123 3.999939 13.5 3.999939 L 4.5 3.999939 C 4.223877 3.999939 3.999939 4.223877 3.999939 4.5 L 3.999939 19.5 C 3.999939 19.776123 4.223877 20.000061 4.5 20.000061 L 13.5 20.000061 C 13.776123 20.000061 14.000061 19.776123 14.000061 19.5 L 14.000061 16.363586 " transform="matrix(21.333333,0,0,21.333333,0,0)"></path><path style="fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(255,255,255);stroke-opacity:1;stroke-miterlimit:4;" d="M 9.999939 12 L 21 12 M 21 12 L 18.000366 8.499939 M 21 12 L 18 15.500061 " transform="matrix(21.333333,0,0,21.333333,0,0)"></path></svg>';
  const text = document.createElement("span");
  text.classList.add("ejs_menu_text", "ejs_menu_text_right");
  text.innerText = "Quit";
  button.classList.add("ejs_menu_button");
  button.appendChild(svg);
  button.appendChild(text);

  const ejsMenuBar = document.querySelector("#game .ejs_menu_bar");
  ejsMenuBar?.appendChild(button);

  return button;
}

export function createSaveQuitButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "presentation");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("viewBox", "2 2 20 20");
  svg.innerHTML =
    '<path d="M17,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H11.81C11.42,20.34 11.17,19.6 11.07,18.84C9.5,18.31 8.66,16.6 9.2,15.03C9.61,13.83 10.73,13 12,13C12.44,13 12.88,13.1 13.28,13.29C15.57,11.5 18.83,11.59 21,13.54V7L17,3M15,9H5V5H15V9M13,17H17V14L22,18.5L17,23V20H13V17"></path>';
  const text = document.createElement("span");
  text.classList.add("ejs_menu_text", "ejs_menu_text_right");
  text.innerText = "Save & Quit";
  button.classList.add("ejs_menu_button");
  button.appendChild(svg);
  button.appendChild(text);

  const ejsMenuBar = document.querySelector("#game .ejs_menu_bar");
  ejsMenuBar?.appendChild(button);

  return button;
}
