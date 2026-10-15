import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, computed, h, nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { useDiskInventory } from '@/composables/useDiskInventory';
import { messages, type Locale } from '@/i18n';
import type { Disk } from '@/types';
import * as shell from '@/services/nasShell';

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

function answer(data: unknown) {
  return { success: true, data };
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
    const read = vi.spyOn(shell, 'readNasDisks').mockResolvedValue(answer([]));
    window.history.replaceState({}, '', '/?kind=external');
    expect(mountInventory().kind.value).toBe('external');
    await flushPromises();
    expect(read).toHaveBeenCalledWith('external');
    wrapper?.unmount();
    window.history.replaceState({}, '', '/?kind=floppy');
    expect(mountInventory().kind.value).toBe('local');
    window.history.replaceState({}, '', '/');
  });

  it('asks the launcher nothing for the network section', async () => {
    const read = vi.spyOn(shell, 'readNasDisks');
    window.history.replaceState({}, '', '/?kind=network');
    const state = mountInventory();
    await flushPromises();
    window.history.replaceState({}, '', '/');

    expect(read).not.toHaveBeenCalled();
    expect(state.disks.value).toEqual([]);
    expect(state.loading.value).toBe(false);
  });

  it('shows why the launcher could not list the disks', async () => {
    vi.spyOn(shell, 'readNasDisks')
      .mockResolvedValueOnce({ success: false, error: 'Launcher unavailable' })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce(answer({ not: 'a list' }));
    const state = mountInventory();
    await flushPromises();
    expect(state.error.value).toBe('Launcher unavailable');

    await state.refresh();
    expect(state.error.value).toBe(messages.en.genericError);
    await state.refresh();
    expect(state.error.value).toBe(messages.en.invalidResponse);
    expect(state.loading.value).toBe(false);
  });

  it('keeps only the answer of the latest request', async () => {
    let first: (value: shell.DiskAnswer) => void = () => undefined;
    vi.spyOn(shell, 'readNasDisks')
      .mockReturnValueOnce(new Promise((resolve) => (first = resolve)))
      .mockResolvedValueOnce(answer([disk]));
    const state = mountInventory();
    await nextTick();

    await state.refresh();
    first(answer([]));
    await flushPromises();

    expect(state.error.value).toBe('');
    expect(state.disks.value).toEqual([disk]);
    expect(state.loading.value).toBe(false);
  });

  it('refreshes periodically, preserves existing selection, and stops polling on unmount', async () => {
    vi.useFakeTimers();
    const read = vi.spyOn(shell, 'readNasDisks').mockResolvedValue(answer([disk]));
    const state = mountInventory();
    await vi.advanceTimersByTimeAsync(0);
    state.selected.value = disk.id;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(state.selected.value).toBe(disk.id);
    wrapper?.unmount();
    wrapper = undefined;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
