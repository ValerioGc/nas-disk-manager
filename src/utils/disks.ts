import type { Translations } from '@/i18n';
import type { Disk, DiskKind } from '@/types';
import cloud from '@/assets/icons/cloud.svg?url';
import external from '@/assets/icons/external.svg?url';
import local from '@/assets/icons/local.svg?url';
import network from '@/assets/icons/network.svg?url';

export const DISK_KINDS: readonly DiskKind[] = ['local', 'external', 'network', 'cloud'];

export const KIND_ICONS: Record<DiskKind, string> = { local, external, network, cloud };

export function physicalDisk(disk: Disk): string {
  return disk.parent ?? disk.id;
}

/** The top of the chain of parents of an entry. */
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

/** A partition counts as the disk it is on. */
export function countDisks(disks: readonly Disk[]): number {
  return new Set(disks.map(physicalDisk)).size;
}

export function mountStatus(disk: Disk, t: Translations): string {
  if (disk.encryption === 'locked') {
    return t.lockedStatus;
  }
  return disk.mount ? t.active : t.unmounted;
}
