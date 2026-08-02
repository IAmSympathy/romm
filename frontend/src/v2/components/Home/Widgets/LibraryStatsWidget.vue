<script setup lang="ts">
// LibraryStatsWidget — 2-column grid layout matching the patch spec (295px width).
import { RIcon } from "@v2/lib";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import api from "@/services/api";
import storeCollections from "@/stores/collections";
import { formatBytes } from "@/utils";
import WidgetCard from "./WidgetCard.vue";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
const collectionsStore = storeCollections();
const { favoriteCollection } = storeToRefs(collectionsStore);

interface Stats {
  PLATFORMS: number;
  ROMS: number;
  SAVES: number;
  STATES: number;
  SCREENSHOTS: number;
  TOTAL_FILESIZE_BYTES: number;
}

const stats = ref<Stats | null>(null);
const loading = ref(true);

const favoritesCount = computed(
  () => favoriteCollection.value?.rom_ids?.length ?? 0,
);

interface Row {
  icon: string;
  label: string;
  value: string;
}

const allRows = computed<Row[]>(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    {
      icon: "mdi-disc",
      label: t("common.games", "Jeux"),
      value: s.ROMS.toLocaleString(),
    },
    {
      icon: "mdi-controller",
      label: t("common.platforms", "Plateformes"),
      value: s.PLATFORMS.toLocaleString(),
    },
    {
      icon: "mdi-heart",
      label: t("home.widget-library-favorites", "Favoris"),
      value: favoritesCount.value.toLocaleString(),
    },
    {
      icon: "mdi-content-save",
      label: t("common.saves", "Sauvegardes"),
      value: s.SAVES.toLocaleString(),
    },
    {
      icon: "mdi-file",
      label: t("common.states", "États"),
      value: s.STATES.toLocaleString(),
    },
    {
      icon: "mdi-image-area",
      label: t("home.widget-library-screenshots", "Captures"),
      value: s.SCREENSHOTS.toLocaleString(),
    },
    {
      icon: "mdi-harddisk",
      label: t("common.size-on-disk", "Taille"),
      value: formatBytes(s.TOTAL_FILESIZE_BYTES, 1),
    },
  ];
});

onMounted(async () => {
  try {
    const { data } = await api.get<Stats>("/stats");
    stats.value = data;
  } catch {
    stats.value = null;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <WidgetCard
    title="STATISTIQUES DE LA BIBLIOTHÈQUE"
    :loading="loading"
    width="295px"
  >
    <div class="r-v2-widget-lib__stats">
      <div v-for="row in allRows" :key="row.label" class="r-v2-widget-lib__row">
        <span class="r-v2-widget-lib__label">
          <RIcon :icon="row.icon" size="14" class="r-v2-widget-lib__icon" />
          {{ row.label }}
        </span>
        <span class="r-v2-widget-lib__val">{{ row.value }}</span>
      </div>
    </div>
  </WidgetCard>
</template>

<style scoped>
.r-v2-widget-lib__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(110px, 1fr));
  gap: 6px 10px;
  width: 100%;
  padding: 4px 0;
  flex: 1;
}

.r-v2-widget-lib__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 11.5px;
}

.r-v2-widget-lib__label {
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

.r-v2-widget-lib__icon {
  color: #a78bfa !important;
}

.r-v2-widget-lib__val {
  font-size: 12.5px;
  font-weight: 700;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
