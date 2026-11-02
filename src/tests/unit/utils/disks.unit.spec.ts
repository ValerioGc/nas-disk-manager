import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n';
import type { Disk } from '@/types';
import { countDisks, mountStatus, physicalDisk, wholeDiskOf } from '@/utils/disks';

function entry(id: string, parent: string | null, overrides: Partial<Disk> = {}): Disk {
  return {
    id,
    name: id,
    device: `/dev/${id}`,
    kind: 'local',
    disk_type: 'part',
    size_bytes: 1,
    mount: null,
    filesystem: null,
    model: null,
    transport: null,
    removable: false,
    read_only: false,
    initializable: false,
    parent,
    uuid: null,
    ...overrides,
  };
}

describe('wholeDiskOf', () => {
  it('climbs the parents of a volume up to its disk', () => {
    const disks = [entry('sdb1', 'sdb'), entry('luks-1', 'sdb1')];

    expect(wholeDiskOf(disks[1]!, disks)).toBe('sdb');
    expect(wholeDiskOf(disks[0]!, disks)).toBe('sdb');
    expect(wholeDiskOf(entry('sdc', null), disks)).toBe('sdc');
  });
});

describe('physicalDisk and countDisks', () => {
  it('counts a partition as the disk it is on', () => {
    const disks = [entry('sda', null), entry('sdb1', 'sdb'), entry('sdb2', 'sdb')];

    expect(physicalDisk(disks[1]!)).toBe('sdb');
    expect(physicalDisk(disks[0]!)).toBe('sda');
    expect(countDisks(disks)).toBe(2);
  });
});

describe('mountStatus', () => {
  it('names a locked, a mounted and an unmounted volume', () => {
    const t = messages.en;

    expect(mountStatus(entry('a', null, { encryption: 'locked', mount: '/x' }), t)).toBe(
      t.lockedStatus,
    );
    expect(mountStatus(entry('b', null, { mount: '/data' }), t)).toBe(t.active);
    expect(mountStatus(entry('c', null), t)).toBe(t.unmounted);
  });
});
