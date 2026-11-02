<script setup lang="ts">

import SectionCard from '@/components/commons/SectionCard.vue';
import { useDiskManager } from '@/composables/diskManagerContext';
import { KIND_ICONS } from '@/utils/disks';

const { t } = useDiskManager();

</script>

<template>
  <SectionCard
    class="cloud_card"
    :icon="KIND_ICONS.cloud"
    :title="t.kinds.cloud"
    data-testid="cloud_intro"
  >
    <p>{{ t.networkIntro }}</p>
    <p>{{ t.networkBackup }}</p>
    <!-- Adding a cloud disk is not there yet. -->
    <button type="button" class="add_button" data-testid="cloud_add">
      {{ t.networkAdd }}
    </button>
  </SectionCard>
</template>

<style scoped lang="scss">

.cloud_card {
  --section-text-width: 640px;
}

.add_button {
  margin-top: 8px;
}

</style>
