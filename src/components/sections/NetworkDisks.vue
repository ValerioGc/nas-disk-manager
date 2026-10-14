<script setup lang="ts">

import { useDiskManager } from '@/composables/diskManagerContext';
import { NasIcon } from '@valeriogc/nas-base-app';
import network from '@/assets/icons/network.svg?url';

const { t } = useDiskManager();

</script>

<template>
  <section
    class="network_card surface_card"
    :aria-label="t.networkTitle"
    data-testid="network_intro"
  >
    <NasIcon :svg="network" class="network_icon" />
    <div class="network_text">
      <h2>{{ t.networkTitle }}</h2>
      <p>{{ t.networkIntro }}</p>
      <p>{{ t.networkBackup }}</p>
      <!-- Adding a network disk is not there yet: the button marks where it will start. -->
      <button type="button" class="add_button" data-testid="network_add">
        {{ t.networkAdd }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">

.network_card {
  display: flex;
  gap: 20px;
  margin-top: 32px;
  padding: 28px;
}

.network_icon {
  --app-icon-size: 32px;
  color: var(--accent);
}

.network_text {
  max-width: 640px;

  h2 {
    margin: 0 0 10px;
    color: var(--heading-color);
    font-size: 17px;
  }

  p {
    margin: 0 0 10px;
    color: #718396;
    line-height: 1.5;
  }
}

.add_button {
  margin-top: 8px;
  padding: 10px 18px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  color: var(--accent);
  background: transparent;
  font: inherit;
  font-weight: 650;
}

</style>
