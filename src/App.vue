<script setup lang="ts">

import { provideDiskManager } from '@/composables/diskManagerContext';
import AppSidebar from '@/components/sections/AppSidebar.vue';
import PageHeader from '@/components/sections/PageHeader.vue';
import DiskSummary from '@/components/sections/DiskSummary.vue';
import DiskTable from '@/components/sections/DiskTable.vue';
import DiskDetails from '@/components/sections/DiskDetails.vue';
import NetworkDisks from '@/components/sections/NetworkDisks.vue';
import CloudDisks from '@/components/sections/CloudDisks.vue';

const { kind } = provideDiskManager();

</script>

<template>
  <div class="app_shell app_surface">
    <AppSidebar />
    <main class="content" data-testid="app_content">
      <PageHeader />
      <DiskSummary v-if="kind === 'local'" />
      <NetworkDisks v-if="kind === 'network'" />
      <CloudDisks v-if="kind === 'cloud'" />
      <template v-if="kind === 'local' || kind === 'external'">
        <DiskTable />
        <DiskDetails />
      </template>
    </main>
  </div>
</template>

<style scoped lang="scss">

.app_shell {
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.content {
  position: relative;
  min-height: 0;
  overflow: auto;
  padding: 42px clamp(20px, 4vw, 64px);
  max-width: 1500px;
  width: 100%;
  background: var(--nas-app-content, var(--app-bg));

  :deep(.page_header + .table_card) {
    margin-top: 34px;
  }
}

@media (max-width: 760px) {
  .app_shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .content {
    min-height: 0;
    overflow: auto;
    padding: 26px 16px;
  }
}

</style>
