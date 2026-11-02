<script setup lang="ts">

import { NasIcon } from '@valeriogc/nas-base-app';

defineProps<{ icon: string; title: string }>();

</script>

<template>
  <section class="section_card surface_card" :aria-label="title">
    <NasIcon :svg="icon" class="section_icon" />
    <div class="section_body">
      <div class="section_header">
        <h2>{{ title }}</h2>
        <slot name="action" />
      </div>
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">

.section_card {
  display: flex;
  gap: 20px;
  margin-top: 32px;
  padding: 28px;
}

.section_icon {
  --app-icon-size: 32px;
  color: var(--accent);
}

.section_body {
  flex: 1;
  min-width: 0;

  > :deep(:not(.section_header, form)),
  > :deep(form > :not(.form_actions)) {
    max-width: var(--section-text-width, 720px);
  }

  :deep(p) {
    margin: 0 0 10px;
    color: $text_soft;
    line-height: 1.5;
  }

  :deep(.add_button) {
    padding: 10px 18px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    color: var(--accent);
    background: transparent;
    font-weight: 650;
  }
}

.section_header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  h2 {
    margin: 0;
    color: var(--heading-color);
    font-size: 17px;
  }
}

</style>
