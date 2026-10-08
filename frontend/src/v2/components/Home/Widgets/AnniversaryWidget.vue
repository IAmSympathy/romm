<script setup lang="ts">
// AnniversaryWidget: games released on today's date in an earlier year, one at
// a time, with arrows to page through the rest. It reads the shared rom list a
// page at a time, so a card costs a page rather than the whole day.
//
// `anniversaryQuery` reads the client's own clock, so "today" is the date in
// front of the user and no timezone offset can reach it.
import { RBtn } from "@v2/lib";
import { anniversaryQuery, releaseYear } from "@v2/utils/time";
import type { AnniversaryQuery } from "@v2/utils/time";
import { useIntervalFn } from "@vueuse/core";
import { computed, nextTick, onMounted, ref } from "vue";
import type { ComponentPublicInstance, Ref } from "vue";
import { useI18n } from "vue-i18n";
import { ROUTES } from "@/plugins/router";
import romApi from "@/services/api/rom";
import type { SimpleRom } from "@/stores/roms";
import CachedPlatformIcon from "@/v2/components/shared/CachedPlatformIcon.vue";
import GameCover from "@/v2/components/shared/GameCover.vue";
import { NO_SIDECARS } from "@/v2/stores/galleryRoms";
import WidgetCard from "./WidgetCard.vue";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();

// A Home page can sit open across local midnight, and the card is pinned to a
// date, so the day it was loaded for is compared against the clock.
const DAY_ROLLOVER_CHECK_MS = 60_000;

// More cards than anyone clicks through in a sitting, so one request usually
// covers the whole visit.
const PAGE_SIZE = 24;

// Accumulated a page at a time, so paging back is always in memory and only
// moving past the end fetches.
const roms = ref<SimpleRom[]>([]);
const total = ref(0);
const loadedDay = ref("");
const dayQuery = ref<AnniversaryQuery | null>(null);
const index = ref(0);
const loading = ref(false);
const paging = ref(false);
const failed = ref(false);
const prevBtn = ref<ComponentPublicInstance | null>(null);
const nextBtn = ref<ComponentPublicInstance | null>(null);

const current = computed<SimpleRom | null>(
  () => roms.value[index.value] ?? null,
);

const title = computed(
  () => current.value?.name || current.value?.fs_name || "",
);

const atStart = computed(() => index.value <= 0);
const atEnd = computed(() => index.value >= total.value - 1);

// The query already excludes the viewer's current year; this keeps a client
// whose clock disagrees with the server's from rendering "0 years ago".
const yearsAgo = computed(() => {
  const released = releaseYear(current.value?.metadatum?.first_release_date);
  if (!released) return null;
  const years = new Date().getFullYear() - released;
  return years >= 1 ? years : null;
});

const placeholder = computed(() =>
  failed.value
    ? t("home.widget-anniversaries-error")
    : t("home.widget-anniversaries-empty"),
);

function btnEl(btn: Ref<ComponentPublicInstance | null>): HTMLElement | null {
  return (btn.value?.$el as HTMLElement | undefined) ?? null;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function fetchPage(query: AnniversaryQuery, offset: number) {
  return romApi.getRoms({
    releasedDays: query.days,
    releasedBeforeYear: query.beforeYear,
    orderBy: "first_release_date",
    orderDir: "asc",
    limit: PAGE_SIZE,
    offset,
    // The counter needs the total once; a later page already has it.
    withTotal: offset === 0,
    ...NO_SIDECARS,
  });
}

/** Drops the day's games, so the card falls back to its placeholder. */
function showEmptyDay() {
  roms.value = [];
  total.value = 0;
  index.value = 0;
  loading.value = false;
}

async function load() {
  const today = new Date();
  const day = dayKey(today);
  loadedDay.value = day;

  const query = anniversaryQuery(today);
  dayQuery.value = query;
  if (!query) {
    // 1 January, which the helper refuses: there is nothing to ask for.
    showEmptyDay();
    failed.value = false;
    return;
  }

  // A request spanning midnight can land after the rollover's. Committing it
  // would pin the card to yesterday until the next rollover, a day away.
  const stale = () => loadedDay.value !== day;

  loading.value = true;
  try {
    const { data } = await fetchPage(query, 0);
    if (stale()) return;
    roms.value = data.items;
    total.value = data.total ?? data.items.length;
    index.value = 0;
    failed.value = false;
    loading.value = false;
  } catch {
    if (stale()) return;
    // Failures show in the card's own copy rather than the snackbar stack.
    showEmptyDay();
    failed.value = true;
    // Leave the day unclaimed so the rollover check retries it. Claimed, a
    // single failed request would hold the error copy until local midnight.
    loadedDay.value = "";
  }
}

/** Appends the next page, leaving the current card alone if it fails. */
async function loadNextPage() {
  const query = dayQuery.value;
  const day = loadedDay.value;
  if (!query || paging.value) return;

  paging.value = true;
  try {
    const { data } = await fetchPage(query, roms.value.length);
    if (loadedDay.value !== day) return;
    roms.value = [...roms.value, ...data.items];
  } catch {
    // The card on screen is still good, and the arrow stays live to retry.
  } finally {
    if (loadedDay.value === day) paging.value = false;
  }
}

async function step(delta: number) {
  const target = index.value + delta;
  if (target < 0 || target >= total.value) return;

  const back = delta < 0;
  const moved = back ? prevBtn : nextBtn;
  const other = back ? nextBtn : prevBtn;
  const hadFocus = document.activeElement === btnEl(moved);

  if (target >= roms.value.length) {
    await loadNextPage();
    // Stay put when the page didn't land, rather than blanking the card.
    if (target >= roms.value.length) return;
  }

  index.value = target;

  // Reaching an end disables the arrow that got you there, which pulls focus to
  // <body>; hand it to the arrow that still works.
  if (hadFocus && (back ? atStart.value : atEnd.value)) {
    await nextTick();
    btnEl(other)?.focus();
  }
}

onMounted(load);

useIntervalFn(() => {
  if (dayKey(new Date()) !== loadedDay.value) void load();
}, DAY_ROLLOVER_CHECK_MS);
</script>

<template>
  <WidgetCard
    :title="t('home.widget-anniversaries')"
    width="320px"
    :loading="loading"
    class="r-v2-widget-anniv"
  >
    <template #action>
      <div class="r-v2-widget-anniv__nav">
        <span v-if="total > 1" class="r-v2-widget-anniv__counter">
          {{ index + 1 }} / {{ total }}
        </span>
        <RBtn
          ref="prevBtn"
          variant="text"
          size="x-small"
          icon="mdi-chevron-left"
          :disabled="atStart"
          :tooltip="t('home.widget-anniversaries-prev')"
          :aria-label="t('home.widget-anniversaries-prev')"
          class="r-v2-widget-anniv__nav-btn"
          @click="step(-1)"
        />
        <RBtn
          ref="nextBtn"
          variant="text"
          size="x-small"
          icon="mdi-chevron-right"
          :disabled="atEnd"
          :loading="paging"
          :tooltip="t('home.widget-anniversaries-next')"
          :aria-label="t('home.widget-anniversaries-next')"
          class="r-v2-widget-anniv__nav-btn"
          @click="step(1)"
        />
      </div>
    </template>
    <router-link
      v-if="current"
      class="r-v2-widget-anniv__body"
      :to="{ name: ROUTES.ROM, params: { rom: current.id } }"
    >
      <!-- Celebration badge: Years elapsed -->
      <div v-if="yearsAgo" class="r-v2-widget-anniv__badge">
        <span class="r-v2-widget-anniv__sparkle">✨</span>
        <span>{{
          t("home.widget-anniversaries-years", { count: yearsAgo })
        }}</span>
      </div>

      <!-- Main Showcase Cover -->
      <div class="r-v2-widget-anniv__cover-wrapper">
        <GameCover
          :rom="current"
          :title="title"
          :identified="current.is_identified"
          class="r-v2-widget-anniv__cover"
        />
      </div>

      <!-- Info Area -->
      <div class="r-v2-widget-anniv__info">
        <div class="r-v2-widget-anniv__name">{{ title }}</div>
        <div class="r-v2-widget-anniv__platform">
          <CachedPlatformIcon
            :slug="current.platform_slug"
            :name="current.platform_display_name"
            :size="14"
          />
          <span class="r-v2-widget-anniv__platform-name">
            {{ current.platform_display_name }}
          </span>
        </div>
      </div>
    </router-link>
    <div v-else class="r-v2-widget-anniv__empty">
      <span class="r-v2-widget-anniv__empty-icon">🎂</span>
      <span>{{ placeholder }}</span>
    </div>
  </WidgetCard>
</template>

<style scoped>
/* ── Anniversary Header Action & Navigation ─────────────────────── */
.r-v2-widget-anniv__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.r-v2-widget-anniv__counter {
  font-size: 11px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  margin-right: 2px;
}

.r-v2-widget-anniv__nav-btn {
  color: #cbd5e1;
  transition: color var(--r-motion-fast) ease;
}

.r-v2-widget-anniv__nav-btn:hover:not(:disabled) {
  color: #fbbf24;
}

/* ── Card Body & Vertical Fill ──────────────────────────────────── */
.r-v2-widget-anniv__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  margin-top: 2px;
  overflow: visible;
  color: inherit;
  text-decoration: none;
  border-radius: var(--r-radius-sm);
  position: relative;
}

/* ── Festive Anniversary Pill Badge ─────────────────────────────── */
.r-v2-widget-anniv__badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--r-radius-pill);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #fef08a;
  background: linear-gradient(
    135deg,
    rgba(245, 158, 11, 0.22),
    rgba(217, 119, 6, 0.35)
  );
  border: 1px solid rgba(251, 191, 36, 0.45);
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.2);
  flex-shrink: 0;
  margin-bottom: 4px;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.r-v2-widget-anniv__sparkle {
  font-size: 11px;
  line-height: 1;
}

/* ── Hero Cover Showcase ────────────────────────────────────────── */
.r-v2-widget-anniv__cover-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  width: 100%;
  min-height: 130px;
  max-height: 155px;
  position: relative;
}

.r-v2-widget-anniv__body .r-v2-widget-anniv__cover {
  height: auto;
  max-height: 155px;
  min-height: 130px;
  width: auto;
  max-width: 100%;
  flex: 1 1 auto;
  object-fit: contain;
  --r-cover-radius: var(--r-radius-sm);
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.45));
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Interactive Hover Lift */
html:not([data-input="pad"])
  .r-v2-widget-anniv__body:hover
  .r-v2-widget-anniv__cover {
  transform: translateY(-2px) scale(1.02);
}

html:not([data-input="pad"])
  .r-v2-widget-anniv__body:hover
  .r-v2-widget-anniv__badge {
  border-color: rgba(251, 191, 36, 0.7);
  box-shadow: 0 3px 14px rgba(245, 158, 11, 0.35);
}

/* ── Game Info Section ──────────────────────────────────────────── */
.r-v2-widget-anniv__info {
  width: 100%;
  align-items: center;
  text-align: center;
  gap: 4px;
  flex-shrink: 0;
  overflow: visible;
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}

.r-v2-widget-anniv__name {
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

/* Hover / Focus accent color */
html:not([data-input="pad"])
  .r-v2-widget-anniv__body:hover
  .r-v2-widget-anniv__name,
.r-v2-widget-anniv__body:focus-visible .r-v2-widget-anniv__name {
  color: #fbbf24;
}

.r-v2-widget-anniv__platform {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11px;
  color: var(--r-color-fg-muted);
}

.r-v2-widget-anniv__platform-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Empty & Error States ───────────────────────────────────────── */
.r-v2-widget-anniv__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  text-align: center;
  color: var(--r-color-fg-muted);
  font-size: 12.5px;
  padding: 16px;
}

.r-v2-widget-anniv__empty-icon {
  font-size: 28px;
  opacity: 0.8;
}
</style>
