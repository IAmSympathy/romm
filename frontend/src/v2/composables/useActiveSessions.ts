import { computed, onMounted, onUnmounted, ref } from "vue";
import activityApi, { type ActivityEntry } from "@/services/api/activity";
import userApi from "@/services/api/user";
import router from "@/plugins/router";

const activeSessions = ref<ActivityEntry[]>([]);
const knownSessionKeys = new Set<string>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let listenerCount = 0;

let currentUserId: number | null = null;
let currentUsername: string | null = null;

async function initCurrentUser() {
  if (currentUserId !== null) return;
  try {
    const { data } = await userApi.getMe();
    if (data) {
      if (data.id) currentUserId = data.id;
      if (data.username) currentUsername = data.username.toLowerCase();
    }
  } catch {
    // Ignore error
  }
}

function getAvatarUrl(s: ActivityEntry): string | null {
  if (s.user_id) return `/api/users/${s.user_id}/avatar`;
  if (s.avatar_path) {
    if (s.avatar_path.startsWith("http://") || s.avatar_path.startsWith("https://") || s.avatar_path.startsWith("/")) {
      return s.avatar_path;
    }
    return `/assets/${s.avatar_path}`;
  }
  return null;
}

function getCoverUrl(s: ActivityEntry): string {
  if (s.rom_cover_path) {
    const p = s.rom_cover_path;
    if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
    if (p.startsWith("romm/resources/")) return `/assets/${p}`;
    if (p.startsWith("roms/")) return `/assets/romm/resources/${p}`;
    return `/assets/${p}`;
  }
  if (s.rom_id && s.rom_id > 0) return `/api/roms/${s.rom_id}/cover`;
  return "";
}

function getToastContainer(): HTMLElement {
  let container = document.getElementById("romm-custom-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "romm-custom-toast-container";
    container.className = "romm-custom-toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function showGameLaunchToast(session: ActivityEntry) {
  if (!session || !session.rom_id || session.rom_id === 0) return;
  if (currentUserId && session.user_id === currentUserId) return;
  if (currentUsername && session.username && session.username.toLowerCase() === currentUsername) return;

  const container = getToastContainer();
  const toast = document.createElement("div");
  toast.className = "romm-custom-toast";

  const userInitial = (session.username || "U").charAt(0).toUpperCase();
  const avatarUrl = getAvatarUrl(session);
  const coverUrl = getCoverUrl(session);

  const avatarHtml = avatarUrl
    ? `<div class="romm-custom-session-avatar-cover"><img src="${avatarUrl}" onerror="this.style.display='none'; this.parentNode.innerText='${userInitial}';" /></div>`
    : `<div class="romm-custom-session-avatar-cover">${userInitial}</div>`;

  const coverHtml = coverUrl
    ? `<div class="romm-custom-session-game-cover"><img src="${coverUrl}" onerror="this.style.display='none';" /></div>`
    : `<div class="romm-custom-session-game-cover" style="background: rgba(167, 139, 250, 0.12); border-radius: 5px; border: 1px solid rgba(167, 139, 250, 0.2);"><i class="v-icon mdi mdi-controller" style="font-size: 16px; color: #a78bfa;"></i></div>`;

  toast.innerHTML = `
    ${avatarHtml}
    <div class="romm-custom-session-info" style="padding-right: 24px;">
      <div class="romm-custom-session-user">
        <span>${session.username || "Joueur"}</span>
        <span class="romm-online-dot romm-custom-toast-online-dot"></span>
      </div>
      <div class="romm-custom-session-game-row">
        ${coverHtml}
        <div class="romm-custom-session-game-details">
          <div class="romm-custom-session-game">${session.rom_name || "Jeu"}</div>
          <div class="romm-custom-session-plat">${session.platform_name || session.platform_slug || "En jeu"}</div>
        </div>
      </div>
    </div>
    <button class="romm-toast-close-btn" title="Fermer">✕</button>
  `;

  toast.onclick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("romm-toast-close-btn")) {
      e.stopPropagation();
      toast.remove();
      return;
    }
    if (session.rom_id && session.rom_id > 0) {
      void router.push({ name: "rom", params: { rom: session.rom_id } });
      toast.remove();
    }
  };

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      setTimeout(() => toast.remove(), 300);
    }
  }, 7000);
}

export function useActiveSessions() {
  const activeRomIds = computed<Set<number>>(() => {
    return new Set(
      activeSessions.value
        .map((s) => Number(s.rom_id))
        .filter((id) => id > 0 && !isNaN(id))
    );
  });

  async function fetchSessions() {
    await initCurrentUser();
    try {
      const { data } = await activityApi.getAllActivity();
      const newSessions = data || [];

      for (const s of newSessions) {
        if (s.rom_id && s.rom_id > 0) {
          const key = `${s.user_id}-${s.rom_id}-${s.started_at}`;
          if (!knownSessionKeys.has(key)) {
            knownSessionKeys.add(key);
            if (knownSessionKeys.size > newSessions.length) {
              showGameLaunchToast(s);
            }
          }
        }
      }

      activeSessions.value = newSessions;
    } catch {
      // Ignore poll errors
    }
  }

  function isPlaying(romId: number): boolean {
    return activeRomIds.value.has(Number(romId));
  }

  onMounted(() => {
    listenerCount++;
    void fetchSessions();
    if (!pollTimer) {
      pollTimer = setInterval(fetchSessions, 3000);
    }
  });

  onUnmounted(() => {
    listenerCount--;
    if (listenerCount <= 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  return {
    activeSessions,
    activeRomIds,
    isPlaying,
    fetchSessions,
    getAvatarUrl,
    getCoverUrl,
  };
}
