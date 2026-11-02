import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useDiskEncryption } from '@/composables/useDiskEncryption';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it('knows a system disk the launcher says is not protected, and nothing when it does not say', async () => {
    vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: true, data: true });
    const security = vi.spyOn(shell, 'readNasDiskSecurity');
    const exposed = async (answer: Awaited<ReturnType<typeof shell.readNasDiskSecurity>>) => {
      security.mockResolvedValueOnce(answer);
      const encryption = useDiskEncryption(t, vi.fn());
      await flushPromises();
      return encryption.systemExposed.value;
    };

    expect(await exposed({ success: true, data: { systemEncrypted: false, tpm: true } })).toBe(
      true,
    );
    expect(await exposed({ success: true, data: { systemEncrypted: true, tpm: false } })).toBe(
      true,
    );
    expect(await exposed({ success: true, data: { systemEncrypted: true, tpm: true } })).toBe(
      false,
    );
    expect(await exposed({ success: true, data: { systemEncrypted: null, tpm: null } })).toBe(
      false,
    );
    expect(await exposed({ success: true, data: 'nothing' })).toBe(false);
    expect(await exposed({ success: false, error: 'unknown request' })).toBe(false);
  });

  it('knows a connection where a password may be typed', () => {
    vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: false });
    vi.stubGlobal('location', { protocol: 'http:', hostname: 'nas.local' });
    expect(useDiskEncryption(t, vi.fn()).secure).toBe(false);
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'nas.local' });
    expect(useDiskEncryption(t, vi.fn()).secure).toBe(true);
  });
});
