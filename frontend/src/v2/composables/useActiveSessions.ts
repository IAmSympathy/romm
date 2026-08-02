import { computed, onMounted, onUnmounted, ref } from "vue";
import activityApi, { type ActivityEntry } from "@/services/api/activity";
import { useSnackbar } from "@/v2/composables/useSnackbar";

const activeSessions = ref<ActivityEntry[]>([]);
const knownSessionKeys = new Set<string>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let listenerCount = 0;

export function useActiveSessions() {
  const snackbar = useSnackbar();

  const activeRomIds = computed<Set<number>>(() => {
    return new Set(
      activeSessions.value
        .map((s) => Number(s.rom_id))
        .filter((id) => id > 0 && !isNaN(id))
    );
  });

  async function fetchSessions() {
    try {
      const { data } = await activityApi.getAllActivity();
      const newSessions = data || [];

      // Check for newly launched games to notify
      for (const s of newSessions) {
        const key = `${s.user_id}-${s.rom_id}-${s.started_at}`;
        if (!knownSessionKeys.has(key)) {
          knownSessionKeys.add(key);
          // Only show toast if sessions were already initialized (prevents initial burst)
          if (knownSessionKeys.size > newSessions.length) {
            snackbar.info(
              `🎮 ${s.username} est en train de jouer à ${s.rom_name || "un jeu"}`
            );
          }
        }
      }

      activeSessions.value = newSessions;
    } catch {
      // Ignore network errors on background poll
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
  };
}
