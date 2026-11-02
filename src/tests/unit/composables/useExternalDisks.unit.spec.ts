import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { useExternalDisks } from '@/composables/useExternalDisks';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';
import type { Disk, DiskKind } from '@/types';

function disk(id: string, parent: string | null, uuid: string | null): Disk {
  return {
    id,
    name: id,
    device: `/dev/${id}`,
    kind: 'external',
    disk_type: 'part',
    size_bytes: 1,
    mount: null,
    filesystem: uuid ? 'exfat' : null,
    model: null,
    transport: 'usb',
    removable: true,
    read_only: false,
    initializable: false,
    parent,
    source: null,
    uuid,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('useExternalDisks', () => {
  it('reads the marks when the external disks are shown, and a mark holds the whole disk', async () => {
    const read = vi
      .spyOn(shell, 'readNasDiskLocks')
      .mockResolvedValue({ success: true, data: ['ab12', 7] });
    const kind = ref<DiskKind>('local');
    const disks = ref([
      disk('sdb1', 'sdb', 'AB12'),
      disk('sdb2', 'sdb', null),
      disk('sdc', null, 'ff'),
    ]);
    const external = useExternalDisks(
      kind,
      disks,
      computed(() => messages.en),
      async () => {},
    );
    expect(read).not.toHaveBeenCalled();

    kind.value = 'external';
    await nextTick();
    await vi.waitFor(() => expect(external.locks.value).toEqual(['ab12']));

    expect(external.isLocked(disks.value[1]!)).toBe(true);
    expect(external.isLocked(disks.value[2]!)).toBe(false);
    const older = { ...disk('sdd', null, null), uuid: undefined } as unknown as Disk;
    expect(external.isLocked(older)).toBe(false);
  });

  it('keeps the marks it had when they cannot be read, and marks nothing without a UUID', async () => {
    vi.spyOn(shell, 'readNasDiskLocks').mockResolvedValue({ success: false });
    const lock = vi.spyOn(shell, 'lockNasDisk');
    const disks = ref([disk('sdb', null, null)]);
    const external = useExternalDisks(
      ref<DiskKind>('external'),
      disks,
      computed(() => messages.en),
      async () => {},
    );
    await external.loadLocks();
    await external.setLock(disks.value[0]!, true);

    expect(external.locks.value).toEqual([]);
    expect(lock).not.toHaveBeenCalled();
  });

  it('ejects one disk at a time and reads the disks again', async () => {
    vi.spyOn(shell, 'readNasDiskLocks').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(shell, 'notifyNasShell').mockImplementation(() => {});
    let finish!: (value: { success: boolean }) => void;
    const eject = vi
      .spyOn(shell, 'ejectNasDisk')
      .mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const disks = ref([{ ...disk('sdb', null, 'ab12'), name: 'Archivio USB' }]);
    const refresh = vi.fn(async () => {
      disks.value = [];
    });
    const external = useExternalDisks(
      ref<DiskKind>('external'),
      disks,
      computed(() => messages.en),
      refresh,
    );

    const first = external.eject(disks.value[0]!);
    await external.eject(disks.value[0]!);
    expect(external.ejecting.value).toBe('sdb');
    finish({ success: true });
    await first;

    expect(eject).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
    expect(external.ejecting.value).toBeNull();
    expect(shell.notifyNasShell).toHaveBeenCalledWith(
      messages.en.ejected,
      'The device Archivio USB has been ejected and can be safely disconnected.',
      'success',
    );
  });

  it('says why an ejection failed with the reason of the launcher, or its own', async () => {
    vi.spyOn(shell, 'readNasDiskLocks').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(shell, 'ejectNasDisk').mockResolvedValue({ success: false });
    const disks = ref([disk('sdb', null, 'ab12')]);
    const external = useExternalDisks(
      ref<DiskKind>('external'),
      disks,
      computed(() => messages.en),
      async () => {},
    );

    await external.eject(disks.value[0]!);
    expect(external.diskError.value).toBe(messages.en.ejectFailed);
  });
});
