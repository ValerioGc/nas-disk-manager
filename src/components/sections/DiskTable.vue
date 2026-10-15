<script setup lang="ts">

import { computed, ref } from 'vue';
import type { Disk } from '@/types';
import { useDiskManager } from '@/composables/diskManagerContext';
import { countDisks } from '@/utils/countDisks';
import { formatDiskSize } from '@/utils/formatDiskSize';
import { NasIcon, NasLoading, vNasModal as vModal } from '@valeriogc/nas-base-app';
import detailsIcon from '@/assets/icons/details.svg?url';
import ejectIcon from '@/assets/icons/eject.svg?url';

const { t, locale, kind, disks, selected, loading, error, ejecting, diskError, isLocked, eject } =
  useDiskManager();

const requested = ref<Disk | null>(null);
const confirmation = computed(
  () => requested.value && disks.value.find((disk) => disk.id === requested.value?.id),
);

function askEject(disk: Disk) {
  if (!isLocked(disk) && ejecting.value === null) {
    requested.value = disk;
  }
}

async function confirmEject() {
  const disk = confirmation.value;
  requested.value = null;
  if (disk) {
    await eject(disk);
  }
}

</script>

<template>
  <section class="table_card surface_card" :aria-label="t.kinds[kind]">
    <div class="card_heading">
      <h2>{{ t.disks }}</h2>
      <!-- Every disk, active or not; the external ones have their total at the foot. -->
      <span v-if="kind === 'local' && disks.length" class="disk_total" data-testid="disk_total">
        {{ t.disksTotal.replace('{count}', String(countDisks(disks))) }}
      </span>
    </div>

    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <p v-if="diskError" class="alert" role="alert" data-testid="disk_error">{{ diskError }}</p>
    <output v-if="ejecting" class="ejecting" data-testid="ejecting">{{ t.ejecting }}</output>
    <NasLoading v-if="loading && !disks.length" :label="t.loading" />
    <p v-else-if="!disks.length && !error" class="empty">{{ t.empty }}</p>

    <div v-else class="table_scroll">
      <table>
        <thead>
          <tr>
            <th>{{ t.name }}</th>
            <th>{{ t.type }}</th>
            <th>{{ t.size }}</th>
            <th>{{ t.status }}</th>
            <th>
              <span class="sr_only">{{ t.details }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="disk in disks" :key="disk.id" :class="{ chosen: selected === disk.id }">
            <td>
              <span class="disk_name">{{ disk.name }}</span>
              <small>{{ disk.device || disk.source || disk.id }}</small>
            </td>
            <td>{{ disk.encryption ? t.encryptedType : disk.filesystem || disk.disk_type }}</td>
            <td>{{ formatDiskSize(disk.size_bytes, locale) }}</td>
            <td>
              <!-- Where it is mounted is in the details: here only whether it is. -->
              <span :class="['status', { off: !disk.mount }]">
                {{
                  disk.encryption === 'locked'
                    ? t.lockedStatus
                    : disk.mount
                      ? t.active
                      : t.unmounted
                }}
              </span>
            </td>
            <td>
              <div class="disk_actions">
                <button
                  class="disk_action"
                  type="button"
                  :aria-label="`${t.details} ${disk.name}`"
                  :title="t.details"
                  @click="selected = disk.id"
                >
                  <NasIcon :svg="detailsIcon" />
                </button>
                <button
                  v-if="kind === 'external'"
                  class="disk_action"
                  type="button"
                  :aria-disabled="isLocked(disk) || ejecting !== null"
                  :aria-label="`${t.eject} ${disk.name}`"
                  :title="isLocked(disk) ? t.ejectLocked : t.eject"
                  :data-testid="`eject_${disk.id}`"
                  @click="askEject(disk)"
                >
                  <NasIcon :svg="ejectIcon" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer v-if="kind === 'external'" class="external_total" data-testid="external_total">
      {{ t.externalDevicesTotal.replace('{count}', String(disks.length)) }}
    </footer>
    <dialog
      v-if="confirmation"
      v-modal
      class="eject_dialog surface_card"
      :aria-label="t.eject"
      data-testid="eject_confirmation"
      @cancel.prevent="requested = null"
    >
      <h2>{{ t.eject }} · {{ confirmation.name }}</h2>
      <p>{{ t.removalDescription }}</p>
      <div class="eject_actions">
        <button type="button" @click="requested = null">{{ t.cancel }}</button>
        <button
          type="button"
          :disabled="isLocked(confirmation)"
          data-testid="eject_confirm"
          @click="confirmEject"
        >
          {{ t.eject }}
        </button>
      </div>
    </dialog>
  </section>
</template>

<style scoped lang="scss">

.table_card {
  overflow: hidden;
  margin-bottom: 24px;
}

.table_scroll {
  overflow-x: auto;
}

.ejecting {
  display: block;
  padding: 12px 24px;
  color: #718396;
  font-size: 12px;
}

.disk_total {
  color: #718396;
  font-size: 12px;
}

.external_total {
  padding: 12px 24px;
  border-top: 1px solid var(--table-border);
  color: #718396;
  font-size: 12px;
  text-align: right;
}

table {
  border-collapse: collapse;
  width: 100%;
  text-align: left;
}

th {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8194a4;
  background: var(--table-heading-bg);
}

th,
td {
  padding: 16px 24px;
  border-bottom: 1px solid var(--table-border);
}

td {
  font-size: 13px;
}

tr:last-child td {
  border-bottom: 0;
}

tr.chosen {
  background: var(--chosen-bg);
}

.disk_name {
  display: block;
  font-weight: 650;
}

td small {
  display: block;
  color: #8194a4;
  margin-top: 3px;
  font-size: 11px;
}

.status {
  background: var(--status-bg);
  color: var(--status-color);
  border-radius: 5px;
  padding: 5px 8px;
  overflow-wrap: anywhere;
}

.status.off {
  background: var(--status-off-bg);
  color: var(--status-off-color);
}

.disk_actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.disk_action {
  --app-icon-size: 18px;
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--table-border);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);

  &:hover {
    background: var(--surface-soft);
  }

  &[aria-disabled='true'] {
    color: var(--nas-muted);
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.eject_dialog {
  width: min(480px, calc(100% - 40px));
  padding: 24px;
  color: inherit;

  &::backdrop {
    background: rgb(0 0 0 / 55%);
  }

  h2 {
    margin-top: 0;
    font-size: 18px;
  }
}

.eject_actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    padding: 8px 14px;
    border: 1px solid var(--table-border);
    border-radius: 8px;
    background: var(--surface-soft);
    color: var(--text);
  }
}

.empty,
.alert {
  margin: 0;
  padding: 48px 24px;
  text-align: center;
  color: #718396;
}

.alert {
  color: #a93838;
  background: #fff4f4;
}

</style>
