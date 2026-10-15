import { onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { Locale, Translations } from '@/i18n';
import type { Disk, DiskKind } from '@/types';
import { readNasDisks, type DiskAnswer } from '@/services/nasShell';

const kinds: DiskKind[] = ['local', 'external', 'network', 'cloud'];

/** The section another application asked for with `?kind=`, the local disks otherwise. */
function requestedKind(): DiskKind {
  const requested = new URL(window.location.href).searchParams.get('kind');
  return kinds.find((kind) => kind === requested) ?? 'local';
}

/** The disks of a section: the network and cloud sections list theirs on their own. */
function listed(kind: DiskKind): Promise<DiskAnswer> {
  return kind === 'local' || kind === 'external'
    ? readNasDisks(kind)
    : Promise.resolve({ success: true, data: [] });
}

export function useDiskInventory(locale: Ref<Locale>, t: ComputedRef<Translations>) {
  const kind = ref<DiskKind>(requestedKind());
  const disks = ref<Disk[]>([]);
  const selected = ref<string | null>(null);
  const loading = ref(false);
  const error = ref('');
  const updatedAt = ref('');
  let timer: number | undefined;
  // An answer of the shell cannot be called off: only the latest request counts.
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
      updatedAt.value = new Date().toLocaleTimeString(locale.value);
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

  return { kind, disks, selected, loading, error, updatedAt, refresh };
}
