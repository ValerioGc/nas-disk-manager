<script setup lang="ts">

import { computed, ref, watch } from 'vue';
import { NasIcon, NasLoading, NasSwitch, vNasModal as vModal } from '@valeriogc/nas-base-app';
import { useDiskManager } from '@/composables/diskManagerContext';
import { wholeDiskOf } from '@/composables/useDiskEncryption';
import { formatDiskSize } from '@/utils/formatDiskSize';
import EncryptionActions from '@/components/sections/EncryptionActions.vue';
import type { DiskKind } from '@/types';
import closeIcon from '@/assets/icons/close.svg?url';
import detailsIcon from '@/assets/icons/details.svg?url';
import cloudIcon from '@/assets/icons/cloud.svg?url';
import externalIcon from '@/assets/icons/external.svg?url';
import localIcon from '@/assets/icons/local.svg?url';
import networkIcon from '@/assets/icons/network.svg?url';
import {
  initializeNasDisk,
  notifyNasShell,
  readNasDiskSmart,
  renameNasDisk,
} from '@/services/nasShell';

type DetailTab = 'info' | 'smart' | 'actions';
const KIND_ICONS: Record<DiskKind, string> = {
  local: localIcon,
  external: externalIcon,
  network: networkIcon,
  cloud: cloudIcon,
};
/** How the connections reported by lsblk are written. */
const TRANSPORTS: Record<string, string> = { nvme: 'NVMe', sata: 'SATA', usb: 'USB' };
/** Erasing an empty disk, or a data disk with volumes on it. */
type EraseMode = 'initialize' | 'format';
const MIN_PASSWORD = 8;
const {
  t,
  locale,
  disks,
  selected,
  refresh,
  ejecting,
  isLocked,
  setLock,
  eject,
  available,
  secure,
  crypt,
  cryptError,
} = useDiskManager();
const disk = computed(() => disks.value.find((item) => item.id === selected.value));
const activeTab = ref<DetailTab>('info');
const confirming = ref(false);
const eraseMode = ref<EraseMode>('initialize');
const confirmation = ref('');
const label = ref('');
const encrypt = ref(false);
const automatic = ref(true);
const erasePassword = ref('');
const eraseRepeat = ref('');
const submitting = ref(false);
const renaming = ref(false);
const renameLabel = ref('');
const operationError = ref('');
const renameError = ref('');
const smartLoading = ref(false);
const smartError = ref('');
const smartData = ref<Record<string, unknown> | null>(null);
const mountState = computed(() => {
  if (disk.value?.encryption === 'locked') {
    return t.value.lockedStatus;
  }
  return disk.value?.mount ? t.value.active : t.value.unmounted;
});
const transport = computed(() => {
  const name = disk.value?.transport;
  return name ? (TRANSPORTS[name.toLowerCase()] ?? name.toUpperCase()) : '-';
});
const canRename = computed(
  () =>
    Boolean(disk.value?.device) &&
    !disk.value?.read_only &&
    ['ext2', 'ext3', 'ext4'].includes(disk.value?.filesystem ?? ''),
);
const busy = computed(() => submitting.value || renaming.value || ejecting.value !== null);
/** The whole disk a format erases: the disk of the volume shown. */
const eraseTarget = computed(() =>
  disk.value && eraseMode.value === 'format'
    ? wholeDiskOf(disk.value, disks.value)
    : disk.value?.id,
);
const canFormat = computed(
  () =>
    available.value &&
    disk.value?.kind === 'local' &&
    !disk.value.system_disk &&
    !disk.value.read_only &&
    !disk.value.initializable &&
    Boolean(disk.value.identity),
);
/** An encrypted volume opens with the password typed, the automatic key, or both. */
const keysReady = computed(() => {
  if (!encrypt.value) {
    return true;
  }
  const typed = erasePassword.value.length > 0;
  return typed
    ? erasePassword.value.length >= MIN_PASSWORD && erasePassword.value === eraseRepeat.value
    : automatic.value;
});
const eraseReady = computed(
  () =>
    !submitting.value &&
    confirmation.value === eraseTarget.value &&
    Boolean(label.value.trim()) &&
    keysReady.value,
);
const external = computed(() => disk.value?.kind === 'external');
const locked = computed(() => Boolean(disk.value && isLocked(disk.value)));

async function ejectSelected() {
  const current = disk.value;
  if (current && !locked.value) {
    await eject(current);
  }
}

watch(
  disk,
  (current) => {
    activeTab.value = 'info';
    renameLabel.value = current?.name ?? '';
    renameError.value = '';
    operationError.value = '';
    smartError.value = '';
    smartData.value = null;
  },
  { immediate: true },
);

function closeDetails() {
  if (!busy.value && !confirming.value) {
    selected.value = null;
  }
}
function nested(path: string[]): unknown {
  let value: unknown = smartData.value;
  for (const key of path) {
    if (!value || typeof value !== 'object' || !(key in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
async function selectTab(tab: DetailTab) {
  activeTab.value = tab;
  if (tab !== 'smart' || smartData.value || smartLoading.value) {
    return;
  }
  const current = disk.value;
  if (!current) {
    return;
  }
  smartLoading.value = true;
  smartError.value = '';
  const result = await readNasDiskSmart(current.parent ?? current.id);
  if (result.success && result.data && typeof result.data === 'object') {
    smartData.value = result.data as Record<string, unknown>;
  } else {
    smartError.value = result.error || t.value.smartUnavailable;
  }
  smartLoading.value = false;
}
function openErase(mode: EraseMode) {
  const current = disk.value;
  if (!current || (mode === 'initialize' ? !current.initializable : !canFormat.value)) {
    return;
  }
  eraseMode.value = mode;
  const target = mode === 'format' ? wholeDiskOf(current, disks.value) : current.id;
  label.value = `Data-${target.replace(/[^a-z0-9]+/gi, '-')}`.slice(0, 16);
  confirmation.value = '';
  encrypt.value = false;
  automatic.value = true;
  erasePassword.value = '';
  eraseRepeat.value = '';
  operationError.value = '';
  confirming.value = true;
}
/** A disk erased without encryption the way it always was; a format or an encrypted volume by
 * the encryption of the launcher. */
async function erase() {
  const current = disk.value;
  const target = eraseTarget.value;
  if (!current?.identity || !target || !eraseReady.value) {
    return;
  }
  submitting.value = true;
  operationError.value = '';
  const plain = eraseMode.value === 'initialize' && !encrypt.value;
  const result = plain
    ? await initializeNasDisk(target, label.value.trim(), current.identity)
    : await crypt({
        op: 'format',
        device: target,
        identity: current.identity,
        label: label.value.trim(),
        encrypt: encrypt.value,
        automatic: encrypt.value && automatic.value,
        password: encrypt.value && erasePassword.value ? erasePassword.value : undefined,
      });
  submitting.value = false;
  if (!result?.success) {
    operationError.value = result?.error || cryptError.value || t.value.initializeFailed;
    return;
  }
  if (plain) {
    await refresh();
  }
  confirming.value = false;
  notifyNasShell(t.value.initializeStarted, t.value.initializeStartedMessage, 'success');
}
async function rename() {
  const current = disk.value;
  const nextLabel = renameLabel.value.trim();
  if (!current || !canRename.value || !nextLabel || nextLabel === current.name) {
    return;
  }
  renaming.value = true;
  renameError.value = '';
  const result = await renameNasDisk(current.id, nextLabel);
  if (!result.success) {
    renameError.value = result.error || t.value.renameFailed;
    renaming.value = false;
    return;
  }
  await refresh();
  renaming.value = false;
  notifyNasShell(t.value.renameSucceeded, t.value.renameSucceededMessage, 'success');
}
function closeInitialization() {
  if (!submitting.value) {
    confirming.value = false;
  }
}

</script>

<template>
  <dialog
    v-if="disk"
    v-modal
    class="modal_backdrop details_backdrop"
    :aria-label="t.details"
    @click.self="closeDetails"
    @cancel.prevent="closeDetails"
  >
    <section class="modal detail_card surface_card">
      <div class="card_heading">
        <h2>{{ disk.name }}</h2>
        <button
          type="button"
          class="close"
          :aria-label="t.close"
          :disabled="busy"
          @click="closeDetails"
        >
          <NasIcon :svg="closeIcon" />
        </button>
      </div>
      <div class="tabs" role="tablist">
        <button
          v-for="tab in ['info', 'smart', 'actions'] as DetailTab[]"
          :key="tab"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab"
          :class="{ active: activeTab === tab }"
          @click="selectTab(tab)"
        >
          {{ t.tabs[tab] }}
        </button>
      </div>
      <div v-if="activeTab === 'info'" class="tab_panel" role="tabpanel">
        <div class="info_summary" data-testid="disk_summary">
          <span class="info_icon"><NasIcon :svg="KIND_ICONS[disk.kind]" /></span>
          <div class="info_size">
            <strong>{{ formatDiskSize(disk.size_bytes, locale) }}</strong>
            <span>{{ t.size }}</span>
          </div>
          <ul class="info_badges">
            <li :class="['status', { off: !disk.mount }]">{{ mountState }}</li>
            <li class="info_badge">{{ disk.read_only ? t.readOnlyLabel : t.readWrite }}</li>
            <li v-if="disk.encryption" class="info_badge">{{ t.encryptedType }}</li>
            <li v-if="disk.system_disk" class="info_badge">{{ t.systemDisk }}</li>
          </ul>
        </div>
        <dl class="info_grid">
          <div>
            <dt>{{ t.device }}</dt>
            <dd class="info_path">{{ disk.device || disk.source || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t.mount }}</dt>
            <dd class="info_path">{{ disk.mount || t.unmounted }}</dd>
          </div>
          <div>
            <dt>{{ t.filesystem }}</dt>
            <dd>{{ disk.filesystem || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t.transport }}</dt>
            <dd>{{ transport }}</dd>
          </div>
          <div>
            <dt>{{ t.model }}</dt>
            <dd>{{ disk.model || '-' }}</dd>
          </div>
          <div v-if="disk.uuid">
            <dt>{{ t.uuid }}</dt>
            <dd class="info_path">{{ disk.uuid }}</dd>
          </div>
        </dl>
      </div>
      <div v-else-if="activeTab === 'smart'" class="tab_panel smart_panel" role="tabpanel">
        <NasLoading v-if="smartLoading" :label="t.smartLoading" />
        <div v-else-if="smartError" class="smart_error" role="alert" data-testid="smart_error">
          <NasIcon :svg="detailsIcon" />
          <div>
            <h3>{{ t.smartUnavailableTitle }}</h3>
            <p>{{ smartError }}</p>
          </div>
        </div>
        <template v-else-if="smartData">
          <dl>
            <div v-if="typeof nested(['smart_status', 'passed']) === 'boolean'">
              <dt>{{ t.smartHealth }}</dt>
              <dd>{{ nested(['smart_status', 'passed']) ? t.smartPassed : t.smartFailed }}</dd>
            </div>
            <div v-if="nested(['temperature', 'current']) !== undefined">
              <dt>{{ t.smartTemperature }}</dt>
              <dd>{{ nested(['temperature', 'current']) }} °C</dd>
            </div>
            <div v-if="nested(['power_on_time', 'hours']) !== undefined">
              <dt>{{ t.smartPowerOnHours }}</dt>
              <dd>{{ nested(['power_on_time', 'hours']) }}</dd>
            </div>
            <div v-if="nested(['power_cycle_count']) !== undefined">
              <dt>{{ t.smartPowerCycles }}</dt>
              <dd>{{ nested(['power_cycle_count']) }}</dd>
            </div>
          </dl>
          <details>
            <summary>{{ t.smartRaw }}</summary>
            <pre>{{ JSON.stringify(smartData, null, 2) }}</pre>
          </details>
        </template>
      </div>
      <div v-else class="tab_panel action_panel" role="tabpanel">
        <form v-if="canRename" class="action_section" @submit.prevent="rename">
          <h3>{{ t.rename }}</h3>
          <p>{{ t.renameDescription }}</p>
          <label
            ><span>{{ t.volumeLabel }}</span
            ><input
              v-model="renameLabel"
              name="rename_label"
              maxlength="16"
              autocomplete="off"
              :disabled="renaming"
          /></label>
          <p v-if="renameError" class="operation_error" role="alert">{{ renameError }}</p>
          <button
            type="submit"
            class="secondary_button"
            :disabled="renaming || !renameLabel.trim() || renameLabel.trim() === disk.name"
          >
            {{ renaming ? t.renaming : t.save }}
          </button>
        </form>
        <div v-if="disk.initializable" class="action_section danger_section">
          <h3>{{ t.initialize }}</h3>
          <p class="warning">{{ t.initializeWarning }}</p>
          <button type="button" class="danger_button" @click="openErase('initialize')">
            {{ t.initialize }}
          </button>
        </div>
        <EncryptionActions v-if="available && disk.encryption && disk.uuid" :disk="disk" />
        <div v-if="canFormat" class="action_section danger_section" data-testid="format_section">
          <h3>{{ t.format }}</h3>
          <p class="warning">{{ t.formatWarning }}</p>
          <button type="button" class="danger_button" @click="openErase('format')">
            {{ t.format }}
          </button>
        </div>
        <div v-if="external" class="action_section" data-testid="removal_section">
          <h3>{{ t.removal }}</h3>
          <p>{{ t.removalDescription }}</p>
          <NasSwitch
            v-if="disk.uuid"
            :model-value="locked"
            :label="t.nonRemovable"
            :disabled="busy"
            testid="non_removable"
            @update:model-value="setLock(disk, $event)"
          />
          <p v-if="disk.uuid" class="hint">{{ t.nonRemovableDescription }}</p>
          <p v-else class="hint">{{ t.nonRemovableUnavailable }}</p>
          <!-- Locked by aria-disabled rather than disabled: the tooltip shows on hover. -->
          <button
            type="button"
            class="secondary_button"
            :aria-disabled="locked || busy"
            :title="locked ? t.ejectLocked : t.eject"
            data-testid="eject_selected"
            @click="ejectSelected"
          >
            {{ ejecting === disk.id ? t.ejecting : t.eject }}
          </button>
        </div>
        <p
          v-if="
            !canRename &&
            !disk.initializable &&
            !external &&
            !canFormat &&
            !(available && disk.encryption)
          "
        >
          {{ t.actionsUnavailable }}
        </p>
      </div>
    </section>
  </dialog>

  <dialog
    v-if="confirming && disk"
    v-modal
    class="modal_backdrop confirmation_backdrop"
    :aria-label="eraseMode === 'format' ? t.formatTitle : t.initializeTitle"
    @click.self="closeInitialization"
    @cancel.prevent="closeInitialization"
  >
    <section class="modal confirmation_modal surface_card">
      <h2>{{ eraseMode === 'format' ? t.formatTitle : t.initializeTitle }}</h2>
      <p class="warning">{{ eraseMode === 'format' ? t.formatWarning : t.initializeWarning }}</p>
      <p>
        <strong>{{ t.initializeDevice }}:</strong> /dev/{{ eraseTarget }}
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
          <p v-if="!secure" class="hint">{{ t.encryptionNeedsHttps }}</p>
          <label
            ><span>{{ automatic ? t.setPasswordOptional : t.setPassword }}</span
            ><input
              v-model="erasePassword"
              name="erase_password"
              type="password"
              autocomplete="new-password"
              :disabled="submitting || !secure"
              data-testid="erase_password"
          /></label>
          <label v-if="erasePassword"
            ><span>{{ t.repeatPassword }}</span
            ><input
              v-model="eraseRepeat"
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
          >{{ t.confirmDevice }}: <strong>{{ eraseTarget }}</strong></span
        ><input
          v-model="confirmation"
          name="confirmation"
          autocomplete="off"
          :disabled="submitting"
      /></label>
      <p v-if="operationError" class="operation_error" role="alert">{{ operationError }}</p>
      <div class="modal_actions">
        <button
          type="button"
          class="secondary_button"
          :disabled="submitting"
          @click="closeInitialization"
        >
          {{ t.cancel }}
        </button>
        <button type="button" class="danger_button" :disabled="!eraseReady" @click="erase">
          {{ submitting ? t.initializing : t.initializeConfirm }}
        </button>
      </div>
    </section>
  </dialog>
</template>

<style scoped lang="scss">

.modal_backdrop {
  position: fixed;
  inset: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  border: 0;
  padding: 20px;
  color: inherit;
  background: transparent;
}

.modal_backdrop[open] {
  display: grid;
  place-items: center;
}

.modal_backdrop::backdrop {
  background: rgb(0 0 0 / 55%);
}

.modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
}

.confirmation_modal {
  width: min(520px, 100%);
  padding: 24px;
}

.card_heading {
  padding: 22px 24px 14px;
}

.close {
  --app-icon-size: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--accent);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  border-bottom: 1px solid var(--table-border);
}

.tabs button {
  border: 0;
  border-bottom: 3px solid transparent;
  padding: 12px 16px;
  background: transparent;
  color: #718396;
  font: inherit;
  font-weight: 650;
}

.tabs button.active {
  border-bottom-color: var(--accent);
  color: var(--heading-color);
}

.tab_panel {
  min-height: 260px;
  padding: 22px 24px 26px;
}

.smart_error {
  @extend %fx_center;
  flex-direction: column;
  gap: $nas_status_gap;
  min-height: $nas_status_height;
  padding: $nas_status_padding;
  border: 1px solid color-mix(in srgb, var(--nas-error) 30%, var(--nas-outline));
  border-radius: 9px;
  background: color-mix(in srgb, var(--nas-error) 8%, var(--nas-panel));
  color: var(--nas-error);
  text-align: center;

  .app_icon {
    --app-icon-size: #{$nas_spinner_size};
  }

  h3 {
    margin: 0;
    font-size: 15px;
    color: var(--heading-color);
  }

  p {
    margin: 6px 0 0;
    color: var(--nas-muted);
    overflow-wrap: anywhere;
    max-width: 60ch;
  }
}

.smart_panel details {
  margin-top: 20px;
}

.smart_panel summary {
  color: var(--accent);
  cursor: pointer;
  font-weight: 650;
}

.smart_panel pre {
  max-height: 300px;
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  background: var(--sidebar-bg);
  color: var(--heading-color);
  font-size: 12px;
  white-space: pre-wrap;
}

.info_summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px 18px;
  border: 1px solid var(--table-border);
  border-radius: 10px;
  background: var(--nas-sunken);
}

.info_icon {
  --app-icon-size: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.info_size {
  display: grid;
  gap: 2px;

  strong {
    color: var(--heading-color);
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }

  span {
    color: #8194a4;
    font-size: 12px;
  }
}

.info_badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
  font-size: 12px;
  font-weight: 650;
}

.status {
  padding: 5px 8px;
  border-radius: 5px;
  background: var(--status-bg);
  color: var(--status-color);
}

.status.off {
  background: var(--status-off-bg);
  color: var(--status-off-color);
}

.info_badge {
  padding: 5px 8px;
  border: 1px solid var(--table-border);
  border-radius: 5px;
  color: var(--heading-color);
}

.info_grid {
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  gap: 10px;

  div {
    padding: 12px 14px;
    border: 1px solid var(--table-border);
    border-radius: 8px;
  }
}

.info_path {
  font-family: ui-monospace, monospace;
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  gap: 0 24px;
}

dl div {
  border-bottom: 1px solid var(--table-border);
  padding: 14px 0;
  min-width: 0;
}

dt {
  font-size: 11px;
  color: #8194a4;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}

.confirmation_modal h2 {
  margin: 0 0 16px;
}

.modal_actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

@media (max-width: 760px) {
  dl {
    grid-template-columns: 1fr;
  }

  .tabs {
    overflow-x: auto;
  }
}

</style>
