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

async function show(entries: Disk[], row = 0) {
  vi.spyOn(shell, 'readNasDisks').mockResolvedValue({ success: true, data: entries });
  wrapper = mount(App);
  await flushPromises();
  await wrapper.findAll('[title="Details"]')[row]!.trigger('click');
  await wrapper.findAll('[role="tab"]')[2]!.trigger('click');
}

async function open(overrides: Partial<Disk> = {}, keys: Partial<DiskKeys> = {}) {
  await show([{ ...container, ...overrides, keys: { ...container.keys!, ...keys } }]);
}

/** An internal ext4 disk without encryption. */
const plainDisk = (overrides: Partial<Disk> = {}): Disk => ({
  ...container,
  filesystem: 'ext4',
  uuid: 'data-1',
  encryption: null,
  keys: null,
  ...overrides,
});

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

  it('unlocks a locked volume with the automatic key, without a password', async () => {
    await open({ encryption: 'locked' }, { automatic: true, held: true });

    await field('unlock_automatic').trigger('click');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({ op: 'unlock', uuid: 'luks-1' });
    expect(shell.notifyNasShell).toHaveBeenCalledWith(
      messages.en.unlocked,
      messages.en.unlockedMessage,
      'success',
    );
  });

  it('offers the automatic unlock of a locked volume only when it has the automatic key', async () => {
    await open({ encryption: 'locked' });

    expect(wrapper.find('[data-testid="unlock_automatic"]').exists()).toBe(false);
  });

  it('shows which keys open the volume', async () => {
    await open({}, { recovery: true });

    expect(field('key_password').text()).toBe(messages.en.keySet);
    expect(field('key_recovery').text()).toBe(messages.en.keySet);
    expect(field('key_automatic').text()).toBe(messages.en.keyOff);
  });

  it('turns the automatic unlock on with the current password', async () => {
    await open();
    expect(wrapper.find('[data-testid="no_spare_key"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(messages.en.automaticUnlockOff);
    expect(field('automatic_on').attributes('disabled')).toBeDefined();

    await field('automatic_current').setValue('the current one');
    await field('automatic_on').element.closest('form')!.dispatchEvent(new Event('submit'));
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({
      op: 'automatic',
      uuid: 'luks-1',
      enabled: true,
      password: 'the current one',
    });
    expect(shell.notifyNasShell).toHaveBeenCalledWith(
      messages.en.automaticOnSaved,
      messages.en.automaticOnMessage,
      'success',
    );
  });

  it('turns the automatic unlock off while another key opens the volume', async () => {
    await open({}, { automatic: true });
    expect(wrapper.text()).toContain(messages.en.automaticUnlockOn);

    await field('automatic_off').trigger('click');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({ op: 'automatic', uuid: 'luks-1', enabled: false });
  });

  it('keeps the automatic unlock while it is the only key of the volume', async () => {
    await open({}, { password: false, automatic: true });

    expect(field('automatic_needs_key').text()).toBe(messages.en.automaticNeedsKey);
    expect(field('automatic_off').attributes('disabled')).toBeDefined();
  });

  it('changes the password only with the current one', async () => {
    await open({}, { automatic: true });
    expect(wrapper.text()).toContain(messages.en.changePassword);
    const save = field('save_password');

    await field('new_password').setValue('a new password');
    await field('repeat_password').setValue('a new password');
    expect(save.attributes('disabled')).toBeDefined();
    await field('password_current').setValue('the old password');
    expect(save.attributes('disabled')).toBeUndefined();
    await field('password_form').trigger('submit');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({
      op: 'password',
      uuid: 'luks-1',
      current: 'the old password',
      password: 'a new password',
    });
  });

  it('says what the automatic key is worth when the system disk is not protected', async () => {
    const security = vi.spyOn(shell, 'readNasDiskSecurity');
    security.mockResolvedValue({ success: true, data: { systemEncrypted: true, tpm: true } });
    await open({}, { automatic: true });
    expect(wrapper.find('[data-testid="automatic_exposed"]').exists()).toBe(false);
    wrapper.unmount();

    security.mockResolvedValue({ success: true, data: { systemEncrypted: false, tpm: false } });
    await open({}, { automatic: true });
    expect(field('automatic_exposed').text()).toBe(messages.en.automaticExposed);
    wrapper.unmount();

    await open({}, { automatic: false });
    expect(wrapper.find('[data-testid="automatic_exposed"]').exists()).toBe(false);
  });

  it('sets a password with the automatic key, once typed twice', async () => {
    await open({}, { password: false, automatic: true });
    expect(field('no_spare_key').text()).toBe(messages.en.noSpareKey);
    expect(wrapper.find('[data-testid="password_current"]').exists()).toBe(false);
    const save = field('save_password');

    await field('new_password').setValue('a new password');
    await field('repeat_password').setValue('another one');
    expect(save.attributes('disabled')).toBeDefined();
    expect(field('passwords_differ').text()).toBe(messages.en.passwordsDiffer);
    await field('repeat_password').setValue('a new password');
    await field('password_form').trigger('submit');
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

    expect(field('make_recovery').attributes('disabled')).toBeDefined();
    await field('recovery_current').setValue('the password');
    await field('make_recovery').element.closest('form')!.dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(ask).toHaveBeenCalledWith({ op: 'recovery', uuid: 'luks-1', current: 'the password' });
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
    await show([plainDisk()]);
    await wrapper.get('[data-testid="format_section"] .danger_button').trigger('click');
    const modal = () => wrapper.get('.confirmation_modal');
    expect(modal().text()).toContain('/dev/sdb');

    await field('encrypt').setValue(true);
    await modal().findAll('input').at(-1)!.setValue('sdb');
    expect(modal().get('.danger_button').attributes('disabled')).toBeDefined();
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

  it('encrypts an internal disk from its own section, with the password chosen', async () => {
    await show([plainDisk()]);
    expect(field('encrypt_section').text()).toContain(messages.en.encryptDiskDescription);

    await field('encrypt_disk').trigger('click');
    const modal = () => wrapper.get('.confirmation_modal');
    expect((field('encrypt').element as HTMLInputElement).checked).toBe(true);
    await field('erase_password').setValue('a long password');
    await field('erase_repeat').setValue('a long password');
    await field('erase_automatic').setValue(false);
    await modal().findAll('input').at(-1)!.setValue('sdb');
    await modal().get('.danger_button').trigger('click');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({
      op: 'format',
      device: 'sdb',
      identity: 'wwn/S1/1024',
      label: 'Data-sdb',
      encrypt: true,
      automatic: false,
      password: 'a long password',
    });
  });

  it('never offers to encrypt a removable disk', async () => {
    await show([plainDisk({ removable: true })]);

    expect(wrapper.find('[data-testid="encrypt_section"]').exists()).toBe(false);
    await wrapper.get('[data-testid="format_section"] .danger_button').trigger('click');
    expect(wrapper.find('[data-testid="encrypt"]').exists()).toBe(false);
  });

  it('shows the keys of the container from the open volume inside it', async () => {
    const inside = plainDisk({
      id: 'luks-luks-1',
      name: 'Vault',
      device: '/dev/mapper/luks-luks-1',
      disk_type: 'crypt',
      parent: 'sdb1',
      mount: '/srv/nas/Vault',
    });
    await show([container, inside], 1);

    expect(field('encryption_section').text()).toContain(messages.en.encryptionOpen);
    expect(wrapper.find('[data-testid="encrypt_section"]').exists()).toBe(false);
  });

  it('asks for the key of a locked volume before formatting its disk', async () => {
    await open({ encryption: 'locked' });
    await wrapper.get('[data-testid="format_section"] .danger_button').trigger('click');
    const modal = () => wrapper.get('.confirmation_modal');
    expect(field('locked_volume_note').text()).toBe(messages.en.lockedVolumeNote);

    await modal().findAll('input').at(-1)!.setValue('sdb');
    expect(modal().get('.danger_button').attributes('disabled')).toBeDefined();
    await field('locked_key').setValue('short');
    expect(modal().get('.danger_button').attributes('disabled')).toBeDefined();
    await field('locked_key').setValue('the password of sdb1');
    await modal().get('.danger_button').trigger('click');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({
      op: 'format',
      device: 'sdb',
      identity: 'wwn/S1/1024',
      label: 'Data-sdb',
      encrypt: false,
      automatic: false,
      current: 'the password of sdb1',
    });
  });

  it('formats without a key a locked volume that has only the automatic key', async () => {
    await open({ encryption: 'locked' }, { password: false, automatic: true, held: true });
    await wrapper.get('[data-testid="format_section"] .danger_button').trigger('click');

    expect(wrapper.find('[data-testid="locked_key"]').exists()).toBe(false);
    await wrapper.get('.confirmation_modal').findAll('input').at(-1)!.setValue('sdb');
    expect(
      wrapper.get('.confirmation_modal .danger_button').attributes('disabled'),
    ).toBeUndefined();
  });

  it('says the key of a locked volume is typed only over HTTPS', async () => {
    vi.stubGlobal('location', { ...window.location, protocol: 'http:', hostname: 'nas.local' });
    await open({ encryption: 'locked' });
    await wrapper.get('[data-testid="format_section"] .danger_button').trigger('click');

    expect(wrapper.get('.confirmation_modal').text()).toContain(messages.en.encryptionNeedsHttps);
    expect(field('locked_key').attributes('disabled')).toBeDefined();
  });
});
