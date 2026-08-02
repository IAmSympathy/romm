<script setup lang="ts">
// ActiveSessionsWidget — surfaces active users currently playing games
// on the RomM Home dashboard.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ROUTES } from "@/plugins/router";
import CachedPlatformIcon from "@/v2/components/shared/CachedPlatformIcon.vue";
import { useActiveSessions } from "@/v2/composables/useActiveSessions";
import WidgetCard from "./WidgetCard.vue";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
const { activeSessions } = useActiveSessions();

const sessionsCount = computed(() => activeSessions.value.length);
</script>

<template>
  <WidgetCard :title="t('home.widget-active-sessions', 'Sessions Actives')">
    <template #action>
      <span v-if="sessionsCount > 0" class="r-v2-widget-active__count">
        <span class="r-v2-widget-active__dot" />
        {{ sessionsCount }}
      </span>
    </template>

    <div v-if="sessionsCount > 0" class="r-v2-widget-active__list">
      <router-link
        v-for="session in activeSessions"
        :key="`${session.user_id}-${session.rom_id}-${session.started_at}`"
        class="r-v2-widget-active__item"
        :to="{ name: ROUTES.ROM, params: { rom: session.rom_id } }"
      >
        <div class="r-v2-widget-active__avatar-wrapper">
          <img
            v-if="session.avatar_path"
            :src="session.avatar_path"
            :alt="session.username"
            class="r-v2-widget-active__avatar"
          />
          <div v-else class="r-v2-widget-active__avatar-fallback">
            {{ session.username?.charAt(0).toUpperCase() || "?" }}
          </div>
          <span class="r-v2-widget-active__pulse-dot" />
        </div>

        <div class="r-v2-widget-active__info">
          <div class="r-v2-widget-active__user-name">
            {{ session.username }}
          </div>
          <div class="r-v2-widget-active__rom-name">
            {{ session.rom_name || session.platform_name || "En jeu" }}
          </div>
          <div class="r-v2-widget-active__platform">
            <CachedPlatformIcon
              :slug="session.platform_slug"
              :name="session.platform_name"
              :size="12"
            />
            <span>{{ session.platform_name }}</span>
          </div>
        </div>
      </router-link>
    </div>

    <div v-else class="r-v2-widget-active__empty">
      {{ t("home.widget-active-sessions-empty", "Aucun joueur en ligne pour le moment") }}
    </div>
  </WidgetCard>
</template>

<style scoped>
.r-v2-widget-active__count {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: var(--r-font-weight-semibold);
  color: var(--r-color-brand-primary);
  background: rgba(var(--r-color-brand-primary-rgb, 79, 110, 247), 0.12);
  padding: 2px 8px;
  border-radius: var(--r-radius-full);
}

.r-v2-widget-active__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse-green 1.8s infinite;
}

.r-v2-widget-active__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.r-v2-widget-active__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--r-radius-sm);
  color: inherit;
  text-decoration: none;
  background: var(--r-color-surface-variant, rgba(255, 255, 255, 0.04));
  transition: background var(--r-motion-fast) var(--r-motion-ease-out);
}

.r-v2-widget-active__item:hover {
  background: var(--r-color-surface-hover, rgba(255, 255, 255, 0.08));
}

.r-v2-widget-active__avatar-wrapper {
  position: relative;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.r-v2-widget-active__avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.r-v2-widget-active__avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--r-color-brand-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 13px;
}

.r-v2-widget-active__pulse-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #10b981;
  border: 1.5px solid var(--r-color-bg, #121212);
  box-shadow: 0 0 6px #10b981;
}

.r-v2-widget-active__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.r-v2-widget-active__user-name {
  font-size: 12px;
  font-weight: var(--r-font-weight-semibold);
  color: var(--r-color-fg);
  line-height: 1.2;
}

.r-v2-widget-active__rom-name {
  font-size: 11.5px;
  color: var(--r-color-brand-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.r-v2-widget-active__platform {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--r-color-fg-muted);
}

.r-v2-widget-active__empty {
  font-size: 12px;
  color: var(--r-color-fg-faint);
  padding: 8px 0;
}

@keyframes pulse-green {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}
</style>
