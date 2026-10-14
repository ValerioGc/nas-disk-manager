import { ref, watch, type ComputedRef, type Ref } from 'vue';
import type { Translations } from '@/i18n';
import type { Disk, DiskKind } from '@/types';
import { ejectNasDisk, lockNasDisk, notifyNasShell, readNasDiskLocks } from '@/services/nasShell';

function uuids(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Ejecting the external disks, and the mark that keeps one from being ejected. The mark is kept by
 * the launcher for each filesystem UUID, so a disk keeps it when plugged in again; the launcher
 * refuses to eject a marked disk even when asked.
 */
export function useExternalDisks(
  kind: Ref<DiskKind>,
  disks: Ref<Disk[]>,
  t: ComputedRef<Translations>,
  refresh: () => Promise<void>,
) {
  const locks = ref<string[]>([]);
  const ejecting = ref<string | null>(null);
  const diskError = ref('');

  async function loadLocks() {
    const result = await readNasDiskLocks();
    if (result.success) {
      locks.value = uuids(result.data);
    }
  }

  /** The whole disk of an entry: a partition belongs to its parent. */
  const wholeDisk = (disk: Disk) => disk.parent ?? disk.id;

  /** Whether one of the volumes of the disk is marked: the mark holds the whole disk. */
  function isLocked(disk: Disk) {
    const whole = wholeDisk(disk);
    return disks.value.some(
      (entry) =>
        wholeDisk(entry) === whole &&
        // A backend older than this page sends no UUID at all.
        typeof entry.uuid === 'string' &&
        locks.value.includes(entry.uuid.toLowerCase()),
    );
  }

  async function setLock(disk: Disk, locked: boolean) {
    if (!disk.uuid) {
      return;
    }
    diskError.value = '';
    const result = await lockNasDisk(disk.uuid, locked);
    if (result.success) {
      locks.value = uuids(result.data);
    } else {
      diskError.value = result.error || t.value.lockFailed;
    }
  }

  async function eject(disk: Disk) {
    if (isLocked(disk) || ejecting.value) {
      return;
    }
    ejecting.value = disk.id;
    diskError.value = '';
    const result = await ejectNasDisk(disk.id);
    ejecting.value = null;
    if (!result.success) {
      diskError.value = result.error || t.value.ejectFailed;
      return;
    }
    notifyNasShell(t.value.ejected, t.value.ejectedMessage.replace('{name}', disk.name), 'success');
    await refresh();
  }

  watch(
    kind,
    (current) => {
      diskError.value = '';
      if (current === 'external') {
        void loadLocks();
      }
    },
    { immediate: true },
  );

  return { locks, ejecting, diskError, isLocked, setLock, eject, loadLocks };
}
