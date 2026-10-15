import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import App from '@/App.vue';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';
import type { Disk } from '@/types';

const disk: Disk = {
  id: 'sdb1',
  name: 'Archive',
  device: '/dev/sdb1',
  kind: 'local',
  disk_type: 'SSD',
  size_bytes: 500_000_000_000,
  mount: null,
  filesystem: 'ext4',
  model: null,
  transport: 'SATA',
  removable: false,
  read_only: false,
  initializable: false,
  parent: 'sdb',
  source: null,
  uuid: null,
};
let wrapper: VueWrapper;
let readDisks: MockInstance<typeof shell.readNasDisks>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function openDetails(overrides: Partial<Disk> = {}) {
  readDisks.mockResolvedValue({ success: true, data: [{ ...disk, ...overrides }] });
  wrapper = mount(App);
  await flushPromises();
  await wrapper.get('[title="Details"]').trigger('click');
}
async function tab(index: number) {
  await wrapper.findAll('[role="tab"]')[index]!.trigger('click');
}
async function openInitialization() {
  await openDetails({
    id: 'sdb',
    parent: null,
    filesystem: null,
    initializable: true,
    identity: 'wwn/S1/1024',
  });
  await tab(2);
  await wrapper.get('.danger_button').trigger('click');
}

beforeEach(() => {
  window.history.replaceState({}, '', '/?lang=en');
  readDisks = vi.spyOn(shell, 'readNasDisks');
  vi.spyOn(shell, 'notifyNasShell').mockImplementation(() => {});
});
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('disk details operations', () => {
  it('loads SMART for the parent disk and caches the result when switching tabs', async () => {
    const pending = deferred<Awaited<ReturnType<typeof shell.readNasDiskSmart>>>();
    const read = vi.spyOn(shell, 'readNasDiskSmart').mockReturnValue(pending.promise);
    await openDetails();
    await tab(1);
    expect(wrapper.get('[role="tabpanel"]').text()).toBe(messages.en.smartLoading);
    expect(wrapper.get('output.app_loading').text()).toBe(messages.en.smartLoading);
    expect(wrapper.find('output.app_loading [aria-hidden="true"]').exists()).toBe(true);
    await tab(0);
    await tab(1);
    expect(read).toHaveBeenCalledExactlyOnceWith('sdb');
    const data = {
      smart_status: { passed: true },
      temperature: { current: 32 },
      power_on_time: { hours: 1234 },
      power_cycle_count: 42,
    };
    pending.resolve({ success: true, data });
    await flushPromises();
    expect(wrapper.findAll('.smart_panel dd').map((item) => item.text())).toEqual([
      messages.en.smartPassed,
      '32 °C',
      '1234',
      '42',
    ]);
    expect(JSON.parse(wrapper.get('pre').text())).toEqual(data);
    await tab(0);
    await tab(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('shows failed SMART health and omits absent or malformed metrics', async () => {
    vi.spyOn(shell, 'readNasDiskSmart').mockResolvedValue({
      success: true,
      data: { smart_status: { passed: false }, temperature: null, power_on_time: 3 },
    });
    await openDetails({ parent: null });
    await tab(1);
    await flushPromises();
    expect(shell.readNasDiskSmart).toHaveBeenCalledWith('sdb1');
    expect(wrapper.findAll('.smart_panel dd').map((item) => item.text())).toEqual([
      messages.en.smartFailed,
    ]);
  });

  it.each([
    [{ success: false, error: 'SMART unavailable' }, 'SMART unavailable'],
    [{ success: false }, messages.en.smartUnavailable],
    [{ success: true, data: 'invalid' }, messages.en.smartUnavailable],
  ])('reports SMART errors and allows retry: %j', async (result, message) => {
    const read = vi
      .spyOn(shell, 'readNasDiskSmart')
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce({ success: true, data: {} });
    await openDetails();
    await tab(1);
    await flushPromises();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.get('h3').text()).toBe(messages.en.smartUnavailableTitle);
    expect(alert.get('p').text()).toBe(message);
    await tab(1);
    await flushPromises();
    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('.smart_panel dd')).toHaveLength(0);
  });

  it('validates a rename, blocks closing during submission, then refreshes and notifies', async () => {
    const pending = deferred<Awaited<ReturnType<typeof shell.renameNasDisk>>>();
    const rename = vi.spyOn(shell, 'renameNasDisk').mockReturnValue(pending.promise);
    await openDetails();
    await tab(2);
    const form = wrapper.get('form');
    const input = form.get('input');
    expect(form.get('button').attributes('disabled')).toBeDefined();
    await form.trigger('submit');
    await input.setValue('   ');
    await form.trigger('submit');
    expect(rename).not.toHaveBeenCalled();
    await input.setValue(' Backup ');
    await form.trigger('submit');
    expect(rename).toHaveBeenCalledExactlyOnceWith('sdb1', 'Backup');
    expect(form.get('button').text()).toBe(messages.en.renaming);
    expect(input.attributes('disabled')).toBeDefined();
    expect(wrapper.get('.close').attributes('disabled')).toBeDefined();
    await wrapper.get('.details_backdrop').trigger('click');
    await wrapper.get('.details_backdrop').trigger('cancel');
    expect(wrapper.find('.detail_card').exists()).toBe(true);
    pending.resolve({ success: true });
    await flushPromises();
    expect(readDisks).toHaveBeenCalledTimes(2);
    expect(shell.notifyNasShell).toHaveBeenCalledWith(
      messages.en.renameSucceeded,
      messages.en.renameSucceededMessage,
      'success',
    );
    await wrapper.get('.details_backdrop').trigger('click');
    expect(wrapper.find('.detail_card').exists()).toBe(false);
  });

  it.each(['Permission denied', undefined])(
    'reports rename failure and allows retry: %s',
    async (error) => {
      vi.spyOn(shell, 'renameNasDisk').mockResolvedValue({ success: false, error });
      await openDetails();
      await tab(2);
      await wrapper.get('form input').setValue('Backup');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toBe(error ?? messages.en.renameFailed);
      expect(wrapper.get('form button').attributes('disabled')).toBeUndefined();
      expect(readDisks).toHaveBeenCalledTimes(1);
      expect(shell.notifyNasShell).not.toHaveBeenCalled();
    },
  );

  it.each([{ read_only: true }, { filesystem: 'ntfs' }, { device: null }])(
    'hides unavailable disk actions: %j',
    async (overrides) => {
      await openDetails(overrides);
      await tab(2);
      expect(wrapper.get('[role="tabpanel"]').text()).toBe(messages.en.actionsUnavailable);
      expect(wrapper.find('form').exists()).toBe(false);
    },
  );

  it('requires a label and exact device confirmation, and supports cancelling', async () => {
    const initialize = vi.spyOn(shell, 'initializeNasDisk');
    await openInitialization();
    const inputs = wrapper.findAll('.confirmation_modal input');
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('Data-sdb');
    await inputs[1]!.setValue('wrong');
    expect(wrapper.get('.confirmation_modal .danger_button').attributes('disabled')).toBeDefined();
    await inputs[1]!.setValue('sdb');
    await inputs[0]!.setValue(' ');
    expect(wrapper.get('.confirmation_modal .danger_button').attributes('disabled')).toBeDefined();
    await wrapper.get('.details_backdrop').trigger('click');
    expect(wrapper.find('.detail_card').exists()).toBe(true);
    await wrapper.get('.confirmation_modal .secondary_button').trigger('click');
    expect(wrapper.find('.confirmation_modal').exists()).toBe(false);
    await wrapper.get('.danger_button').trigger('click');
    expect(
      (wrapper.findAll('.confirmation_modal input')[1]!.element as HTMLInputElement).value,
    ).toBe('');
    await wrapper.get('.confirmation_backdrop').trigger('click');
    expect(wrapper.find('.confirmation_modal').exists()).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
  });

  it('keeps initialization open while pending, then refreshes and notifies on success', async () => {
    const pending = deferred<Awaited<ReturnType<typeof shell.initializeNasDisk>>>();
    const initialize = vi.spyOn(shell, 'initializeNasDisk').mockReturnValue(pending.promise);
    await openInitialization();
    const inputs = wrapper.findAll('.confirmation_modal input');
    await inputs[0]!.setValue(' Data ');
    await inputs[1]!.setValue('sdb');
    await wrapper.get('.confirmation_modal .danger_button').trigger('click');
    expect(initialize).toHaveBeenCalledExactlyOnceWith('sdb', 'Data', 'wwn/S1/1024');
    expect(wrapper.get('.confirmation_modal .danger_button').text()).toBe(messages.en.initializing);
    expect(
      wrapper.get('.confirmation_modal .secondary_button').attributes('disabled'),
    ).toBeDefined();
    await wrapper.get('.confirmation_backdrop').trigger('click');
    await wrapper.get('.confirmation_backdrop').trigger('cancel');
    await wrapper.get('.details_backdrop').trigger('cancel');
    await wrapper.get('.details_backdrop').trigger('click');
    expect(wrapper.find('.confirmation_modal').exists()).toBe(true);
    expect(wrapper.find('.detail_card').exists()).toBe(true);
    pending.resolve({ success: true });
    await flushPromises();
    expect(readDisks).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.confirmation_modal').exists()).toBe(false);
    expect(shell.notifyNasShell).toHaveBeenCalledWith(
      messages.en.initializeStarted,
      messages.en.initializeStartedMessage,
      'success',
    );
  });

  it.each(['Device busy', undefined])(
    'keeps confirmation open after initialization failure: %s',
    async (error) => {
      vi.spyOn(shell, 'initializeNasDisk').mockResolvedValue({ success: false, error });
      await openInitialization();
      await wrapper.findAll('.confirmation_modal input')[1]!.setValue('sdb');
      await wrapper.get('.confirmation_modal .danger_button').trigger('click');
      await flushPromises();
      expect(wrapper.get('.confirmation_modal [role="alert"]').text()).toBe(
        error ?? messages.en.initializeFailed,
      );
      expect(
        wrapper.get('.confirmation_modal .danger_button').attributes('disabled'),
      ).toBeUndefined();
      expect(readDisks).toHaveBeenCalledTimes(1);
      expect(shell.notifyNasShell).not.toHaveBeenCalled();
    },
  );
  it('opens native dialogs and cancels only the current modal', async () => {
    await openInitialization();
    expect(wrapper.get('dialog.details_backdrop').attributes('open')).toBeDefined();
    expect(wrapper.get('dialog.confirmation_backdrop').attributes('open')).toBeDefined();
    await wrapper.get('.confirmation_backdrop').trigger('cancel');
    expect(wrapper.find('.confirmation_modal').exists()).toBe(false);
    expect(wrapper.find('.detail_card').exists()).toBe(true);
    await wrapper.get('.details_backdrop').trigger('cancel');
    expect(wrapper.find('dialog').exists()).toBe(false);
  });
});

describe('external disks', () => {
  const usb: Partial<Disk> = {
    kind: 'external',
    transport: 'usb',
    removable: true,
    filesystem: 'exfat',
    uuid: 'AB12-CD34',
  };

  async function showExternal(locks: string[] = []) {
    vi.spyOn(shell, 'readNasDiskLocks').mockResolvedValue({ success: true, data: locks });
    readDisks.mockResolvedValue({ success: true, data: [{ ...disk, ...usb }] });
    wrapper = mount(App);
    await flushPromises();
    await wrapper.findAll('.nav_item')[1]!.trigger('click');
    await flushPromises();
  }

  it('marks a disk as not removable, and then refuses to eject it with the reason on hover', async () => {
    const lock = vi
      .spyOn(shell, 'lockNasDisk')
      .mockResolvedValue({ success: true, data: ['ab12-cd34'] });
    const eject = vi.spyOn(shell, 'ejectNasDisk');
    await openDetails(usb);
    await tab(2);

    const button = wrapper.get('[data-testid="eject_selected"]');
    expect(button.attributes('aria-disabled')).toBe('false');
    await wrapper.get('[data-testid="non_removable"]').setValue(true);
    await flushPromises();

    expect(lock).toHaveBeenCalledWith('AB12-CD34', true);
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('title')).toBe(messages.en.ejectLocked);
    await button.trigger('click');
    expect(eject).not.toHaveBeenCalled();
  });

  it('says why a disk cannot be marked, and why a mark was not saved', async () => {
    vi.spyOn(shell, 'lockNasDisk').mockResolvedValue({ success: false });
    await openDetails({ ...usb, uuid: null });
    await tab(2);
    expect(wrapper.find('[data-testid="non_removable"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="removal_section"]').text()).toContain(
      messages.en.nonRemovableUnavailable,
    );
    wrapper.unmount();

    await openDetails(usb);
    await tab(2);
    await wrapper.get('[data-testid="non_removable"]').setValue(true);
    await flushPromises();
    expect(wrapper.get('[data-testid="disk_error"]').text()).toBe(messages.en.lockFailed);
  });

  it('ejects from the details and from the menu of the external devices', async () => {
    const eject = vi.spyOn(shell, 'ejectNasDisk').mockResolvedValue({ success: true });
    await openDetails(usb);
    await tab(2);
    await wrapper.get('[data-testid="eject_selected"]').trigger('click');
    await flushPromises();
    expect(eject).toHaveBeenCalledWith('sdb1');
    expect(shell.notifyNasShell).toHaveBeenCalledWith(
      messages.en.ejected,
      'The device Archive has been ejected and can be safely disconnected.',
      'success',
    );
    wrapper.unmount();

    await showExternal();
    // Escape and the cancel button close the confirmation without ejecting.
    await wrapper.get('[data-testid="eject_sdb1"]').trigger('click');
    await wrapper.get('[data-testid="eject_confirmation"]').trigger('cancel');
    expect(wrapper.find('[data-testid="eject_confirmation"]').exists()).toBe(false);
    await wrapper.get('[data-testid="eject_sdb1"]').trigger('click');
    await wrapper.get('[data-testid="eject_confirmation"] button').trigger('click');
    expect(wrapper.find('[data-testid="eject_confirmation"]').exists()).toBe(false);
    expect(eject).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="eject_sdb1"]').trigger('click');
    expect(wrapper.find('[data-testid="eject_confirmation"]').exists()).toBe(true);
    await wrapper.get('[data-testid="eject_confirm"]').trigger('click');
    await flushPromises();
    expect(eject).toHaveBeenCalledTimes(2);
  });

  it('locks the eject of a marked disk in the menu, and shows a refused ejection', async () => {
    const eject = vi
      .spyOn(shell, 'ejectNasDisk')
      .mockResolvedValue({ success: false, error: 'the disk is busy' });
    await showExternal(['ab12-cd34']);
    const locked = wrapper.get('[data-testid="eject_sdb1"]');
    expect(locked.attributes('aria-disabled')).toBe('true');
    expect(locked.attributes('title')).toBe(messages.en.ejectLocked);
    await locked.trigger('click');
    expect(eject).not.toHaveBeenCalled();
    wrapper.unmount();

    await showExternal();
    await wrapper.get('[data-testid="eject_sdb1"]').trigger('click');
    expect(wrapper.find('[data-testid="eject_confirmation"]').exists()).toBe(true);
    await wrapper.get('[data-testid="eject_confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="disk_error"]').text()).toBe('the disk is busy');
  });
});
