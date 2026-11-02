<script setup lang="ts">

import { NasIcon, NasPageHeader } from '@valeriogc/nas-base-app';
import { useDiskManager } from '@/composables/diskManagerContext';
import refreshIcon from '@/assets/icons/refresh.svg?url';

const { t, kind, disks, loading, refresh } = useDiskManager();

</script>

<template>
  <NasPageHeader :overview="t.overview" :title="t.kinds[kind]" :subtitle="t.descriptions[kind]">
    <template v-if="kind === 'local' || disks.length" #actions>
      <button class="refresh" type="button" :disabled="loading" @click="refresh">
        <NasIcon :svg="refreshIcon" />
        {{ t.refresh }}
      </button>
    </template>
  </NasPageHeader>
</template>

<style scoped lang="scss">

.page_header {
  :deep(h1) {
    font-size: clamp(28px, 3vw, 38px);
    margin: 0;
    letter-spacing: -0.035em;
  }

  :deep(.subtitle) {
    color: $text_soft;
  }
}

.refresh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--refresh-border);
  border-radius: 9px;
  padding: 10px 16px;
  color: var(--refresh-color);
  background: var(--refresh-bg);
  white-space: nowrap;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

</style>
