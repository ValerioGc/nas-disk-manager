import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { useNetworkDisks } from '@/composables/useNetworkDisks';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';

const listing = {
  available: true,
  disks: [
    {
      id: 'n-0a1b2c3d',
      name: 'Office',
      server: '192.168.1.20',
      share: 'Photos',
      username: 'valerio',
      automatic: true,
      connected: true,
      held: false,
    },
  ],
};

function mounted() {
  let api!: ReturnType<typeof useNetworkDisks>;
  mount(
    defineComponent({
      setup() {
        api = useNetworkDisks(computed(() => messages.en));
        return () => h('div');
      },
    }),
  );
  return api;
}

afterEach(() => vi.restoreAllMocks());

describe('useNetworkDisks', () => {
  it('lists the network disks and keeps an answer it cannot read out', async () => {
    const read = vi
      .spyOn(shell, 'readNasNetworkDisks')
      .mockResolvedValueOnce({ success: true, data: listing })
      .mockResolvedValueOnce({ success: true, data: { unexpected: true } });
    const api = mounted();
    await flushPromises();
    expect(api.state.value).toEqual(listing);

    await api.loadNetwork();
    expect(api.state.value).toEqual(listing);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('runs a request, lists again, and says why one failed', async () => {
    vi.spyOn(shell, 'readNasNetworkDisks').mockResolvedValue({ success: true, data: listing });
    const ask = vi
      .spyOn(shell, 'askNasNetworkDisk')
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'the network disk is in use by smbd' })
      .mockResolvedValueOnce({ success: false });
    const api = mounted();
    await flushPromises();

    expect(await api.network({ op: 'networkConnect', id: 'n-0a1b2c3d' })).toBe(true);
    expect(ask).toHaveBeenCalledWith({ op: 'networkConnect', id: 'n-0a1b2c3d' });
    expect(await api.network({ op: 'networkDisconnect', id: 'n-0a1b2c3d' })).toBe(false);
    expect(api.networkError.value).toBe('the network disk is in use by smbd');
    expect(await api.network({ op: 'networkForget', id: 'n-0a1b2c3d' })).toBe(false);
    expect(api.networkError.value).toBe(messages.en.smbFailed);
    expect(api.working.value).toBe(false);
  });
});
