<script setup lang="ts">

import { computed, ref, watch } from 'vue';
import { NasSwitch } from '@valeriogc/nas-base-app';
import { useDiskManager } from '@/composables/diskManagerContext';
import { saveFile } from '@/composables/useDiskEncryption';
import { notifyNasShell } from '@/services/nasShell';
import type { Disk, DiskKeys } from '@/types';

interface Props {
  disk: Disk;
}

const MIN_PASSWORD = 8;
const props = defineProps<Props>();
const { t, working, cryptError, secure, crypt } = useDiskManager();
const unlockPassword = ref('');
const current = ref('');
const newPassword = ref('');
const repeated = ref('');
const recoveryKey = ref('');
const uuid = computed(() => props.disk.uuid ?? '');
const locked = computed(() => props.disk.encryption === 'locked');
const keys = computed<DiskKeys>(
  () => props.disk.keys ?? { password: true, automatic: false, recovery: false, held: false },
);
/** The key typed for a change, none when the automatic key opens the volume by itself. */
const currentKey = computed(() => current.value || undefined);
const canChange = computed(
  () => secure && (keys.value.automatic || current.value.length >= MIN_PASSWORD),
);
const passwordReady = computed(
  () =>
    canChange.value &&
    newPassword.value.length >= MIN_PASSWORD &&
    newPassword.value === repeated.value,
);

watch(uuid, () => {
  for (const field of [unlockPassword, current, newPassword, repeated, recoveryKey]) {
    field.value = '';
  }
});

async function unlock() {
  if (unlockPassword.value.length < MIN_PASSWORD) {
    return;
  }
  if (await crypt({ op: 'unlock', uuid: uuid.value, password: unlockPassword.value })) {
    unlockPassword.value = '';
    notifyNasShell(t.value.unlocked, t.value.unlockedMessage, 'success');
  }
}

async function lock() {
  if (await crypt({ op: 'lock', uuid: uuid.value })) {
    notifyNasShell(t.value.locked, t.value.lockedMessage, 'success');
  }
}

async function setAutomatic(enabled: boolean) {
  await crypt({ op: 'automatic', uuid: uuid.value, enabled, password: currentKey.value });
}

async function savePassword() {
  if (!passwordReady.value) {
    return;
  }
  const done = await crypt({
    op: 'password',
    uuid: uuid.value,
    current: currentKey.value,
    password: newPassword.value,
  });
  if (done) {
    newPassword.value = '';
    repeated.value = '';
    notifyNasShell(t.value.passwordSaved, '', 'success');
  }
}

async function makeRecovery() {
  const result = await crypt({ op: 'recovery', uuid: uuid.value, current: currentKey.value });
  const data = result?.data as { recovery?: unknown } | undefined;
  if (typeof data?.recovery === 'string') {
    recoveryKey.value = data.recovery;
  }
}

function saveRecovery() {
  const text = `${t.value.recoveryFileIntro.replace('{name}', props.disk.name)}\n\n${recoveryKey.value}\n`;
  saveFile(`recovery-${uuid.value}.txt`, text, 'text/plain');
}

async function saveHeader() {
  const result = await crypt({ op: 'header', uuid: uuid.value });
  const data = result?.data as { header?: unknown } | undefined;
  if (typeof data?.header === 'string') {
    const bytes = Uint8Array.from(atob(data.header), (character) => character.codePointAt(0)!);
    saveFile(`header-${uuid.value}.img`, bytes, 'application/octet-stream');
  }
}

</script>

<template>
  <div class="action_section" data-testid="encryption_section">
    <h3>{{ t.encryption }}</h3>
    <p>{{ locked ? t.encryptionLocked : t.encryptionOpen }}</p>
    <ul class="key_list">
      <li>{{ t.keyPassword }}: {{ keys.password ? t.yes : t.no }}</li>
      <li>{{ t.keyAutomatic }}: {{ keys.automatic ? t.yes : t.no }}</li>
      <li>{{ t.keyRecovery }}: {{ keys.recovery ? t.yes : t.no }}</li>
    </ul>
    <p v-if="!keys.password && !keys.recovery" class="warning" data-testid="no_spare_key">
      {{ t.noSpareKey }}
    </p>
    <p v-if="!secure" class="hint" data-testid="needs_https">{{ t.encryptionNeedsHttps }}</p>

    <form v-if="locked" @submit.prevent="unlock">
      <label
        ><span>{{ t.unlockPassword }}</span
        ><input
          v-model="unlockPassword"
          type="password"
          autocomplete="off"
          :disabled="!secure || working"
          data-testid="unlock_password"
      /></label>
      <button
        type="submit"
        class="secondary_button"
        :disabled="!secure || working || unlockPassword.length < MIN_PASSWORD"
      >
        {{ t.unlock }}
      </button>
    </form>

    <template v-else>
      <p class="hint">{{ t.lockDescription }}</p>
      <button
        type="button"
        class="secondary_button"
        :disabled="working"
        data-testid="lock_volume"
        @click="lock"
      >
        {{ t.lock }}
      </button>

      <label
        ><span>{{ keys.automatic ? t.currentKeyOptional : t.currentKey }}</span
        ><input
          v-model="current"
          type="password"
          autocomplete="off"
          :disabled="!secure || working"
          data-testid="current_key"
      /></label>

      <NasSwitch
        :model-value="keys.automatic"
        :label="t.automaticUnlock"
        :disabled="working || (!keys.automatic && !canChange)"
        testid="automatic_unlock"
        @update:model-value="setAutomatic"
      />
      <p class="hint">{{ t.automaticUnlockDescription }}</p>

      <form @submit.prevent="savePassword">
        <label
          ><span>{{ keys.password ? t.newPassword : t.setPassword }}</span
          ><input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            :disabled="!canChange || working"
            data-testid="new_password"
        /></label>
        <label
          ><span>{{ t.repeatPassword }}</span
          ><input
            v-model="repeated"
            type="password"
            autocomplete="new-password"
            :disabled="!canChange || working"
            data-testid="repeat_password"
        /></label>
        <button type="submit" class="secondary_button" :disabled="!passwordReady || working">
          {{ t.savePassword }}
        </button>
      </form>

      <h4>{{ t.recoveryKey }}</h4>
      <p class="hint">{{ t.recoveryDescription }}</p>
      <button
        type="button"
        class="secondary_button"
        :disabled="!canChange || working"
        data-testid="make_recovery"
        @click="makeRecovery"
      >
        {{ keys.recovery ? t.replaceRecovery : t.makeRecovery }}
      </button>
      <div v-if="recoveryKey" class="recovery_key" data-testid="recovery_key">
        <p class="warning">{{ t.recoveryShownOnce }}</p>
        <output>{{ recoveryKey }}</output>
        <button type="button" class="secondary_button" @click="saveRecovery">
          {{ t.saveRecovery }}
        </button>
      </div>

      <h4>{{ t.headerBackup }}</h4>
      <p class="hint">{{ t.headerDescription }}</p>
      <button
        type="button"
        class="secondary_button"
        :disabled="!secure || working"
        data-testid="save_header"
        @click="saveHeader"
      >
        {{ t.saveHeader }}
      </button>
    </template>

    <p v-if="cryptError" class="operation_error" role="alert">{{ cryptError }}</p>
  </div>
</template>

<style scoped lang="scss">

.key_list {
  margin: 0 0 12px;
  padding-left: 18px;
  font-size: 13px;
}

h4 {
  margin: 24px 0 6px;
}

.recovery_key output {
  display: block;
  margin: 8px 0 12px;
  font-family: monospace;
  font-size: 14px;
  overflow-wrap: anywhere;
}

</style>
