import { ref, type ComputedRef } from 'vue';
import type { Translations } from '@/i18n';
import type { CryptRequest, DiskAnswer } from '@/types';
import { askNasDiskCrypt, readNasDiskEncryption, readNasDiskSecurity } from '@/services/nasShell';

export const MIN_PASSWORD = 8;

/** A password is typed only over HTTPS or on the screen of the NAS itself. */
function secureConnection(): boolean {
  const page = globalThis.location;
  return page.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
}

/** An unknown state of the system disk is not reported as exposed. */
function exposed(state: unknown): boolean {
  if (!state || typeof state !== 'object') {
    return false;
  }
  const { systemEncrypted, tpm } = state as Record<string, unknown>;
  return systemEncrypted === false || tpm === false;
}

export function useDiskEncryption(t: ComputedRef<Translations>, refresh: () => Promise<void>) {
  const available = ref(false);
  const systemExposed = ref(false);
  const working = ref(false);
  const cryptError = ref('');
  const secure = secureConnection();

  async function loadEncryption() {
    const result = await readNasDiskEncryption();
    available.value = result.success && result.data === true;
  }

  async function loadSecurity() {
    const result = await readNasDiskSecurity();
    systemExposed.value = result.success && exposed(result.data);
  }

  async function crypt(request: CryptRequest): Promise<DiskAnswer | null> {
    working.value = true;
    cryptError.value = '';
    const result = await askNasDiskCrypt(request);
    working.value = false;
    if (!result.success) {
      cryptError.value = result.error || t.value.encryptionFailed;
      return null;
    }
    await refresh();
    return result;
  }

  void loadEncryption();
  void loadSecurity();
  return { available, systemExposed, working, cryptError, secure, crypt };
}
