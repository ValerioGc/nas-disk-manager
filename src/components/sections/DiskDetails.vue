<script setup lang="ts">

import { computed, ref, watch } from 'vue';
import { NasIcon, NasSwitch, vNasModal as vModal } from '@valeriogc/nas-base-app';
import DiskInfo from '@/components/sections/details/DiskInfo.vue';
import DiskSmart from '@/components/sections/details/DiskSmart.vue';
import EncryptionActions from '@/components/sections/details/EncryptionActions.vue';
import EraseDialog from '@/components/sections/details/EraseDialog.vue';
import { useDiskManager } from '@/composables/diskManagerContext';
import { notifyNasShell, readNasDiskSmart, renameNasDisk } from '@/services/nasShell';
import type { DetailTab, EraseMode } from '@/types';
import { physicalDisk, wholeDiskOf } from '@/utils/disks';
import closeIcon from '@/assets/icons/close.svg?url';

const TABS: DetailTab[] = ['info', 'smart', 'actions'];
const RENAMABLE = ['ext2', 'ext3', 'ext4'];

const { t, disks, selected, refresh, ejecting, isLocked, setLock, eject, available } =
  useDiskManager();
const disk = computed(() => disks.value.find((item) => item.id === selected.value));
const activeTab = ref<DetailTab>('info');
const eraseMode = ref<EraseMode | null>(null);
const eraseEncrypted = ref(false);
const submitting = ref(false);
const renaming = ref(false);
const renameLabel = ref('');
const renameError = ref('');
const smartLoading = ref(false);
const smartError = ref('');
const smartData = ref<Record<string, unknown> | null>(null);

const canRename = computed(
  () =>
    Boolean(disk.value?.device) &&
    !disk.value?.read_only &&
    RENAMABLE.includes(disk.value?.filesystem ?? ''),
);
const busy = computed(() => submitting.value || renaming.value || ejecting.value !== null);
const canFormat = computed(
  () =>
    available.value &&
    disk.value?.kind === 'local' &&
    !disk.value.system_disk &&
    !disk.value.read_only &&
    !disk.value.initializable &&
    Boolean(disk.value.identity),
);
const external = computed(() => disk.value?.kind === 'external');
/** The container of the selected entry: itself, or the closed or open volume it is the inside of. */
const container = computed(() => {
  const current = disk.value;
  if (!current || !available.value) {
    return null;
  }
  const entry = current.encryption
    ? current
    : disks.value.find((item) => item.id === current.parent && item.encryption);
  return entry?.uuid ? entry : null;
});

const encryptedDisk = computed(() => {
  const current = disk.value;
  if (!current) {
    return false;
  }
  const whole = wholeDiskOf(current, disks.value);
  return disks.value.some((item) => item.encryption && wholeDiskOf(item, disks.value) === whole);
});

const canEncrypt = computed(
  () =>
    available.value &&
    disk.value?.kind === 'local' &&
    !disk.value.removable &&
    !disk.value.system_disk &&
    !disk.value.read_only &&
    Boolean(disk.value.identity) &&
    (disk.value.initializable || canFormat.value) &&
    !encryptedDisk.value,
);
const locked = computed(() => Boolean(disk.value && isLocked(disk.value)));
const noActions = computed(
  () =>
    !canRename.value &&
    !disk.value?.initializable &&
    !external.value &&
    !canFormat.value &&
    !container.value,
);

// Only another disk resets the tab, not every new reading of the list.
watch(
  () => disk.value?.id,
  () => {
    activeTab.value = 'info';
    renameLabel.value = disk.value?.name ?? '';
    renameError.value = '';
    smartError.value = '';
    smartData.value = null;
  },
  { immediate: true },
);

function startErase(mode: EraseMode, encrypted = false) {
  eraseEncrypted.value = encrypted;
  eraseMode.value = mode;
}

function closeDetails() {
  if (!busy.value && !eraseMode.value) {
    selected.value = null;
  }
}

async function selectTab(tab: DetailTab) {
  activeTab.value = tab;
  const current = disk.value;
  if (tab !== 'smart' || smartData.value || smartLoading.value || !current) {
    return;
  }
  smartLoading.value = true;
  smartError.value = '';
  const result = await readNasDiskSmart(physicalDisk(current));
  if (result.success && result.data && typeof result.data === 'object') {
    smartData.value = result.data as Record<string, unknown>;
  } else {
    smartError.value = result.error || t.value.smartUnavailable;
  }
  smartLoading.value = false;
}

function rereadSmart() {
  smartData.value = null;
  void selectTab('smart');
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

async function ejectSelected() {
  if (disk.value && !locked.value) {
    await eject(disk.value);
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
          v-for="tab in TABS"
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
      <DiskInfo v-if="activeTab === 'info'" class="tab_panel" role="tabpanel" :disk="disk" />
      <DiskSmart
        v-else-if="activeTab === 'smart'"
        class="tab_panel"
        role="tabpanel"
        :loading="smartLoading"
        :error="smartError"
        :data="smartData"
        @retry="rereadSmart"
      />
      <div v-else class="tab_panel" role="tabpanel">
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
        <div v-if="disk.initializable" class="action_section">
          <h3>{{ t.initialize }}</h3>
          <p class="warning">{{ t.initializeWarning }}</p>
          <button type="button" class="danger_button" @click="startErase('initialize')">
            {{ t.initialize }}
          </button>
        </div>
        <EncryptionActions v-if="container" :disk="container" />
        <div v-if="canEncrypt" class="action_section" data-testid="encrypt_section">
          <h3>{{ t.encryptDisk }}</h3>
          <p>{{ t.encryptDiskDescription }}</p>
          <p class="warning">{{ disk.initializable ? t.initializeWarning : t.formatWarning }}</p>
          <button
            type="button"
            class="danger_button"
            data-testid="encrypt_disk"
            @click="startErase(disk.initializable ? 'initialize' : 'format', true)"
          >
            {{ t.encryptDisk }}
          </button>
        </div>
        <div v-if="canFormat" class="action_section" data-testid="format_section">
          <h3>{{ t.format }}</h3>
          <p class="warning">{{ t.formatWarning }}</p>
          <button type="button" class="danger_button" @click="startErase('format')">
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
          <!-- aria-disabled instead of disabled keeps the tooltip on hover. -->
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
        <p v-if="noActions">{{ t.actionsUnavailable }}</p>
      </div>
    </section>
  </dialog>

  <EraseDialog
    v-if="eraseMode && disk"
    v-model:submitting="submitting"
    :disk="disk"
    :mode="eraseMode"
    :encrypted="eraseEncrypted"
    @close="eraseMode = null"
  />
</template>

<style scoped lang="scss">

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

  button {
    border: 0;
    border-bottom: 3px solid transparent;
    padding: 12px 16px;
    background: transparent;
    color: $text_soft;
    font-weight: 650;

    &.active {
      border-bottom-color: var(--accent);
      color: var(--heading-color);
    }
  }
}

.tab_panel {
  min-height: 260px;
  padding: 22px 24px 26px;
}

@media (max-width: 760px) {
  .tabs {
    overflow-x: auto;
  }
}

</style>
