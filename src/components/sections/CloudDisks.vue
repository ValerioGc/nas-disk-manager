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
    <p>{{ t.cloudIntro }}</p>
    <p>{{ t.cloudBackup }}</p>
    <button type="button" class="add_button" data-testid="cloud_add">
      {{ t.cloudAdd }}
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
