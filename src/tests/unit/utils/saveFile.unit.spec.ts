import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile } from '@/utils/saveFile';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('saveFile', () => {
  it('hands the bytes to the browser as a file, then releases them', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:key');
    URL.revokeObjectURL = vi.fn();

    saveFile('recovery.txt', 'key', 'text/plain');

    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:key');
  });
});
