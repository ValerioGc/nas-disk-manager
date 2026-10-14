import { onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { Locale, Translations } from '@/i18n';
import type { Disk, DiskKind } from '@/types';

const kinds: DiskKind[] = ['local', 'external', 'network'];

/** The section another application asked for with `?kind=`, the local disks otherwise. */
function requestedKind(): DiskKind {
  const requested = new URL(window.location.href).searchParams.get('kind');
  return kinds.find((kind) => kind === requested) ?? 'local';
}

export function useDiskInventory(locale: Ref<Locale>, t: ComputedRef<Translations>) {
  const kind = ref<DiskKind>(requestedKind());
  const disks = ref<Disk[]>([]);
  const selected = ref<string | null>(null);
  const loading = ref(false);
  const error = ref('');
  const updatedAt = ref('');
  let timer: number | undefined;
  let controller: AbortController | undefined;

  async function refresh() {
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    loading.value = true;
    error.value = '';
    try {
      const response = await fetch(`api/disks?kind=${kind.value}`, {
        signal: requestController.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `${response.status}`);
      }
      if (!Array.isArray(data)) {
        throw new TypeError(t.value.invalidResponse);
      }
      disks.value = data as Disk[];
      if (!disks.value.some((disk) => disk.id === selected.value)) {
        selected.value = null;
      }
      updatedAt.value = new Date().toLocaleTimeString(locale.value);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return;
      }
      error.value = cause instanceof Error ? cause.message : t.value.genericError;
    } finally {
      if (controller === requestController) {
        loading.value = false;
      }
    }
  }

  watch(kind, () => {
    disks.value = [];
    selected.value = null;
    void refresh();
  });

  onMounted(() => {
    void refresh();
    timer = window.setInterval(() => void refresh(), 30_000);
  });

  onUnmounted(() => {
    controller?.abort();
    if (timer) {
      window.clearInterval(timer);
    }
  });

  return { kind, disks, selected, loading, error, updatedAt, refresh };
}
