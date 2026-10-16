import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import App from '@/App.vue';
import { messages } from '@/i18n';
import type { Disk } from '@/types';
import * as shell from '@/services/nasShell';

const localDisk: Disk = {
  id: 'disk-1',
  name: 'System drive',
  device: '/dev/sda',
  kind: 'local',
  disk_type: 'SSD',
  size_bytes: 500_000_000_000,
  mount: '/data',
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

const unmountedDisk: Disk = {
  ...localDisk,
  id: 'disk-2',
  name: 'Backup drive',
  mount: null,
  device: null,
  source: '/backup',
  filesystem: null,
  read_only: true,
  initializable: false,
};

const externalDisk: Disk = {
  ...localDisk,
  id: 'usb-1',
  name: 'External backup',
  device: '/dev/sdb1',
  kind: 'external',
  disk_type: 'part',
  mount: '/run/media/backup',
  transport: 'usb',
  removable: true,
  parent: 'sdb',
};

function listing(data: unknown): shell.DiskAnswer {
  return { success: true, data };
}

const mounted: Array<ReturnType<typeof mount>> = [];
function mountApp() {
  const wrapper = mount(App);
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/apps/nas-disk-manager/?lang=en&theme=light');
  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.removeProperty('--accent');
  vi.stubGlobal('CSS', { supports: vi.fn().mockReturnValue(true) });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('nas-disk-manager components', () => {
  it('renders the disk inventory, summary, details, and SVG icons', async () => {
    const read = vi
      .spyOn(shell, 'readNasDisks')
      .mockResolvedValue(listing([localDisk, unmountedDisk]));
    const wrapper = mountApp();
    await flushPromises();

    expect(read).toHaveBeenCalledWith('local');
    expect(wrapper.find('h1').text()).toBe(messages.en.kinds.local);
    expect(wrapper.find('.summary').text()).toContain(`${messages.en.sataDisks}2`);
    // Two disks, one of them mounted: one active, two in all.
    expect(wrapper.get('[data-testid="active_disks"]').text()).toBe('1');
    expect(wrapper.find('.summary').text()).toContain(messages.en.activeDisks);
    expect(wrapper.get('[data-testid="disk_total"]').text()).toBe('Total disks 2');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.text()).toContain('500 GB');
    expect(wrapper.text()).toContain(messages.en.unmounted);
    // The table says whether a disk is mounted; where, only the details do.
    const [mounted, unmounted] = wrapper.findAll('tbody tr').map((row) => row.text());
    expect(mounted).toContain(messages.en.active);
    expect(mounted).not.toContain('/data');
    expect(unmounted).toContain(messages.en.unmounted);
    expect(wrapper.find('thead').text()).toContain(messages.en.status);
    expect(wrapper.findAll('.app_icon').length).toBeGreaterThan(4);

    await wrapper.findAll('[title="Details"]')[1]!.trigger('click');
    expect(wrapper.find('.detail_card').text()).toContain('Backup drive');
    expect(wrapper.find('.detail_card').text()).toContain('/backup');
    expect(wrapper.find('.detail_card').text()).toContain(messages.en.readOnlyLabel);
    await wrapper.find('.close').trigger('click');
    expect(wrapper.find('.detail_card').exists()).toBe(false);
  });

  it('shows mounted disk fields and fallbacks for missing metadata', async () => {
    const missingMetadata: Disk = {
      ...unmountedDisk,
      id: 'disk-3',
      name: 'Unidentified drive',
      source: null,
      transport: null,
      model: null,
      size_bytes: 0,
    };
    vi.spyOn(shell, 'readNasDisks').mockResolvedValue(listing([localDisk, missingMetadata]));
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.findAll('[title="Details"]')[0]!.trigger('click');
    const mountedDetails = wrapper.find('.detail_card').text();
    expect(mountedDetails).toContain('/dev/sda');
    expect(mountedDetails).toContain('/data');
    expect(mountedDetails).toContain('ext4');
    expect(mountedDetails).toContain('SATA');
    expect(mountedDetails).toContain('Sample model');
    expect(mountedDetails).toContain(messages.en.readWrite);
    expect(mountedDetails).toContain(messages.en.active);

    await wrapper.findAll('[title="Details"]')[1]!.trigger('click');
    expect(wrapper.find('.detail_card').text()).toContain('Unidentified drive');
    // A value the drive does not report is shown as a dash, not left blank.
    expect(wrapper.findAll('.detail_card dd').map((value) => value.text())).toContain('-');
    expect(wrapper.findAll('tbody tr')[1]!.text()).toContain('disk-3');
  });

  it('sums up a disk in its details with its state, connection and identity', async () => {
    const encrypted: Disk = {
      ...localDisk,
      transport: 'nvme',
      uuid: '1234-abcd',
      read_only: true,
      system_disk: true,
      encryption: 'locked',
    };
    vi.spyOn(shell, 'readNasDisks').mockResolvedValue(listing([encrypted]));
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[title="Details"]').trigger('click');
    const summary = wrapper.get('[data-testid="disk_summary"]').text();
    for (const text of [
      '500 GB',
      messages.en.lockedStatus,
      messages.en.readOnlyLabel,
      messages.en.encryptedType,
      messages.en.systemDisk,
    ]) {
      expect(summary).toContain(text);
    }
    const details = wrapper.get('.detail_card').text();
    expect(details).toContain('NVMe');
    expect(details).toContain('1234-abcd');
  });

  it('requires the device name before enabling destructive initialization', async () => {
    const emptyDisk: Disk = {
      ...unmountedDisk,
      id: 'sdb',
      name: 'Empty disk',
      device: '/dev/sdb',
      source: null,
      read_only: false,
      initializable: true,
      identity: 'wwn/S1/1024',
    };
    vi.spyOn(shell, 'readNasDisks').mockResolvedValue(listing([emptyDisk]));
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('[title="Details"]').trigger('click');
    await wrapper.findAll('[role="tab"]')[2]!.trigger('click');
    await wrapper.find('.danger_button').trigger('click');
    const confirm = wrapper.findAll('.modal input')[1]!;
    const submit = wrapper.find('.confirmation_modal .danger_button');
    expect(submit.attributes('disabled')).toBeDefined();
    await confirm.setValue('sdb');
    expect(submit.attributes('disabled')).toBeUndefined();
  });

  it('switches categories and shows empty and server error states', async () => {
    const read = vi
      .spyOn(shell, 'readNasDisks')
      .mockImplementation(async (kind) => listing(kind === 'external' ? [externalDisk] : []));
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find('.empty').text()).toBe(messages.en.empty);

    await wrapper.findAll('.nav_item')[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe(messages.en.kinds.external);
    expect(read).toHaveBeenCalledWith('external');
    expect(wrapper.find('.summary').exists()).toBe(false);
    expect(wrapper.find('[data-testid="external_devices_menu"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="external_total"]').text()).toBe('Total external devices 1');
    expect(wrapper.find('.card_heading span').exists()).toBe(false);

    await wrapper.get('[title="Details"]').trigger('click');
    expect(wrapper.get('.detail_card').text()).toContain(externalDisk.name);
    await wrapper.get('.close').trigger('click');

    await wrapper.findAll('.nav_item')[2]!.trigger('click');
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe(messages.en.kinds.network);
    expect(wrapper.find('.summary').exists()).toBe(false);
    expect(wrapper.find('.table_card').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('disables refresh while loading and reports an invalid response', async () => {
    let resolveFirst!: (value: shell.DiskAnswer) => void;
    vi.spyOn(shell, 'readNasDisks')
      .mockImplementationOnce(
        () =>
          new Promise<shell.DiskAnswer>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(listing({ unexpected: true }));
    const wrapper = mountApp();
    await nextTick();
    expect(wrapper.find('.refresh').attributes('disabled')).toBeDefined();
    expect(wrapper.find('output').text()).toBe(messages.en.loading);

    resolveFirst(listing([localDisk]));
    await flushPromises();
    expect(wrapper.find('.refresh').attributes('disabled')).toBeUndefined();
    await wrapper.find('.refresh').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe(messages.en.invalidResponse);
  });

  it('updates the shell theme and locale only for valid context messages', async () => {
    const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
    const parent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { configurable: true, value: parent });
    vi.spyOn(shell, 'readNasDisks').mockResolvedValue(listing([localDisk]));
    const wrapper = mountApp();
    await flushPromises();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: parent as unknown as Window,
        origin: 'file://invalid',
        data: { nas: 1, type: 'context', context: { locale: 'it', theme: 'dark' } },
      }),
    );
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe(messages.en.kinds.local);

    const valid = new MessageEvent('message', {
      origin: window.location.origin,
      data: {
        nas: 1,
        type: 'context',
        context: { app: 'nas-disk-manager', locale: 'it', theme: 'dark', accent: '#123456' },
      },
    });
    Object.defineProperty(valid, 'source', { value: parent });
    window.dispatchEvent(valid);
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe(messages.it.kinds.local);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#123456');

    await wrapper.findAll('.nav_item')[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe(messages.it.kinds.external);
    if (originalParent) {
      Object.defineProperty(window, 'parent', originalParent);
    }
  });
});
