<script setup lang="ts">
// RANotifications — modern glassmorphic notification overlay placed in the top-left
// of EmulatorJS player, matching RomM v2 visual design system.
import type { RANotificationItem } from "@/v2/services/retroachievements";

defineProps<{
  notifications: RANotificationItem[];
}>();

const emit = defineEmits<{
  (e: "dismiss", id: string): void;
}>();

function onDismiss(id: string) {
  emit("dismiss", id);
}
</script>

<template>
  <div class="r-ra-notifs" aria-live="polite">
    <TransitionGroup name="r-ra-notif-slide">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="r-ra-notif-card"
        :class="`r-ra-notif-card--${item.type}`"
        role="status"
      >
        <div class="r-ra-notif-card__icon-wrapper">
          <img
            v-if="item.badgeUrl"
            :src="item.badgeUrl"
            class="r-ra-notif-card__badge"
            alt=""
          />
          <v-icon
            v-else-if="item.type === 'achievement_unlocked'"
            color="#EAB308"
            size="28"
          >
            mdi-trophy-award
          </v-icon>
          <v-icon
            v-else-if="item.type === 'game_detected'"
            color="#22C55E"
            size="28"
          >
            mdi-check-decagram
          </v-icon>
          <v-icon
            v-else-if="item.type === 'rom_unknown'"
            color="#F59E0B"
            size="28"
          >
            mdi-alert-circle-outline
          </v-icon>
          <v-icon
            v-else-if="item.type === 'auth_failed'"
            color="#EF4444"
            size="28"
          >
            mdi-close-circle-outline
          </v-icon>
          <v-icon v-else color="#3B82F6" size="28">
            mdi-trophy
          </v-icon>
        </div>

        <div class="r-ra-notif-card__content">
          <div class="r-ra-notif-card__header">
            <span class="r-ra-notif-card__title">{{ item.title }}</span>
            <span
              v-if="item.points !== undefined && item.points > 0"
              class="r-ra-notif-card__points"
            >
              +{{ item.points }} pts
            </span>
          </div>
          <p v-if="item.subtitle" class="r-ra-notif-card__subtitle">
            {{ item.subtitle }}
          </p>
        </div>

        <button
          type="button"
          class="r-ra-notif-card__close"
          aria-label="Dismiss notification"
          @click="onDismiss(item.id)"
        >
          <v-icon size="16" color="rgba(255, 255, 255, 0.6)">mdi-close</v-icon>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.r-ra-notifs {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 380px;
  width: calc(100% - 32px);
  pointer-events: none;
}

.r-ra-notif-card {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(18, 18, 24, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  color: #ffffff;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.r-ra-notif-card--achievement_unlocked {
  border-color: rgba(234, 179, 8, 0.4);
  background: linear-gradient(
    135deg,
    rgba(34, 25, 12, 0.92) 0%,
    rgba(18, 18, 24, 0.92) 100%
  );
}

.r-ra-notif-card--game_detected {
  border-color: rgba(34, 197, 94, 0.3);
}

.r-ra-notif-card--rom_unknown {
  border-color: rgba(245, 158, 11, 0.3);
}

.r-ra-notif-card__icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
}

.r-ra-notif-card__badge {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 4px;
}

.r-ra-notif-card__content {
  flex: 1;
  min-width: 0;
}

.r-ra-notif-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.r-ra-notif-card__title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.r-ra-notif-card__points {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 9999px;
  background: rgba(234, 179, 8, 0.2);
  color: #fef08a;
  border: 1px solid rgba(234, 179, 8, 0.3);
  flex-shrink: 0;
}

.r-ra-notif-card__subtitle {
  margin: 2px 0 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.8);
  word-break: break-word;
}

.r-ra-notif-card__close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.r-ra-notif-card__close:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* Animations */
.r-ra-notif-slide-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.r-ra-notif-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.7, 0, 0.84, 0);
}

.r-ra-notif-slide-enter-from {
  opacity: 0;
  transform: translateX(-24px) scale(0.95);
}

.r-ra-notif-slide-leave-to {
  opacity: 0;
  transform: translateX(-16px) scale(0.92);
}
</style>
