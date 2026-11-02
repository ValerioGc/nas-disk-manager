<script setup lang="ts">

import { computed, ref } from 'vue';
import { vNasModal as vModal } from '@valeriogc/nas-base-app';
import { MIN_PASSWORD } from '@/composables/useDiskEncryption';
import { useDiskManager } from '@/composables/diskManagerContext';
import { initializeNasDisk, notifyNasShell } from '@/services/nasShell';
import type { Disk, EraseMode } from '@/types';
import { wholeDiskOf } from '@/utils/disks';

const props = defineProps<{ disk: Disk; mode: EraseMode }>();
const emit = defineEmits<{ close: [] }>();
const submitting = defineModel<boolean>('submitting', { default: false });
const { t, disks, refresh, available, secure, crypt, cryptError, systemExposed } = useDiskManager();

const target = computed(() =>
  props.mode === 'format' ? wholeDiskOf(props.disk, disks.value) : props.disk.id,
);
const label = ref(`Data-${target.value.replace(/[^a-z0-9]+/gi, '-')}`.slice(0, 16));
const confirmation = ref('');
const encrypt = ref(false);
const automatic = ref(true);
const password = ref('');
const repeat = ref('');
const operationError = ref('');
const formatting = computed(() => props.mode === 'format');

/** An encrypted volume opens with the typed password, the automatic key, or both. */
const keysReady = computed(() => {
  if (!encrypt.value) {
    return true;
  }
  return password.value
    ? password.value.length >= MIN_PASSWORD && password.value === repeat.value
    : automatic.value;
});
const ready = computed(
  () =>
    !submitting.value &&
    confirmation.value === target.value &&
    Boolean(label.value.trim()) &&
    keysReady.value,
);

function close() {
  if (!submitting.value) {
    emit('close');
  }
}

/** A format or an encrypted volume goes through the encryption of the launcher. */
async function erase() {
  const identity = props.disk.identity;
  if (!identity || !ready.value) {
    return;
  }
  submitting.value = true;
  operationError.value = '';
  const plain = !formatting.value && !encrypt.value;
  const result = plain
    ? await initializeNasDisk(target.value, label.value.trim(), identity)
    : await crypt({
        op: 'format',
        device: target.value,
        identity,
        label: label.value.trim(),
        encrypt: encrypt.value,
        automatic: encrypt.value && automatic.value,
        password: encrypt.value && password.value ? password.value : undefined,
      });
  submitting.value = false;
  if (!result?.success) {
    operationError.value = result?.error || cryptError.value || t.value.initializeFailed;
    return;
  }
  if (plain) {
    await refresh();
  }
  emit('close');
  notifyNasShell(t.value.initializeStarted, t.value.initializeStartedMessage, 'success');
}

</script>

<template>
  <dialog
    v-modal
    class="modal_backdrop confirmation_backdrop"
    :aria-label="formatting ? t.formatTitle : t.initializeTitle"
    @click.self="close"
    @cancel.prevent="close"
  >
    <section class="modal confirmation_modal surface_card">
      <h2>{{ formatting ? t.formatTitle : t.initializeTitle }}</h2>
      <p class="warning">{{ formatting ? t.formatWarning : t.initializeWarning }}</p>
      <p>
        <strong>{{ t.initializeDevice }}:</strong> /dev/{{ target }}
      </p>
      <label
        ><span>{{ t.volumeLabel }}</span
        ><input
          v-model="label"
          name="label"
          maxlength="16"
          autocomplete="off"
          :disabled="submitting"
      /></label>
      <template v-if="available">
        <label class="check"
          ><input
            v-model="encrypt"
            name="encrypt"
            type="checkbox"
            :disabled="submitting"
            data-testid="encrypt"
          />{{ t.encryptVolume }}</label
        >
        <template v-if="encrypt">
          <label class="check"
            ><input v-model="automatic" name="automatic" type="checkbox" :disabled="submitting" />{{
              t.automaticUnlock
            }}</label
          >
          <p v-if="automatic && systemExposed" class="hint" data-testid="automatic_exposed">
            {{ t.automaticExposed }}
          </p>
          <p v-if="!secure" class="hint">{{ t.encryptionNeedsHttps }}</p>
          <label
            ><span>{{ automatic ? t.setPasswordOptional : t.setPassword }}</span
            ><input
              v-model="password"
              name="erase_password"
              type="password"
              autocomplete="new-password"
              :disabled="submitting || !secure"
              data-testid="erase_password"
          /></label>
          <label v-if="password"
            ><span>{{ t.repeatPassword }}</span
            ><input
              v-model="repeat"
              name="erase_repeat"
              type="password"
              autocomplete="new-password"
              :disabled="submitting"
              data-testid="erase_repeat"
          /></label>
        </template>
      </template>
      <label
        ><span
          >{{ t.confirmDevice }}: <strong>{{ target }}</strong></span
        ><input
          v-model="confirmation"
          name="confirmation"
          autocomplete="off"
          :disabled="submitting"
      /></label>
      <p v-if="operationError" class="operation_error" role="alert">{{ operationError }}</p>
      <div class="modal_actions">
        <button type="button" class="secondary_button" :disabled="submitting" @click="close">
          {{ t.cancel }}
        </button>
        <button type="button" class="danger_button" :disabled="!ready" @click="erase">
          {{ submitting ? t.initializing : t.initializeConfirm }}
        </button>
      </div>
    </section>
  </dialog>
</template>

<style scoped lang="scss">

.confirmation_modal {
  width: min(520px, 100%);
  padding: 24px;

  h2 {
    margin: 0 0 16px;
  }
}

.modal_actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

</style>
