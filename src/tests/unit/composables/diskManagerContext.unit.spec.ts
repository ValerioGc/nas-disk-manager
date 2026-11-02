import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useDiskManager } from '@/composables/diskManagerContext';

describe('useDiskManager', () => {
  it('throws when there is no provider in the component tree', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Consumer = defineComponent({
      setup() {
        useDiskManager();
        return () => h('div');
      },
    });

    expect(() => mount(Consumer)).toThrow('Disk manager context is missing');
    warn.mockRestore();
  });
});
