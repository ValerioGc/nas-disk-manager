import type { Disk } from '@/types';

/** The physical disks among the volumes listed: a partition counts as the disk it is on. */
export function countDisks(disks: readonly Disk[]): number {
  return new Set(disks.map((disk) => disk.parent ?? disk.id)).size;
}
