import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import App from '@/App.vue';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';
import type { NetworkDisks } from '@/types';

const office = {
  id: 'n-0a1b2c3d',
  name: 'Office',
  server: '192.168.1.20',
  share: 'Photos',
  username: 'valerio',
  domain: null,
  automatic: true,
  connected: true,
  held: false,
};

let wrapper: VueWrapper;
let ask: MockInstance<typeof shell.askNasNetworkDisk>;

async function open(listing: NetworkDisks) {
  vi.spyOn(shell, 'readNasNetworkDisks').mockResolvedValue({ success: true, data: listing });
  window.history.replaceState({}, '', '/?lang=en&kind=network');
  wrapper = mount(App);
  await flushPromises();
}

const field = (id: string) => wrapper.get(`[data-testid="${id}"]`);

beforeEach(() => {
  vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: true, data: false });
  vi.spyOn(shell, 'notifyNasShell').mockImplementation(() => {});
  ask = vi.spyOn(shell, 'askNasNetworkDisk').mockResolvedValue({ success: true, data: {} });
});

afterEach(() => {
  wrapper?.unmount();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('the network disks', () => {
  it('says when the NAS does not connect network disks', async () => {
    await open({ available: false, disks: [] });

    expect(field('network_unavailable').text()).toBe(messages.en.smbUnavailable);
    expect(wrapper.find('[data-testid="network_add"]').exists()).toBe(false);
  });

  it('adds a network disk after trying it', async () => {
    await open({ available: true, disks: [] });
    expect(wrapper.text()).toContain(messages.en.smbEmpty);

    await field('network_add').trigger('click');
    expect(field('smb_save').attributes('disabled')).toBeDefined();
    await field('smb_name').setValue(' Office ');
    await field('smb_server').setValue('192.168.1.20');
    await field('smb_share').setValue('Photos');
    await field('smb_user').setValue('valerio');
    await field('smb_password').setValue('secret');
    await field('smb_test').trigger('click');
    await flushPromises();
    expect(ask).toHaveBeenCalledWith({
      op: 'networkTest',
      server: '192.168.1.20',
      share: 'Photos',
      username: 'valerio',
      domain: undefined,
      password: 'secret',
    });
    expect(field('smb_tested').text()).toBe(messages.en.smbTestOk);

    await field('network_form').trigger('submit');
    await flushPromises();
    expect(ask).toHaveBeenLastCalledWith({
      op: 'networkSave',
      id: undefined,
      name: 'Office',
      server: '192.168.1.20',
      share: 'Photos',
      username: 'valerio',
      domain: undefined,
      password: 'secret',
      automatic: true,
    });
    expect(wrapper.find('[data-testid="network_form"]').exists()).toBe(false);
    expect(shell.notifyNasShell).toHaveBeenCalledWith(messages.en.smbSaved, '', 'success');
  });

  it('disconnects, changes without a new password and forgets a disk', async () => {
    await open({ available: true, disks: [office] });
    const row = () => field(`network_${office.id}`);
    expect(row().text()).toContain('//192.168.1.20/Photos');
    expect(row().text()).toContain(messages.en.smbConnected);

    await row().findAll('button')[0]!.trigger('click');
    await flushPromises();
    expect(ask).toHaveBeenCalledWith({ op: 'networkDisconnect', id: office.id });

    await row().findAll('button')[1]!.trigger('click');
    expect((field('smb_name').element as HTMLInputElement).value).toBe('Office');
    expect(field('smb_save').attributes('disabled')).toBeUndefined();
    await field('network_form').trigger('submit');
    await flushPromises();
    expect(ask).toHaveBeenLastCalledWith(
      expect.objectContaining({ op: 'networkSave', id: office.id, password: undefined }),
    );

    await row().findAll('button')[2]!.trigger('click');
    expect(field('network_forget').text()).toContain('Remove Office?');
    await field('network_forget').get('.danger_button').trigger('click');
    await flushPromises();
    expect(ask).toHaveBeenLastCalledWith({ op: 'networkForget', id: office.id });
  });

  it('shows why a request failed', async () => {
    ask.mockResolvedValueOnce({ success: false, error: '192.168.1.20 is not reachable' });
    await open({ available: true, disks: [{ ...office, connected: false }] });

    await field(`network_${office.id}`).findAll('button')[0]!.trigger('click');
    await flushPromises();

    expect(ask).toHaveBeenCalledWith({ op: 'networkConnect', id: office.id });
    expect(wrapper.get('[role="alert"]').text()).toBe('192.168.1.20 is not reachable');
  });
});
