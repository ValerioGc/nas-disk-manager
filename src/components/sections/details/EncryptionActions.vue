<script setup lang="ts">

import { computed, ref, watch } from 'vue';
import { useDiskManager } from '@/composables/diskManagerContext';
import { MIN_PASSWORD } from '@/composables/useDiskEncryption';
import { notifyNasShell } from '@/services/nasShell';
import type { Disk, DiskKeys } from '@/types';
import { saveFile } from '@/utils/saveFile';

const props = defineProps<{ disk: Disk }>();
const { t, working, cryptError, secure, crypt, systemExposed } = useDiskManager();
const unlockPassword = ref('');
const passwordCurrent = ref('');
const newPassword = ref('');
const repeated = ref('');
const automaticCurrent = ref('');
const recoveryCurrent = ref('');
const recoveryKey = ref('');
const uuid = computed(() => props.disk.uuid ?? '');
const locked = computed(() => props.disk.encryption === 'locked');
const keys = computed<DiskKeys>(
  () => props.disk.keys ?? { password: true, automatic: false, recovery: false, held: false },
);

/**
 * A key the person knows is asked before any key changes. Only a volume that opens with the
 * automatic key alone changes its keys with that one, since there is nothing else to ask.
 */
const needsCurrent = computed(
  () => keys.value.password || keys.value.recovery || !keys.value.automatic,
);
const known = (value: string) => value.length >= MIN_PASSWORD;
const keyOf = (value: string) => (needsCurrent.value ? value : undefined);

const passwordReady = computed(
  () =>
    secure &&
    (!needsCurrent.value || known(passwordCurrent.value)) &&
    known(newPassword.value) &&
    newPassword.value === repeated.value,
);
const automaticReady = computed(() => secure && known(automaticCurrent.value));
/** The automatic key goes only while another key still opens the volume. */
const automaticRemovable = computed(() => keys.value.password || keys.value.recovery);
const recoveryReady = computed(
  () => secure && (!needsCurrent.value || known(recoveryCurrent.value)),
);

const fields = [
  unlockPassword,
  passwordCurrent,
  newPassword,
  repeated,
  automaticCurrent,
  recoveryCurrent,
  recoveryKey,
];

watch(uuid, () => {
  for (const field of fields) {
    field.value = '';
  }
});

async function unlock() {
  if (!known(unlockPassword.value)) {
    return;
  }
  if (await crypt({ op: 'unlock', uuid: uuid.value, password: unlockPassword.value })) {
    unlockPassword.value = '';
    notifyNasShell(t.value.unlocked, t.value.unlockedMessage, 'success');
  }
}

async function unlockAutomatic() {
  if (await crypt({ op: 'unlock', uuid: uuid.value })) {
    notifyNasShell(t.value.unlocked, t.value.unlockedMessage, 'success');
  }
}

async function lock() {
  if (await crypt({ op: 'lock', uuid: uuid.value })) {
    notifyNasShell(t.value.locked, t.value.lockedMessage, 'success');
  }
}

async function enableAutomatic() {
  if (!automaticReady.value) {
    return;
  }
  const done = await crypt({
    op: 'automatic',
    uuid: uuid.value,
    enabled: true,
    password: automaticCurrent.value,
  });
  if (done) {
    automaticCurrent.value = '';
    notifyNasShell(t.value.automaticOnSaved, t.value.automaticOnMessage, 'success');
  }
}

async function disableAutomatic() {
  if (!automaticRemovable.value) {
    return;
  }
  if (await crypt({ op: 'automatic', uuid: uuid.value, enabled: false })) {
    notifyNasShell(t.value.automaticOffSaved, t.value.automaticOffMessage, 'success');
  }
}

async function savePassword() {
  if (!passwordReady.value) {
    return;
  }
  const done = await crypt({
    op: 'password',
    uuid: uuid.value,
    current: keyOf(passwordCurrent.value),
    password: newPassword.value,
  });
  if (done) {
    passwordCurrent.value = '';
    newPassword.value = '';
    repeated.value = '';
    notifyNasShell(t.value.passwordSaved, '', 'success');
  }
}

async function makeRecovery() {
  if (!recoveryReady.value) {
    return;
  }
  const result = await crypt({
    op: 'recovery',
    uuid: uuid.value,
    current: keyOf(recoveryCurrent.value),
  });
  const data = result?.data as { recovery?: unknown } | undefined;
  if (typeof data?.recovery === 'string') {
    recoveryCurrent.value = '';
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
    <dl class="key_list" :aria-label="t.encryptionKeys">
      <div class="key_item" :class="{ key_item_on: keys.password }">
        <dt>{{ t.keyPassword }}</dt>
        <dd data-testid="key_password">{{ keys.password ? t.keySet : t.keyNotSet }}</dd>
      </div>
      <div class="key_item" :class="{ key_item_on: keys.recovery }">
        <dt>{{ t.keyRecovery }}</dt>
        <dd data-testid="key_recovery">{{ keys.recovery ? t.keySet : t.keyNotSet }}</dd>
      </div>
      <div class="key_item" :class="{ key_item_on: keys.automatic }">
        <dt>{{ t.keyAutomatic }}</dt>
        <dd data-testid="key_automatic">{{ keys.automatic ? t.keyOn : t.keyOff }}</dd>
      </div>
    </dl>
    <p v-if="!keys.password && !keys.recovery" class="warning" data-testid="no_spare_key">
      {{ t.noSpareKey }}
    </p>
    <p v-if="!secure" class="hint" data-testid="needs_https">{{ t.encryptionNeedsHttps }}</p>

    <template v-if="locked">
      <form class="key_form" @submit.prevent="unlock">
        <label
          ><span>{{ t.unlockPassword }}</span
          ><input
            v-model="unlockPassword"
            name="unlock_password"
            type="password"
            autocomplete="off"
            :disabled="!secure || working"
            data-testid="unlock_password"
        /></label>
        <button
          type="submit"
          class="secondary_button"
          :disabled="!secure || working || !known(unlockPassword)"
        >
          {{ t.unlock }}
        </button>
      </form>
      <template v-if="keys.automatic">
        <p class="hint">{{ t.unlockAutomaticDescription }}</p>
        <button
          type="button"
          class="secondary_button"
          :disabled="working"
          data-testid="unlock_automatic"
          @click="unlockAutomatic"
        >
          {{ t.unlockAutomatic }}
        </button>
      </template>
    </template>

    <template v-else>
      <h4>{{ t.lockTitle }}</h4>
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

      <h4>{{ keys.password ? t.changePassword : t.definePassword }}</h4>
      <p class="hint">
        {{ keys.password ? t.changePasswordDescription : t.definePasswordDescription }}
      </p>
      <form class="key_form" data-testid="password_form" @submit.prevent="savePassword">
        <label v-if="needsCurrent"
          ><span>{{ keys.password ? t.currentPassword : t.currentKey }}</span
          ><input
            v-model="passwordCurrent"
            name="password_current"
            type="password"
            autocomplete="current-password"
            :disabled="!secure || working"
            data-testid="password_current"
        /></label>
        <label
          ><span>{{ t.newPassword }}</span
          ><input
            v-model="newPassword"
            name="new_password"
            type="password"
            autocomplete="new-password"
            :disabled="!secure || working"
            data-testid="new_password"
        /></label>
        <label
          ><span>{{ t.repeatPassword }}</span
          ><input
            v-model="repeated"
            name="repeated"
            type="password"
            autocomplete="new-password"
            :disabled="!secure || working"
            data-testid="repeat_password"
        /></label>
        <p v-if="repeated && newPassword !== repeated" class="hint" data-testid="passwords_differ">
          {{ t.passwordsDiffer }}
        </p>
        <button
          type="submit"
          class="secondary_button"
          :disabled="!passwordReady || working"
          data-testid="save_password"
        >
          {{ keys.password ? t.changePassword : t.definePassword }}
        </button>
      </form>

      <h4>{{ t.automaticUnlock }}</h4>
      <p class="hint">
        {{ keys.automatic ? t.automaticUnlockOn : t.automaticUnlockOff }}
      </p>
      <p v-if="keys.automatic && systemExposed" class="hint" data-testid="automatic_exposed">
        {{ t.automaticExposed }}
      </p>
      <template v-if="keys.automatic">
        <p v-if="!automaticRemovable" class="hint" data-testid="automatic_needs_key">
          {{ t.automaticNeedsKey }}
        </p>
        <button
          type="button"
          class="secondary_button"
          :disabled="working || !automaticRemovable"
          data-testid="automatic_off"
          @click="disableAutomatic"
        >
          {{ t.automaticOff }}
        </button>
      </template>
      <form v-else class="key_form" @submit.prevent="enableAutomatic">
        <label
          ><span>{{ t.currentKey }}</span
          ><input
            v-model="automaticCurrent"
            name="automatic_current"
            type="password"
            autocomplete="off"
            :disabled="!secure || working"
            data-testid="automatic_current"
        /></label>
        <button
          type="submit"
          class="secondary_button"
          :disabled="!automaticReady || working"
          data-testid="automatic_on"
        >
          {{ t.automaticOn }}
        </button>
      </form>

      <h4>{{ t.recoveryKey }}</h4>
      <p class="hint">{{ t.recoveryDescription }}</p>
      <form class="key_form" @submit.prevent="makeRecovery">
        <label v-if="needsCurrent"
          ><span>{{ t.currentKey }}</span
          ><input
            v-model="recoveryCurrent"
            name="recovery_current"
            type="password"
            autocomplete="off"
            :disabled="!secure || working"
            data-testid="recovery_current"
        /></label>
        <button
          type="submit"
          class="secondary_button"
          :disabled="!recoveryReady || working"
          data-testid="make_recovery"
        >
          {{ keys.recovery ? t.replaceRecovery : t.makeRecovery }}
        </button>
      </form>
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: 8px;
  margin: 0 0 14px;
}

.key_item {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--table-border);
  border-radius: 8px;

  dt {
    color: $text_soft;
    font-size: 12px;
    font-weight: 650;
  }

  dd {
    margin: 0;
    font-weight: 650;
  }
}

.key_item_on dd {
  color: var(--accent);
}

.key_form {
  display: grid;
  gap: 10px;
  justify-items: start;

  label {
    width: 100%;
  }
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
