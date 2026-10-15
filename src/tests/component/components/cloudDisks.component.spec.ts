import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import App from '@/App.vue';
import { messages } from '@/i18n';
import * as shell from '@/services/nasShell';
import cloud from '@/assets/icons/cloud.svg?url';

let wrapper: VueWrapper;

afterEach(() => {
  wrapper?.unmount();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('the cloud disks', () => {
  it.each(['en', 'it'] as const)(
    'opens the cloud section in %s from the sidebar',
    async (locale) => {
      const t = messages[locale];
      vi.spyOn(shell, 'readNasDisks').mockResolvedValue({ success: true, data: [] });
      vi.spyOn(shell, 'readNasDiskEncryption').mockResolvedValue({ success: true, data: false });
      window.history.replaceState({}, '', `/?lang=${locale}`);
      wrapper = mount(App);
      await flushPromises();

      const cloudTab = wrapper.findAll('.nav_item').find((item) => item.text() === t.kinds.cloud)!;
      await cloudTab.trigger('click');
      await flushPromises();

      expect(cloudTab.attributes('aria-current')).toBe('page');
      expect(wrapper.get('h1').text()).toBe(t.kinds.cloud);
      const intro = wrapper.get('[data-testid="cloud_intro"]');
      expect(intro.attributes('aria-label')).toBe(t.kinds.cloud);
      expect(intro.get('h2').text()).toBe(t.kinds.cloud);
      expect(intro.findAll('p').map((paragraph) => paragraph.text())).toEqual([
        t.networkIntro,
        t.networkBackup,
      ]);
      expect(intro.get('.network_icon').attributes('style')).toContain(cloud);
      expect(intro.get('[data-testid="cloud_add"]').text()).toBe(t.networkAdd);
    },
  );
});
