<script setup lang="ts">

import { computed } from 'vue';
import { NasIcon } from '@valeriogc/nas-base-app';
import { useDiskManager } from '@/composables/diskManagerContext';
import type { Disk } from '@/types';
import { KIND_ICONS, mountStatus } from '@/utils/disks';
import { formatDiskSize } from '@/utils/formatDiskSize';

const TRANSPORTS: Record<string, string> = { nvme: 'NVMe', sata: 'SATA', usb: 'USB' };

const props = defineProps<{ disk: Disk }>();
const { t, locale } = useDiskManager();

const transport = computed(() => {
  const name = props.disk.transport;
  return name ? (TRANSPORTS[name.toLowerCase()] ?? name.toUpperCase()) : '-';
});

</script>

<template>
  <div>
    <div class="info_summary" data-testid="disk_summary">
      <span class="info_icon"><NasIcon :svg="KIND_ICONS[disk.kind]" /></span>
      <div class="info_size">
        <strong>{{ formatDiskSize(disk.size_bytes, locale) }}</strong>
        <span>{{ t.size }}</span>
      </div>
      <ul class="info_badges">
        <li :class="['status', { off: !disk.mount }]">{{ mountStatus(disk, t) }}</li>
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
</template>

<style scoped lang="scss">

dl {
  @include detail_list;
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
    color: $text_faint;
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
  @include status_badge;
}

.status.off {
  @include status_badge_off;
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

</style>
