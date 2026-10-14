<script setup lang="ts">

import { computed } from 'vue';
import { useDiskManager } from '@/composables/diskManagerContext';
import { countDisks } from '@/utils/countDisks';

const { t, disks } = useDiskManager();

function countPhysical(transport: string) {
  return countDisks(disks.value.filter((disk) => disk.transport?.toLowerCase() === transport));
}
const nvmeCount = computed(() => countPhysical('nvme'));
const sataCount = computed(() => countPhysical('sata'));
// The disks in use: the ones with a volume mounted, as the table marks them.
const activeCount = computed(() => countDisks(disks.value.filter((disk) => disk.mount)));

</script>

<template>
  <div class="summary">
    <div class="surface_card">
      <span class="summary_label">{{ t.nvmeDisks }}</span>
      <strong>{{ nvmeCount }}</strong>
    </div>
    <div class="surface_card">
      <span class="summary_label">{{ t.sataDisks }}</span>
      <strong>{{ sataCount }}</strong>
    </div>
    <div class="surface_card">
      <span class="summary_label">{{ t.activeDisks }}</span>
      <strong data-testid="active_disks">{{ activeCount }}</strong>
    </div>
  </div>
</template>

<style scoped lang="scss">

.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 34px 0 24px;
}

.summary > div {
  min-height: 106px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary_label {
  color: #718396;
  font-size: 13px;
}

.summary strong {
  font-size: 28px;
}

@media (max-width: 760px) {
  .summary {
    gap: 8px;
  }

  .summary > div {
    padding: 14px;
    min-height: 90px;
  }
}

</style>
