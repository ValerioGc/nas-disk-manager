import { ref, type ComputedRef } from 'vue';
import type { Translations } from '@/i18n';
import type { CryptRequest, Disk } from '@/types';
import { askNasDiskCrypt, readNasDiskEncryption, type DiskAnswer } from '@/services/nasShell';

/** A password is typed only over HTTPS, or on the screen of the NAS itself. */
function secureConnection(): boolean {
  const page = globalThis.location;
  return page.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
}

/** The whole disk an entry belongs to: the top of its chain of parents. */
export function wholeDiskOf(disk: Disk, disks: readonly Disk[]): string {
  let current = disk;
  for (let depth = 0; current.parent && depth < 8; depth += 1) {
    const parent = disks.find((entry) => entry.id === current.parent);
    if (!parent) {
      return current.parent;
    }
    current = parent;
  }
  return current.id;
}

/** Saves bytes as a file of the person, from the page. */
export function saveFile(name: string, content: BlobPart, type: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** The encryption of the data disks, which the launcher may have off. */
export function useDiskEncryption(t: ComputedRef<Translations>, refresh: () => Promise<void>) {
  const available = ref(false);
  const working = ref(false);
  const cryptError = ref('');
  const secure = secureConnection();

  async function loadEncryption() {
    const result = await readNasDiskEncryption();
    available.value = result.success && result.data === true;
  }

  /** Runs one request, then lists the disks again; null when it failed, with the reason shown. */
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
  return { available, working, cryptError, secure, crypt, loadEncryption };
}
