<script setup lang="ts">
// ActiveSessionsWidget — replicates the exact 1:1 dual-column card layout
// and styling from the custom patch.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ROUTES } from "@/plugins/router";
import { useActiveSessions } from "@/v2/composables/useActiveSessions";
import WidgetCard from "./WidgetCard.vue";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
const { activeSessions, getAvatarUrl, getCoverUrl } = useActiveSessions();

const sessionsCount = computed(() => activeSessions.value.length);
</script>

<template>
  <WidgetCard title="SESSIONS DE JEU" width="490px">
    <template #action>
      <span class="r-v2-widget-active__count">
        {{ sessionsCount }} EN LIGNE
      </span>
    </template>

    <div v-if="sessionsCount > 0" class="r-v2-widget-active__list">
      <router-link
        v-for="session in activeSessions"
        :key="`${session.user_id}-${session.rom_id}-${session.started_at}`"
        class="r-v2-widget-active__card"
        :to="session.rom_id && session.rom_id > 0 ? { name: ROUTES.ROM, params: { rom: session.rom_id } } : {}"
      >
        <!-- Far-left 44px Avatar with Purple Ring -->
        <div class="r-v2-widget-active__avatar-cover">
          <img
            v-if="getAvatarUrl(session)"
            :src="getAvatarUrl(session)!"
            :alt="session.username"
            @error="($event.target as HTMLElement).style.display = 'none'"
          />
          <span v-else>{{ session.username?.charAt(0).toUpperCase() || 'U' }}</span>
        </div>

        <!-- Info Column -->
        <div class="r-v2-widget-active__info">
          <!-- Username + Green Online Dot -->
          <div class="r-v2-widget-active__user">
            <span>{{ session.username || 'Joueur' }}</span>
            <span v-if="session.rom_id && session.rom_id > 0" class="r-v2-widget-active__online-dot" />
          </div>

          <!-- Active Game Row OR Online Browsing Status -->
          <div v-if="session.rom_id && session.rom_id > 0" class="r-v2-widget-active__game-row">
            <!-- Cover Art Thumbnail -->
            <div class="r-v2-widget-active__game-cover">
              <img
                v-if="getCoverUrl(session)"
                :src="getCoverUrl(session)"
                :alt="session.rom_name"
                @error="($event.target as HTMLElement).style.display = 'none'"
              />
              <span v-else class="r-v2-widget-active__game-cover-fallback">🎮</span>
            </div>

            <!-- Game Details -->
            <div class="r-v2-widget-active__game-details">
              <div class="r-v2-widget-active__game-title">
                {{ session.rom_name || 'Jeu' }}
              </div>
              <div class="r-v2-widget-active__plat-badge">
                {{ session.platform_name || session.platform_slug || 'En jeu' }}
              </div>
            </div>
          </div>

          <div v-else class="r-v2-widget-active__online-text">
            En ligne sur le site
          </div>
        </div>

        <!-- Chevron Icon on right -->
        <span v-if="session.rom_id && session.rom_id > 0" class="r-v2-widget-active__chevron">
          ›
        </span>
      </router-link>
    </div>

    <div v-else class="r-v2-widget-active__empty">
      <span>Aucun utilisateur en ligne actuellement</span>
    </div>
  </WidgetCard>
</template>

<style scoped>
.r-v2-widget-active__count {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.r-v2-widget-active__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
}

.r-v2-widget-active__card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 78px;
  color: inherit;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
  box-sizing: border-box;
}

.r-v2-widget-active__card:hover {
  background: rgba(167, 139, 250, 0.12);
  border-color: rgba(167, 139, 250, 0.35);
}

.r-v2-widget-active__avatar-cover {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #4c1d95);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  flex-shrink: 0;
  overflow: hidden;
  border: 2px solid rgba(167, 139, 250, 0.5);
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.35);
}

.r-v2-widget-active__avatar-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.r-v2-widget-active__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
}

.r-v2-widget-active__user {
  font-size: 12.5px;
  font-weight: 600;
  color: #a78bfa;
  display: flex;
  align-items: center;
  gap: 5px;
}

.r-v2-widget-active__online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  display: inline-block;
  box-shadow: 0 0 5px 1px rgba(34, 197, 94, 0.75);
  animation: subtleBreathing 2s infinite ease-in-out;
}

.r-v2-widget-active__game-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 1px;
}

.r-v2-widget-active__game-cover {
  height: 38px;
  min-width: 26px;
  max-width: 52px;
  border-radius: 5px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.r-v2-widget-active__game-cover img {
  max-width: 52px;
  max-height: 38px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

.r-v2-widget-active__game-details {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.r-v2-widget-active__game-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.r-v2-widget-active__plat-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  font-size: 10px;
  font-weight: 600;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 7px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 1px;
}

.r-v2-widget-active__online-text {
  font-size: 11.5px;
  font-weight: 500;
  color: #94a3b8;
  margin-top: 1px;
}

.r-v2-widget-active__chevron {
  color: #64748b;
  font-size: 22px;
  font-weight: 300;
  margin-left: auto;
}

.r-v2-widget-active__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  color: #94a3b8;
  font-size: 12.5px;
  text-align: center;
}

@keyframes subtleBreathing {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 3px 0.5px rgba(34, 197, 94, 0.4);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 5px 1px rgba(34, 197, 94, 0.75);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 3px 0.5px rgba(34, 197, 94, 0.4);
  }
}
</style>
