import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, computed, h, nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { useDiskInventory } from '@/composables/useDiskInventory';
import { messages, type Locale } from '@/i18n';
import type { Disk } from '@/types';

const disk: Disk = {
  id: 'disk-1',
  name: 'System drive',
  device: '/dev/sda',
  kind: 'local',
  disk_type: 'SSD',
  size_bytes: 1_000_000_000,
  mount: '/',
  filesystem: 'ext4',
  model: 'Sample model',
  transport: 'SATA',
  removable: false,
  read_only: false,
  initializable: false,
  parent: null,
  source: null,
  uuid: null,
};

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

let wrapper: VueWrapper | undefined;
let inventory: ReturnType<typeof useDiskInventory> | undefined;

function mountInventory() {
  const Host = defineComponent({
    setup() {
      const locale = ref<Locale>('en');
      inventory = useDiskInventory(
        locale,
        computed(() => messages[locale.value]),
      );
      return () => h('div');
    },
  });
  wrapper = mount(Host);
  return inventory!;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  inventory = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useDiskInventory', () => {
  it('opens on the section named by the kind query and ignores unknown ones', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal('fetch', fetcher);
    window.history.replaceState({}, '', '/?kind=network');
    expect(mountInventory().kind.value).toBe('network');
    await flushPromises();
    expect(fetcher).toHaveBeenCalledWith('api/disks?kind=network', expect.anything());
    wrapper?.unmount();
    window.history.replaceState({}, '', '/?kind=floppy');
    expect(mountInventory().kind.value).toBe('local');
    window.history.replaceState({}, '', '/');
  });

  it('uses the generic message for non-Error fetch failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'));
    const state = mountInventory();
    await flushPromises();

    expect(state.error.value).toBe(messages.en.genericError);
    expect(state.loading.value).toBe(false);
  });

  it('uses the response status if a failed response has no message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 503)));
    const state = mountInventory();
    await flushPromises();

    expect(state.error.value).toBe('503');
    expect(state.loading.value).toBe(false);
  });

  it('ignores an aborted request when a newer refresh replaces it', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      )
      .mockResolvedValueOnce(response([disk]));
    vi.stubGlobal('fetch', fetchMock);
    const state = mountInventory();
    await nextTick();

    await state.refresh();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.error.value).toBe('');
    expect(state.disks.value).toEqual([disk]);
    expect(state.loading.value).toBe(false);
  });
  it('refreshes periodically, preserves existing selection, and stops polling on unmount', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(response([disk]));
    vi.stubGlobal('fetch', fetchMock);
    const state = mountInventory();
    await vi.advanceTimersByTimeAsync(0);
    state.selected.value = disk.id;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.selected.value).toBe(disk.id);
    wrapper?.unmount();
    wrapper = undefined;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
