import { onMounted, ref, type ComputedRef } from 'vue';
import type { Translations } from '@/i18n';
import type { NetworkDisks, NetworkRequest } from '@/types';
import { askNasNetworkDisk, readNasNetworkDisks } from '@/services/nasShell';

function isNetworkDisks(value: unknown): value is NetworkDisks {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as NetworkDisks).available === 'boolean' &&
    Array.isArray((value as NetworkDisks).disks)
  );
}

/** The network disks of the NAS, and what the person does with them. */
export function useNetworkDisks(t: ComputedRef<Translations>) {
  const state = ref<NetworkDisks>({ available: false, disks: [] });
  const working = ref(false);
  const networkError = ref('');

  async function loadNetwork() {
    const result = await readNasNetworkDisks();
    if (result.success && isNetworkDisks(result.data)) {
      state.value = result.data;
    }
  }

  /** Runs one request, then lists the disks again; false when it failed, with the reason shown. */
  async function network(request: NetworkRequest): Promise<boolean> {
    working.value = true;
    networkError.value = '';
    const result = await askNasNetworkDisk(request);
    working.value = false;
    if (!result.success) {
      networkError.value = result.error || t.value.smbFailed;
      return false;
    }
    await loadNetwork();
    return true;
  }

  onMounted(loadNetwork);
  return { state, working, networkError, network, loadNetwork };
}
