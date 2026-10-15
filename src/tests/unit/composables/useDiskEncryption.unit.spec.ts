import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { saveFile, useDiskEncryption, wholeDiskOf } from '@/composables/useDiskEncryption';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';
import type { Disk } from '@/types';

function entry(id: string, parent: string | null): Disk {
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
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('wholeDiskOf', () => {
  it('climbs the parents of a volume up to its disk', () => {
    const disks = [entry('sdb1', 'sdb'), entry('luks-1', 'sdb1')];

    expect(wholeDiskOf(disks[1]!, disks)).toBe('sdb');
    expect(wholeDiskOf(disks[0]!, disks)).toBe('sdb');
    expect(wholeDiskOf(entry('sdc', null), disks)).toBe('sdc');
  });
});

describe('saveFile', () => {
  it('hands the bytes to the browser as a file', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:key');
    URL.revokeObjectURL = vi.fn();

    saveFile('recovery.txt', 'key', 'text/plain');

    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:key');
  });
});

describe('useDiskEncryption', () => {
  const t = computed(() => messages.en);

  it('asks the launcher whether encryption is on, and runs a request', async () => {
    vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: true, data: true });
    const ask = vi.spyOn(shell, 'askNasDiskCrypt').mockResolvedValue({ success: true, data: {} });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const encryption = useDiskEncryption(t, refresh);
    await flushPromises();

    expect(encryption.available.value).toBe(true);
    await expect(encryption.crypt({ op: 'lock', uuid: 'ab' })).resolves.toEqual({
      success: true,
      data: {},
    });
    expect(ask).toHaveBeenCalledWith({ op: 'lock', uuid: 'ab' });
    expect(refresh).toHaveBeenCalledOnce();
    expect(encryption.working.value).toBe(false);
  });

  it('keeps encryption off when the launcher says nothing, and shows why a request failed', async () => {
    vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: false });
    vi.spyOn(shell, 'askNasDiskCrypt')
      .mockResolvedValueOnce({ success: false, error: 'the volume is in use by smbd' })
      .mockResolvedValueOnce({ success: false });
    const refresh = vi.fn();
    const encryption = useDiskEncryption(t, refresh);
    await flushPromises();

    expect(encryption.available.value).toBe(false);
    expect(await encryption.crypt({ op: 'lock', uuid: 'ab' })).toBeNull();
    expect(encryption.cryptError.value).toBe('the volume is in use by smbd');
    expect(await encryption.crypt({ op: 'lock', uuid: 'ab' })).toBeNull();
    expect(encryption.cryptError.value).toBe(messages.en.encryptionFailed);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('knows a connection where a password may be typed', () => {
    vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: false });
    vi.stubGlobal('location', { protocol: 'http:', hostname: 'nas.local' });
    expect(useDiskEncryption(t, vi.fn()).secure).toBe(false);
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'nas.local' });
    expect(useDiskEncryption(t, vi.fn()).secure).toBe(true);
  });
});
