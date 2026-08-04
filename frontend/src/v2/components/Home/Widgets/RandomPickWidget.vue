<script setup lang="ts">
// RandomPickWidget — picks a random ROM from the library and surfaces
// it on the Home dashboard. Body: cover + name + platform + release
// year / region, the whole thing a link to the rom. Reroll lives in
// the card's top-right action slot and reshuffles in place without
// navigating. Two API calls per pick: one to learn the library total,
// one to fetch the selected offset; same approach the v1 RandomBtn
// uses. The pick is intentionally not cached so each mount re-shuffles.
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

// The reroll button shows a real die face rather than the stacked
// `dice-multiple` glyph, which reads as two windows at this size. Each
// roll lands on a different face.
const DICE_FACES = [
  "mdi-dice-1-outline",
  "mdi-dice-2-outline",
  "mdi-dice-3-outline",
  "mdi-dice-4-outline",
  "mdi-dice-5-outline",
  "mdi-dice-6-outline",
];

// A pick needs a single row, so it opts out of the char index, filter
// values and rom id index the endpoint returns by default: each of them
// spans the whole library and dwarfs the row itself.
const PICK_QUERY = {
  limit: 1,
  withCharIndex: false,
  withFilterValues: false,
  withRomIdIndex: false,
} as const;

const pick = ref<SimpleRom | null>(null);
const loading = ref(false);
const failed = ref(false);
const isSpinning = ref(false);
const isBouncing = ref(false);
const diceFace = ref(DICE_FACES[Math.floor(Math.random() * DICE_FACES.length)]);
const rerollBtn = ref<ComponentPublicInstance | null>(null);

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

let globalLibraryTotal: number | null = null;
const totalRoms = ref<number | null>(globalLibraryTotal);

// One attempt at a pick using the dedicated random ROM endpoint.
async function pickOnce(): Promise<SimpleRom | null> {
  console.time("random-api");
  const { data: rom } = await romApi.getRandomRom();
  console.timeEnd("random-api");
  if (rom) {
    const coverUrl = (rom as any).cover_url || (rom as any)?.metadatum?.cover_url;
    if (coverUrl) {
      // Non-blocking image preload (fire and forget) so rerolls remain instant
      const img = new Image();
      img.src = coverUrl;
    }
  }
  return rom || null;
}

const isInitialLoading = ref(true);

async function reroll({ notify }: { notify: boolean }) {
  console.time("TOTAL REROLL");
  rollDiceFace();
  const hadFocus = document.activeElement === rerollEl();
  
  isSpinning.value = true;
  setTimeout(() => {
    isSpinning.value = false;
  }, 400);

  try {
    const rom = await pickOnce();
    console.time("API");
    if (!rom) throw new Error("random pick came back empty");
    pick.value = rom;
    console.timeEnd("TOTAL REROLL");
    failed.value = false;

    isBouncing.value = false;
    await nextTick();
    isBouncing.value = true;
    setTimeout(() => {
      isBouncing.value = false;
    }, 500);

  } catch {
    failed.value = true;
    if (notify) snackbar.error(t("home.widget-random-pick-error"));
  } finally {
    loading.value = false;
    isInitialLoading.value = false;
    if (hadFocus) {
      await nextTick();
      rerollEl()?.focus();
    }
  }
}

function onReroll() {
  void reroll({ notify: true });
}

// The first pick is ours, not the user's
onMounted(() => reroll({ notify: false }));
</script>

<template>
  <WidgetCard title="SÉLECTION ALÉATOIRE" width="320px" :loading="isInitialLoading">
    <template #action>
      <RBtn
        ref="rerollBtn"
        variant="text"
        size="small"
        :icon="diceFace"
        :disabled="loading"
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
        <div class="r-v2-widget-pick__name">{{ title }}</div>
        <div class="r-v2-widget-pick__platform">
          <CachedPlatformIcon
            :slug="pick.platform_slug"
            :name="pick.platform_display_name"
            :size="14"
          />
          <span class="r-v2-widget-pick__platform-name">
            {{ pick.platform_display_name }}
          </span>
        </div>
        <!-- Year + region disambiguate the pick when a library holds
             several variations of the same title. -->
        <div v-if="releaseYear || region" class="r-v2-widget-pick__meta">
          <span v-if="releaseYear">{{ releaseYear }}</span>
          <RChip v-if="region" size="x-small" variant="translucent">
            {{ region }}
          </RChip>
        </div>
      </div>
    </router-link>
    <div v-else class="r-v2-widget-pick__empty">
      {{ placeholder }}
    </div>
  </WidgetCard>
</template>

<style scoped>
.r-v2-widget-pick__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  margin-top: 6px;
  overflow: visible;
  color: inherit;
  text-decoration: none;
  border-radius: var(--r-radius-sm);
}

.r-v2-widget-pick__body .r-v2-widget-pick__cover {
  height: auto;
  max-height: 162px;
  min-height: 135px;
  width: auto;
  max-width: 100%;
  flex: 1 1 auto;
  object-fit: contain;
  --r-cover-radius: var(--r-radius-sm);
}

.r-v2-widget-pick__info {
  width: 100%;
  align-items: center;
  text-align: center;
  gap: 4px;
  flex-shrink: 0;
  overflow: visible;
  display: flex;
  flex-direction: column;
}

.r-v2-widget-pick__name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  color: var(--r-color-fg);
  transition: color var(--r-motion-fast) var(--r-motion-ease-out);
}

/* Hover is gated to pointer modalities so a parked cursor doesn't
   compete with the focused element under keyboard / gamepad. */
html[data-input="mouse"] .r-v2-widget-pick__body:hover .r-v2-widget-pick__name,
html[data-input="touch"] .r-v2-widget-pick__body:hover .r-v2-widget-pick__name,
.r-v2-widget-pick__body:focus-visible .r-v2-widget-pick__name {
  color: var(--r-color-brand-primary);
}

.r-v2-widget-pick__platform {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11px;
  color: var(--r-color-fg-muted);
}

.r-v2-widget-pick__platform-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.r-v2-widget-pick__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  font-size: 11px;
  color: var(--r-color-fg-muted);
  font-variant-numeric: tabular-nums;
}

/* The die reads as a die only above the button's default 1.25em glyph. */
.r-v2-widget-pick__reroll :deep(.r-btn__icon) {
  font-size: 19px;
}

.r-v2-widget-pick__empty {
  font-size: 12px;
  color: var(--r-color-fg-faint);
  margin-top: auto;
}

/* ── Elastic Spring Bounce & Dice Roll Animations ────────────────── */
.r-v2-widget-pick__reroll.is-spinning :deep(.r-btn__icon) {
  animation: dice-spin 0.65s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.r-v2-widget-pick__body.is-bouncing {
  animation: spring-bounce 0.65s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dice-spin {
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

@keyframes spring-bounce {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(0.94) translateY(2px);
  }
  60% {
    transform: scale(1.04) translateY(-3px);
  }
  80% {
    transform: scale(0.99) translateY(1px);
  }
  100% {
    transform: scale(1) translateY(0);
  }
}
</style>
