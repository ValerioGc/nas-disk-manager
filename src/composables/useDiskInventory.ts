import { onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue';
import type { Translations } from '@/i18n';
import type { Disk, DiskAnswer, DiskKind } from '@/types';
import { readNasDisks } from '@/services/nasShell';
import { DISK_KINDS } from '@/utils/disks';

function requestedKind(): DiskKind {
  const requested = new URL(window.location.href).searchParams.get('kind');
  return DISK_KINDS.find((kind) => kind === requested) ?? 'local';
}

/** The network and cloud sections list their disks on their own. */
function listed(kind: DiskKind): Promise<DiskAnswer> {
  return kind === 'local' || kind === 'external'
    ? readNasDisks(kind)
    : Promise.resolve({ success: true, data: [] });
}

export function useDiskInventory(t: ComputedRef<Translations>) {
  const kind = ref<DiskKind>(requestedKind());
  const disks = ref<Disk[]>([]);
  const selected = ref<string | null>(null);
  const loading = ref(false);
  const error = ref('');
  let timer: number | undefined;
  /** An answer of the shell cannot be cancelled, so only the latest request counts. */
  let latest = 0;

  async function refresh() {
    const request = ++latest;
    loading.value = true;
    error.value = '';
    const result = await listed(kind.value);
    if (request !== latest) {
      return;
    }
    loading.value = false;
    if (!result.success) {
      error.value = result.error || t.value.genericError;
    } else if (Array.isArray(result.data)) {
      disks.value = result.data as Disk[];
      if (!disks.value.some((disk) => disk.id === selected.value)) {
        selected.value = null;
      }
    } else {
      error.value = t.value.invalidResponse;
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
    latest += 1;
    if (timer) {
      window.clearInterval(timer);
    }
  });

  return { kind, disks, selected, loading, error, refresh };
}
