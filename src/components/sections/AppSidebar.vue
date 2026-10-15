<script setup lang="ts">

import { useDiskManager } from '@/composables/diskManagerContext';
import type { DiskKind } from '@/types';
import { NasIcon } from '@valeriogc/nas-base-app';
import external from '@/assets/icons/external.svg?url';
import local from '@/assets/icons/local.svg?url';
import network from '@/assets/icons/network.svg?url';
import cloud from '@/assets/icons/cloud.svg?url';

const { t, kind } = useDiskManager();
const kinds: DiskKind[] = ['local', 'external', 'network', 'cloud'];
const icons: Record<DiskKind, string> = { local, external, network, cloud };

</script>

<template>
  <aside data-testid="app_sidebar" class="sidebar" :aria-label="t.devices">
    <nav>
      <button
        v-for="item in kinds"
        :key="item"
        type="button"
        :class="['nav_item', { active: kind === item }]"
        :aria-current="kind === item ? 'page' : undefined"
        @click="kind = item"
      >
        <NasIcon class="nav_symbol" :svg="icons[item]" />
        {{ t.kinds[item] }}
      </button>
    </nav>
  </aside>
</template>

<style scoped lang="scss">

.sidebar {
  position: sticky;
  top: 0;
  min-height: 0;
  overflow-y: auto;
  background: #14283b;
  color: #e9f3fa;
  padding: 28px 16px;
  display: flex;
  flex-direction: column;
}

nav {
  display: grid;
  gap: 4px;
}

.nav_item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  background: transparent;
  color: #b8c9d7;
  padding: 12px;
  text-align: left;
  border-radius: 10px;
}

.nav_item:hover,
.nav_item.active {
  background: #29465b;
  color: white;
}

.nav_item.active {
  box-shadow: inset 3px 0 var(--accent);
}

.nav_symbol {
  --app-icon-size: 20px;
}

@media (max-width: 760px) {
  .sidebar {
    padding: 12px 16px;
  }

  nav {
    display: flex;
    overflow-x: auto;
  }

  .nav_item {
    white-space: nowrap;
  }
}

</style>
