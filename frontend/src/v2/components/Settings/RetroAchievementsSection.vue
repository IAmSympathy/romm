<script setup lang="ts">
// RetroAchievementsSection — links a RomM account to a RetroAchievements
// profile. Supports Username + Password or Token according to RAOfflineProxy rules,
// testing the connection, and saving credentials securely to the user profile.
import { RBtn, RTag, RTextField } from "@v2/lib";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import userApi from "@/services/api/user";
import storeAuth from "@/stores/auth";
import SettingsSection from "@/v2/components/Settings/SettingsSection.vue";
import { useSnackbar } from "@/v2/composables/useSnackbar";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
const auth = storeAuth();
const snackbar = useSnackbar();

const username = ref(auth.user?.ra_username ?? "");
const passwordOrToken = ref("");
const testing = ref(false);
const submitting = ref(false);
const testSuccessToken = ref<string | null>(auth.user?.ra_token ?? null);

watch(
  () => auth.user?.ra_username,
  (next) => {
    username.value = next ?? "";
  },
);

watch(
  () => auth.user?.ra_token,
  (next) => {
    testSuccessToken.value = next ?? null;
  },
);

const linkedUsername = computed(() => auth.user?.ra_username ?? "");
const hasToken = computed(() => Boolean(auth.user?.ra_token));
const isLinked = computed(() => linkedUsername.value.length > 0 && hasToken.value);

async function testConnection() {
  if (!auth.user) return false;
  const u = username.value.trim();
  const pt = passwordOrToken.value.trim();

  if (!u) {
    snackbar.error("Username is required");
    return false;
  }

  testing.value = true;
  try {
    const res = await userApi.testRetroAchievements({
      id: auth.user.id,
      ra_username: u,
      ra_password: pt || undefined,
      ra_token: pt ? undefined : auth.user.ra_token || undefined,
    });

    if (res.data?.success && res.data.token) {
      testSuccessToken.value = res.data.token;
      snackbar.success(
        `RetroAchievements connection successful! (@${res.data.username || u}, Score: ${res.data.score ?? 0})`,
        { icon: "mdi-check-bold" },
      );
      return true;
    } else {
      snackbar.error(res.data?.error || "RetroAchievements login failed", {
        icon: "mdi-close-circle",
      });
      return false;
    }
  } catch (err: unknown) {
    snackbar.error("Failed to test RetroAchievements connection", {
      icon: "mdi-close-circle",
    });
    return false;
  } finally {
    testing.value = false;
  }
}

async function saveCredentials() {
  if (!auth.user) return;
  const u = username.value.trim();

  submitting.value = true;
  try {
    let tokenToSave = testSuccessToken.value;

    // If password/token was entered, test & fetch token first if needed
    if (passwordOrToken.value.trim()) {
      const ok = await testConnection();
      if (!ok) return;
      tokenToSave = testSuccessToken.value;
    }

    const updatedUser = await userApi.updateUser({
      id: auth.user.id,
      ra_username: u,
      ra_token: tokenToSave || "",
    });

    if (updatedUser.data) {
      auth.user = updatedUser.data;
    }

    passwordOrToken.value = "";
    snackbar.success("RetroAchievements credentials saved successfully!", {
      icon: "mdi-check-bold",
    });
  } catch (err) {
    snackbar.error("Failed to save RetroAchievements credentials", {
      icon: "mdi-close-circle",
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <SettingsSection :title="t('settings.retroachievements')" icon="mdi-trophy">
    <template #header-actions>
      <RTag
        :icon="isLinked ? 'mdi-link-variant' : 'mdi-link-variant-off'"
        :tone="isLinked ? 'success' : 'neutral'"
        size="small"
      >
        {{
          isLinked
            ? t("settings.ra-connected", { username: `@${linkedUsername}` })
            : t("settings.ra-not-linked")
        }}
      </RTag>
    </template>
    <div class="r-v2-ra__fields">
      <RTextField
        v-model="username"
        prefix-label="stacked"
        hide-details
        class="r-v2-ra__field"
      >
        <template #prefix-label>RetroAchievements Username</template>
      </RTextField>

      <RTextField
        v-model="passwordOrToken"
        type="password"
        prefix-label="stacked"
        hide-details
        class="r-v2-ra__field"
        placeholder="Enter password or Web API key token"
      >
        <template #prefix-label>Password or Web API Key</template>
      </RTextField>
    </div>
    <div class="r-v2-ra__actions">
      <RBtn
        variant="tonal"
        color="neutral"
        :loading="testing"
        :disabled="!username.trim() || submitting"
        prepend-icon="mdi-connection"
        @click="testConnection"
      >
        Test Connection
      </RBtn>

      <RBtn
        variant="flat"
        color="primary"
        :loading="submitting"
        :disabled="!username.trim() || testing"
        prepend-icon="mdi-content-save"
        @click="saveCredentials"
      >
        {{ t("common.save") }}
      </RBtn>
    </div>
  </SettingsSection>
</template>

<style scoped>
.r-v2-ra__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
}

.r-v2-ra__actions {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid var(--r-color-border);
}
</style>
