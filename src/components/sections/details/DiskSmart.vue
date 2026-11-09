<script setup lang="ts">

import { computed } from 'vue';
import { NasIcon, NasLoading, temperatureTone } from '@valeriogc/nas-base-app';
import { useDiskManager } from '@/composables/diskManagerContext';
import type { SmartRow } from '@/types';
import detailsIcon from '@/assets/icons/details.svg?url';

const props = defineProps<{
  loading: boolean;
  error: string;
  data: Record<string, unknown> | null;
}>();
const emit = defineEmits<{ retry: [] }>();
const { t } = useDiskManager();

function nested(...path: string[]): unknown {
  let value: unknown = props.data;
  for (const key of path) {
    if (!value || typeof value !== 'object' || !(key in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

const standby = computed(() => nested('standby') === true);

const temperature = computed(() => {
  const value = nested('temperature', 'current');
  return typeof value === 'number' ? value : undefined;
});

const rows = computed<SmartRow[]>(() => {
  const passed = nested('smart_status', 'passed');
  const health: SmartRow[] =
    typeof passed === 'boolean'
      ? [{ label: t.value.smartHealth, value: passed ? t.value.smartPassed : t.value.smartFailed }]
      : [];
  const metrics: SmartRow[] = [
    {
      label: t.value.smartTemperature,
      value: temperature.value,
      unit: ' °C',
      tone:
        temperature.value === undefined
          ? undefined
          : temperatureTone(
              temperature.value,
              nested('device', 'type') === 'nvme' ? 'nvme' : 'disk',
            ),
    },
    { label: t.value.smartPowerOnHours, value: nested('power_on_time', 'hours') },
    { label: t.value.smartPowerCycles, value: nested('power_cycle_count') },
  ];
  return [...health, ...metrics.filter((row) => row.value !== undefined)];
});
const raw = computed(() => JSON.stringify(props.data, null, 2));

</script>

<template>
  <div class="smart_panel">
    <NasLoading v-if="loading" :label="t.smartLoading" />
    <div v-else-if="error" class="smart_error" role="alert" data-testid="smart_error">
      <NasIcon :svg="detailsIcon" />
      <div>
        <h3>{{ t.smartUnavailableTitle }}</h3>
        <p>{{ error }}</p>
      </div>
    </div>
    <div v-else-if="standby" class="smart_standby" role="status" data-testid="smart_standby">
      <NasIcon :svg="detailsIcon" />
      <div>
        <h3>{{ t.smartStandbyTitle }}</h3>
        <p>{{ t.smartStandby }}</p>
      </div>
      <button
        type="button"
        class="secondary_button"
        data-testid="smart_retry"
        @click="emit('retry')"
      >
        {{ t.smartReadAgain }}
      </button>
    </div>
    <template v-else-if="data">
      <dl>
        <div v-for="row in rows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd :class="row.tone && `tone_${row.tone}`" :data-tone="row.tone">
            {{ row.value }}{{ row.unit }}
          </dd>
        </div>
      </dl>
      <details>
        <summary>{{ t.smartRaw }}</summary>
        <pre>{{ raw }}</pre>
      </details>
    </template>
  </div>
</template>

<style scoped lang="scss">

dl {
  @include detail_list;
}

.smart_error,
.smart_standby {
  @extend %fx_center;
  flex-direction: column;
  gap: $nas_status_gap;
  min-height: $nas_status_height;
  padding: $nas_status_padding;
  border: 1px solid color-mix(in srgb, var(--nas-error) 30%, var(--nas-outline));
  border-radius: 9px;
  background: color-mix(in srgb, var(--nas-error) 8%, var(--nas-panel));
  color: var(--nas-error);
  text-align: center;

  .app_icon {
    --app-icon-size: #{$nas_spinner_size};
  }

  h3 {
    margin: 0;
    font-size: 15px;
    color: var(--heading-color);
  }

  p {
    margin: 6px 0 0;
    color: var(--nas-muted);
    overflow-wrap: anywhere;
    max-width: 60ch;
  }
}

.smart_standby {
  border-color: var(--nas-outline);
  background: var(--nas-panel);
  color: var(--accent);
}

.tone_warning {
  color: var(--tone-warning);
  font-weight: 650;
}

.tone_danger {
  color: var(--nas-error);
  font-weight: 650;
}

details {
  margin-top: 20px;
}

summary {
  color: var(--accent);
  cursor: pointer;
  font-weight: 650;
}

pre {
  max-height: 300px;
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  color: var(--heading-color);
  font-size: 12px;
  white-space: pre-wrap;
}

</style>
