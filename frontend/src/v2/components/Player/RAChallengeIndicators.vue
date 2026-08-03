<script setup lang="ts">
import { ref } from "vue";

export interface MonitoredChallengeItem {
  id: number;
  title: string;
  description?: string;
  points: number;
  badgeUrl?: string;
  currentValue: number;
  targetValue: number;
  isPercent: boolean;
  formattedProgress: string;
}

defineProps<{
  challenges: MonitoredChallengeItem[];
}>();

const hoveredId = ref<number | null>(null);

function onImgError(e: Event) {
  const target = e.target as HTMLImageElement;
  target.onerror = null;
  target.src = "/assets/scrappers/ra.png";
}
</script>

<template>
  <div class="r-ra-challenges-container" aria-label="Active Challenge Indicators">
    <TransitionGroup name="r-ra-challenge-slide">
      <div
        v-for="item in challenges"
        :key="item.id"
        class="r-ra-challenge-card"
        @mouseenter="hoveredId = item.id"
        @mouseleave="hoveredId = null"
      >
        <div class="r-ra-challenge-badge-wrap">
          <img
            v-if="item.badgeUrl"
            :src="item.badgeUrl"
            class="r-ra-challenge-badge"
            alt=""
            @error="onImgError"
          />
          <v-icon v-else color="#EAB308" size="24">mdi-trophy-award</v-icon>
        </div>

        <div class="r-ra-challenge-info">
          <div class="r-ra-challenge-title">{{ item.title }}</div>
          <div class="r-ra-challenge-progress">
            {{ item.formattedProgress }}
          </div>
        </div>

        <!-- Expanded Hover Tooltip Card -->
        <Transition name="r-ra-tooltip-fade">
          <div v-if="hoveredId === item.id" class="r-ra-challenge-tooltip">
            <div class="r-ra-tooltip-header">
              <span class="r-ra-tooltip-title">{{ item.title }}</span>
              <span v-if="item.points > 0" class="r-ra-tooltip-points">
                +{{ item.points }} pts
              </span>
            </div>
            <p v-if="item.description" class="r-ra-tooltip-desc">
              {{ item.description }}
            </p>
            <div class="r-ra-tooltip-bar-wrap">
              <div
                class="r-ra-tooltip-bar-fill"
                :style="{
                  width: `${Math.min(100, Math.max(0, (item.currentValue / item.targetValue) * 100))}%`
                }"
              ></div>
            </div>
            <div class="r-ra-tooltip-footer">
              <span>Goal: {{ item.targetValue }}</span>
              <span>{{ item.formattedProgress }}</span>
            </div>
          </div>
        </Transition>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.r-ra-challenges-container {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
  max-width: 320px;
}

.r-ra-challenge-card {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(18, 18, 24, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(234, 179, 8, 0.4);
  border-radius: 10px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.5),
    0 0 12px rgba(234, 179, 8, 0.15);
  color: #ffffff;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.r-ra-challenge-card:hover {
  border-color: rgba(234, 179, 8, 0.8);
  transform: translateY(-2px);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.6),
    0 0 20px rgba(234, 179, 8, 0.3);
}

.r-ra-challenge-badge-wrap {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.r-ra-challenge-badge {
  width: 30px;
  height: 30px;
  object-fit: contain;
  border-radius: 4px;
}

.r-ra-challenge-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.r-ra-challenge-title {
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.r-ra-challenge-progress {
  font-size: 11px;
  font-weight: 800;
  color: #fef08a;
}

/* Hover Tooltip */
.r-ra-challenge-tooltip {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 10px;
  width: 280px;
  padding: 12px;
  background: rgba(15, 15, 20, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(234, 179, 8, 0.5);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
  pointer-events: none;
  z-index: 10000;
}

.r-ra-tooltip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.r-ra-tooltip-title {
  font-size: 13px;
  font-weight: 800;
  color: #fef08a;
}

.r-ra-tooltip-points {
  font-size: 10px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 9999px;
  background: rgba(234, 179, 8, 0.25);
  color: #fef08a;
  border: 1px solid rgba(234, 179, 8, 0.4);
}

.r-ra-tooltip-desc {
  font-size: 11px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 10px;
}

.r-ra-tooltip-bar-wrap {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.r-ra-tooltip-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #eab308, #facc15);
  border-radius: 3px;
  transition: width 0.2s ease;
}

.r-ra-tooltip-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
}

/* Animations */
.r-ra-challenge-slide-enter-active,
.r-ra-challenge-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.r-ra-challenge-slide-enter-from {
  opacity: 0;
  transform: translateX(24px) scale(0.95);
}

.r-ra-challenge-slide-leave-to {
  opacity: 0;
  transform: translateX(16px) scale(0.92);
}

.r-ra-tooltip-fade-enter-active,
.r-ra-tooltip-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.r-ra-tooltip-fade-enter-from,
.r-ra-tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
