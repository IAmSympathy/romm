import { onBeforeUnmount, onMounted } from "vue";
import activityApi from "@/services/api/activity";

const HEARTBEAT_INTERVAL_MS = 30_000;

let listeners = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let refreshing = false;

async function refreshPresence() {
  if (refreshing) return;
  refreshing = true;
  try {
    await activityApi.refreshWebPresence();
  } catch {
    // Authentication failures are handled by the shared API interceptor.
  } finally {
    refreshing = false;
  }
}

function onVisibilityChange() {
  if (!document.hidden) void refreshPresence();
}

function start() {
  listeners += 1;
  if (listeners !== 1) return;

  void refreshPresence();
  timer = setInterval(() => void refreshPresence(), HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function stop() {
  listeners -= 1;
  if (listeners > 0) return;

  listeners = 0;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

export function useOnlinePresence() {
  onMounted(start);
  onBeforeUnmount(stop);
}
