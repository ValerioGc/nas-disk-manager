import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import App from '@/App.vue';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';
import type { Disk, DiskKeys } from '@/types';

const container: Disk = {
  id: 'sdb1',
  name: 'sdb1',
  device: '/dev/sdb1',
  kind: 'local',
  disk_type: 'part',
  size_bytes: 1_000_000_000,
  mount: null,
  filesystem: 'crypto_LUKS',
  model: null,
  transport: 'sata',
  removable: false,
  read_only: false,
  initializable: false,
  parent: 'sdb',
  uuid: 'luks-1',
  system_disk: false,
  identity: 'wwn/S1/1024',
  encryption: 'open',
  keys: { password: true, automatic: false, recovery: false, held: false },
};

let wrapper: VueWrapper;
let ask: MockInstance<typeof shell.askNasDiskCrypt>;

async function open(overrides: Partial<Disk> = {}, keys: Partial<DiskKeys> = {}) {
  vi.spyOn(shell, 'readNasDisks').mockResolvedValue({
    success: true,
    data: [{ ...container, ...overrides, keys: { ...container.keys, ...keys } }],
  });
  wrapper = mount(App);
  await flushPromises();
  await wrapper.get('[title="Details"]').trigger('click');
  await wrapper.findAll('[role="tab"]')[2]!.trigger('click');
}

const field = (id: string) => wrapper.get(`[data-testid="${id}"]`);

beforeEach(() => {
  window.history.replaceState({}, '', '/?lang=en');
  vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: true, data: true });
  vi.spyOn(shell, 'notifyNasShell').mockImplementation(() => {});
  ask = vi.spyOn(shell, 'askNasDiskCrypt').mockResolvedValue({ success: true, data: {} });
});

afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('an encrypted volume', () => {
  it('unlocks a locked volume with its password', async () => {
    await open({ encryption: 'locked' });
    expect(wrapper.text()).toContain(messages.en.encryptionLocked);
    const unlock = wrapper.get('form button[type="submit"]');
    expect(unlock.attributes('disabled')).toBeDefined();

    await field('unlock_password').setValue('long enough');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({ op: 'unlock', uuid: 'luks-1', password: 'long enough' });
    expect(shell.notifyNasShell).toHaveBeenCalledWith(
      messages.en.unlocked,
      messages.en.unlockedMessage,
      'success',
    );
  });

  it('locks an open volume and says why it could not', async () => {
    ask.mockResolvedValueOnce({ success: false, error: 'the volume is in use by smbd.service' });
    await open();

    await field('lock_volume').trigger('click');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({ op: 'lock', uuid: 'luks-1' });
    expect(wrapper.get('[role="alert"]').text()).toBe('the volume is in use by smbd.service');
  });

  it('turns the automatic unlock on with the current password', async () => {
    await open();
    expect(wrapper.find('[data-testid="no_spare_key"]').exists()).toBe(false);
    expect(field('automatic_unlock').attributes('disabled')).toBeDefined();

    await field('current_key').setValue('the current one');
    await field('automatic_unlock').setValue(true);
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({
      op: 'automatic',
      uuid: 'luks-1',
      enabled: true,
      password: 'the current one',
    });
  });

  it('sets a password with the automatic key, once typed twice', async () => {
    await open({}, { password: false, automatic: true });
    expect(field('no_spare_key').text()).toBe(messages.en.noSpareKey);
    const save = wrapper.findAll('form button[type="submit"]')[0]!;

    await field('new_password').setValue('a new password');
    await field('repeat_password').setValue('another one');
    expect(save.attributes('disabled')).toBeDefined();
    await field('repeat_password').setValue('a new password');
    await save.element.closest('form')!.dispatchEvent(new Event('submit'));
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({
      op: 'password',
      uuid: 'luks-1',
      current: undefined,
      password: 'a new password',
    });
    expect(shell.notifyNasShell).toHaveBeenCalledWith(messages.en.passwordSaved, '', 'success');
  });

  it('shows a new recovery key once and saves it and the header as files', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:file');
    URL.revokeObjectURL = vi.fn();
    ask
      .mockResolvedValueOnce({ success: true, data: { recovery: '0a1b2c3d-4e5f6071' } })
      .mockResolvedValueOnce({ success: true, data: { header: 'TFVLUw==' } });
    await open({}, { automatic: true });

    await field('make_recovery').trigger('click');
    await flushPromises();
    expect(ask).toHaveBeenCalledWith({ op: 'recovery', uuid: 'luks-1', current: undefined });
    expect(field('recovery_key').text()).toContain('0a1b2c3d-4e5f6071');
    await field('recovery_key').get('button').trigger('click');

    await field('save_header').trigger('click');
    await flushPromises();
    expect(ask).toHaveBeenCalledWith({ op: 'header', uuid: 'luks-1' });
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('keeps every password field closed on plain HTTP', async () => {
    vi.stubGlobal('location', { ...window.location, protocol: 'http:', hostname: 'nas.local' });
    await open({ encryption: 'locked' });

    expect(field('needs_https').text()).toBe(messages.en.encryptionNeedsHttps);
    expect(field('unlock_password').attributes('disabled')).toBeDefined();
  });

  it('formats a data disk with encryption from its volume', async () => {
    await open({ encryption: null, filesystem: 'ext4', uuid: 'data-1', keys: null });
    await wrapper.get('[data-testid="format_section"] .danger_button').trigger('click');
    const modal = () => wrapper.get('.confirmation_modal');
    expect(modal().text()).toContain('/dev/sdb');

    await field('encrypt').setValue(true);
    await field('erase_password').setValue('a long password');
    await field('erase_repeat').setValue('a long password');
    await modal().findAll('input').at(-1)!.setValue('sdb');
    await modal().get('.danger_button').trigger('click');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({
      op: 'format',
      device: 'sdb',
      identity: 'wwn/S1/1024',
      label: 'Data-sdb',
      encrypt: true,
      automatic: true,
      password: 'a long password',
    });
    expect(wrapper.find('.confirmation_modal').exists()).toBe(false);
  });
});
