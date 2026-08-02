<script setup lang="ts">
// RandomPickWidget — picks a random ROM from the library and surfaces
// it on the Home dashboard. Body: cover + name + platform + release
// year / region, the whole thing a link to the rom. Reroll lives in
// the card's top-right action slot and reshuffles in place instantly.
import { RBtn, RChip } from "@v2/lib";
import { computed, nextTick, onMounted, ref } from "vue";
import type { ComponentPublicInstance } from "vue";
import { useI18n } from "vue-i18n";
import { ROUTES } from "@/plugins/router";
import romApi from "@/services/api/rom";
import type { SimpleRom } from "@/stores/roms";
import CachedPlatformIcon from "@/v2/components/shared/CachedPlatformIcon.vue";
import GameCover from "@/v2/components/shared/GameCover.vue";
import { useSnackbar } from "@/v2/composables/useSnackbar";
import WidgetCard from "./WidgetCard.vue";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
const snackbar = useSnackbar();

const DICE_FACES = [
  "mdi-dice-1-outline",
  "mdi-dice-2-outline",
  "mdi-dice-3-outline",
  "mdi-dice-4-outline",
  "mdi-dice-5-outline",
  "mdi-dice-6-outline",
];

const pick = ref<SimpleRom | null>(null);
const failed = ref(false);
const isSpinning = ref(false);
const isBouncing = ref(false);
const diceFace = ref(DICE_FACES[Math.floor(Math.random() * DICE_FACES.length)]);
const rerollBtn = ref<ComponentPublicInstance | null>(null);
const isInitialLoading = ref(true);

const preloadedQueue: SimpleRom[] = [];
let availableIds: number[] = [];
let isPrefetching = false;

function rerollEl(): HTMLElement | null {
  return (rerollBtn.value?.$el as HTMLElement | undefined) ?? null;
}

const title = computed(() => pick.value?.name || pick.value?.fs_name || "");

const releaseYear = computed(() => {
  const ts = pick.value?.metadatum?.first_release_date;
  if (!ts) return null;
  const date = new Date(Number(ts));
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
});

const region = computed(() => pick.value?.regions?.[0] ?? null);

const placeholder = computed(() =>
  failed.value
    ? t("home.widget-random-pick-error")
    : t("home.widget-random-pick-empty"),
);

function rollDiceFace() {
  const others = DICE_FACES.filter((face) => face !== diceFace.value);
  diceFace.value = others[Math.floor(Math.random() * others.length)];
}

async function loadOneRom(): Promise<SimpleRom | null> {
  try {
    if (availableIds.length === 0) {
      const { data: res } = await romApi.getRoms({
        limit: 1,
        offset: 0,
        withRomIdIndex: true,
        withCharIndex: false,
        withFilterValues: false,
      });
      availableIds = res.rom_id_index || [];
      if (availableIds.length === 0 && res.items?.length > 0) {
        return res.items[0];
      }
    }
    if (availableIds.length === 0) return null;

    const randomOffset = Math.floor(Math.random() * availableIds.length);
    const { data: result } = await romApi.getRoms({
      limit: 1,
      offset: randomOffset,
      withTotal: false,
      withCharIndex: false,
      withFilterValues: false,
      withRomIdIndex: false,
    });
    const rom = result.items.at(0) || null;
    if (rom) {
      const coverUrl = rom.cover_url || (rom as any)?.metadatum?.cover_url;
      if (coverUrl) {
        const img = new Image();
        img.src = coverUrl;
      }
    }
    return rom;
  } catch {
    return null;
  }
}

async function fillQueue() {
  if (isPrefetching) return;
  isPrefetching = true;
  try {
    while (preloadedQueue.length < 5) {
      const rom = await loadOneRom();
      if (rom) {
        preloadedQueue.push(rom);
      } else {
        break;
      }
    }
  } finally {
    isPrefetching = false;
  }
}

async function onReroll() {
  rollDiceFace();
  const hadFocus = document.activeElement === rerollEl();

  isSpinning.value = true;
  setTimeout(() => {
    isSpinning.value = false;
  }, 400);

  let nextRom: SimpleRom | null = null;
  if (preloadedQueue.length > 0) {
    nextRom = preloadedQueue.shift()!;
  } else {
    nextRom = await loadOneRom();
  }

  if (nextRom) {
    pick.value = nextRom;
    failed.value = false;
    isBouncing.value = false;
    await nextTick();
    isBouncing.value = true;
    setTimeout(() => {
      isBouncing.value = false;
    }, 500);
  } else if (!pick.value) {
    failed.value = true;
  }

  if (hadFocus) {
    await nextTick();
    rerollEl()?.focus();
  }

  // Refill queue asynchronously in background (never blocking the UI)
  void fillQueue();
}

onMounted(async () => {
  isInitialLoading.value = true;
  const initialRom = await loadOneRom();
  if (initialRom) {
    pick.value = initialRom;
    failed.value = false;
  } else {
    failed.value = true;
  }
  isInitialLoading.value = false;
  void fillQueue();
});
</script>

<template>
  <WidgetCard title="SÉLECTION ALÉATOIRE" width="320px" :loading="isInitialLoading">
    <template #action>
      <RBtn
        ref="rerollBtn"
        variant="text"
        size="small"
        :icon="diceFace"
        class="r-v2-widget-pick__reroll"
        :class="{ 'is-spinning': isSpinning }"
        :tooltip="t('home.widget-random-pick-reroll')"
        :aria-label="t('home.widget-random-pick-reroll')"
        @click="onReroll"
      />
    </template>
    <router-link
      v-if="pick"
      class="r-v2-widget-pick__body"
      :class="{ 'is-bouncing': isBouncing }"
      :to="{ name: ROUTES.ROM, params: { rom: pick.id } }"
    >
      <GameCover
        :rom="pick"
        :title="title"
        :identified="pick.is_identified"
        class="r-v2-widget-pick__cover"
      />
      <div class="r-v2-widget-pick__info">
        <div class="r-v2-widget-pick__name">
          {{ title }}
        </div>

        <div class="r-v2-widget-pick__platform">
          <CachedPlatformIcon
            v-if="pick.platform"
            :platform="pick.platform"
            :size="14"
            class="r-v2-widget-pick__platform-icon"
          />
          <span class="r-v2-widget-pick__platform-name">
            {{ pick.platform?.fs_name || pick.platform?.name }}
          </span>
        </div>

        <div v-if="releaseYear || region" class="r-v2-widget-pick__chips">
          <RChip v-if="releaseYear" size="x-small" variant="subtle">
            {{ releaseYear }}
          </RChip>
          <RChip v-if="region" size="x-small" variant="subtle">
            {{ region }}
          </RChip>
        </div>
      </div>
    </router-link>
    <div v-else class="r-v2-widget-pick__placeholder">
      {{ placeholder }}
    </div>
  </WidgetCard>
</template>

<style scoped>
.r-v2-widget-pick__body {
  display: flex;
  gap: 12px;
  align-items: center;
  text-decoration: none;
  color: inherit;
  width: 100%;
  transition: transform var(--r-motion-fast) var(--r-motion-ease-out);
}

.r-v2-widget-pick__body:hover {
  transform: translateY(-1px);
}

.r-v2-widget-pick__cover {
  width: 58px;
  height: 78px;
  flex-shrink: 0;
  border-radius: var(--r-radius-sm);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.r-v2-widget-pick__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.r-v2-widget-pick__name {
  font-size: 13.5px;
  font-weight: var(--r-font-weight-semibold);
  color: var(--r-color-fg);
  line-height: 1.3;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.r-v2-widget-pick__platform {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--r-color-fg-secondary);
  font-size: 11.5px;
}

.r-v2-widget-pick__platform-icon {
  flex-shrink: 0;
}

.r-v2-widget-pick__platform-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.r-v2-widget-pick__chips {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 2px;
}

.r-v2-widget-pick__placeholder {
  font-size: 12px;
  color: var(--r-color-fg-faint);
  text-align: center;
  padding: 12px 0;
}

.r-v2-widget-pick__reroll {
  color: var(--r-color-fg-secondary);

  &:hover {
    color: var(--r-color-fg);
  }

  &.is-spinning {
    animation: r-v2-dice-spin 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
}

@keyframes r-v2-dice-spin {
  0% {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(1.25);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}

.r-v2-widget-pick__body.is-bouncing {
  animation: r-v2-pick-bounce 0.45s ease-out;
}

@keyframes r-v2-pick-bounce {
  0% {
    transform: scale(0.97);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.02);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
