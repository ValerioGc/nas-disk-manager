<script setup lang="ts">

import { computed, ref, watch } from 'vue';
import { NasIcon, NasLoading, NasSwitch, vNasModal as vModal } from '@valeriogc/nas-base-app';
import { useDiskManager } from '@/composables/diskManagerContext';
import { formatDiskSize } from '@/utils/formatDiskSize';
import closeIcon from '@/assets/icons/close.svg?url';
import detailsIcon from '@/assets/icons/details.svg?url';
import {
  initializeNasDisk,
  notifyNasShell,
  readNasDiskSmart,
  renameNasDisk,
} from '@/services/nasShell';

type DetailTab = 'info' | 'smart' | 'actions';
const { t, locale, disks, selected, refresh, ejecting, isLocked, setLock, eject } =
  useDiskManager();
const disk = computed(() => disks.value.find((item) => item.id === selected.value));
const activeTab = ref<DetailTab>('info');
const confirming = ref(false);
const confirmation = ref('');
const label = ref('');
const submitting = ref(false);
const renaming = ref(false);
const renameLabel = ref('');
const operationError = ref('');
const renameError = ref('');
const smartLoading = ref(false);
const smartError = ref('');
const smartData = ref<Record<string, unknown> | null>(null);
const canRename = computed(
  () =>
    Boolean(disk.value?.device) &&
    !disk.value?.read_only &&
    ['ext2', 'ext3', 'ext4'].includes(disk.value?.filesystem ?? ''),
);
const busy = computed(() => submitting.value || renaming.value || ejecting.value !== null);
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
function openInitialization() {
  const current = disk.value;
  if (!current?.initializable) {
    return;
  }
  label.value = `Data-${current.id.replace(/[^a-z0-9]+/gi, '-')}`.slice(0, 16);
  confirmation.value = '';
  operationError.value = '';
  confirming.value = true;
}
async function initialize() {
  const current = disk.value;
  if (!current || confirmation.value !== current.id || !label.value.trim()) {
    return;
  }
  submitting.value = true;
  operationError.value = '';
  const result = await initializeNasDisk(current.id, label.value.trim());
  if (!result.success) {
    submitting.value = false;
    operationError.value = result.error || t.value.initializeFailed;
    return;
  }
  await refresh();
  submitting.value = false;
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
        <dl>
          <div>
            <dt>{{ t.device }}</dt>
            <dd>{{ disk.device || disk.source || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t.mount }}</dt>
            <dd>{{ disk.mount || t.unmounted }}</dd>
          </div>
          <div>
            <dt>{{ t.size }}</dt>
            <dd>{{ formatDiskSize(disk.size_bytes, locale) }}</dd>
          </div>
          <div>
            <dt>{{ t.filesystem }}</dt>
            <dd>{{ disk.filesystem || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t.transport }}</dt>
            <dd>{{ disk.transport || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t.model }}</dt>
            <dd>{{ disk.model || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t.readOnlyLabel }}</dt>
            <dd>{{ disk.read_only ? t.yes : t.no }}</dd>
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
            ><input v-model="renameLabel" maxlength="16" autocomplete="off" :disabled="renaming"
          /></label>
          <p v-if="renameError" class="operation_error" role="alert">{{ renameError }}</p>
          <button
            type="submit"
            class="secondary_button"
            :disabled="renaming || !renameLabel.trim() || renameLabel.trim() === disk.name"
          >
            {{ renaming ? t.renaming : t.renameConfirm }}
          </button>
        </form>
        <div v-if="disk.initializable" class="action_section danger_section">
          <h3>{{ t.initialize }}</h3>
          <p class="warning">{{ t.initializeWarning }}</p>
          <button type="button" class="danger_button" @click="openInitialization">
            {{ t.initialize }}
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
        <p v-if="!canRename && !disk.initializable && !external">{{ t.actionsUnavailable }}</p>
      </div>
    </section>
  </dialog>

  <dialog
    v-if="confirming && disk"
    v-modal
    class="modal_backdrop confirmation_backdrop"
    :aria-label="t.initializeTitle"
    @click.self="closeInitialization"
    @cancel.prevent="closeInitialization"
  >
    <section class="modal confirmation_modal surface_card">
      <h2>{{ t.initializeTitle }}</h2>
      <p class="warning">{{ t.initializeWarning }}</p>
      <p>
        <strong>{{ t.initializeDevice }}:</strong> /dev/{{ disk.id }}
      </p>
      <label
        ><span>{{ t.volumeLabel }}</span
        ><input v-model="label" maxlength="16" autocomplete="off" :disabled="submitting"
      /></label>
      <label
        ><span
          >{{ t.confirmDevice }}: <strong>{{ disk.id }}</strong></span
        ><input v-model="confirmation" autocomplete="off" :disabled="submitting"
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
        <button
          type="button"
          class="danger_button"
          :disabled="submitting || confirmation !== disk.id || !label.trim()"
          @click="initialize"
        >
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

.action_section + .action_section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--table-border);
}

.action_section h3 {
  margin: 0 0 8px;
}

.action_section p {
  color: #718396;
}

.action_section label,
.confirmation_modal label {
  display: grid;
  gap: 7px;
  margin: 16px 0;
}

input {
  border: 1px solid var(--table-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--app-bg);
  color: var(--heading-color);
  font: inherit;
}

.danger_button,
.secondary_button {
  border: 1px solid currentColor;
  border-radius: 8px;
  padding: 10px 16px;
  background: transparent;
  font: inherit;
  font-weight: 650;
}

.danger_button {
  color: #b42318;
}

.secondary_button {
  color: var(--heading-color);
}

button:disabled,
button[aria-disabled='true'] {
  opacity: 0.45;
}

button[aria-disabled='true'] {
  cursor: not-allowed;
}

.action_section .app_switch {
  margin: 16px 0 4px;
}

.action_section .hint {
  margin: 0 0 16px;
  font-size: 12px;
}

.warning,
.operation_error {
  color: #b42318 !important;
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
