import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ejectNasDisk,
  initializeNasDisk,
  lockNasDisk,
  notifyNasShell,
  readNasDiskLocks,
  readNasDiskSmart,
  renameNasDisk,
} from '@/services/nasShell';

let originalParent: PropertyDescriptor | undefined;
let parent: { postMessage: ReturnType<typeof vi.fn> };

function arrive(data: unknown, origin = window.location.origin, source: unknown = parent) {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: source });
  window.dispatchEvent(event);
}

beforeEach(() => {
  originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  parent = { postMessage: vi.fn() };
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
});

afterEach(() => {
  if (originalParent) {
    Object.defineProperty(window, 'parent', originalParent);
  }
  vi.restoreAllMocks();
});

it('notifies the launcher in its own words', () => {
  notifyNasShell('Disk ejected', 'Data can be removed', 'success');
  expect(parent.postMessage).toHaveBeenCalledWith(
    {
      nas: 1,
      type: 'notify',
      title: 'Disk ejected',
      message: 'Data can be removed',
      tone: 'success',
    },
    window.location.origin,
  );
});

it('resolves disk initialization only after the matching trusted reply', async () => {
  const result = initializeNasDisk('sdb', 'Data-1');
  const request = parent.postMessage.mock.calls[0][0];
  expect(request).toEqual({
    nas: 1,
    type: 'initialize-disk',
    requestId: expect.any(String),
    device: 'sdb',
    label: 'Data-1',
  });
  arrive(
    {
      nas: 1,
      type: 'initialize-disk-result',
      requestId: request.requestId,
      success: true,
      taskId: 'initialize-storage',
    },
    'https://other.example',
  );
  arrive({
    nas: 1,
    type: 'initialize-disk-result',
    requestId: request.requestId,
    success: true,
    taskId: 'initialize-storage',
  });
  await expect(result).resolves.toEqual({
    success: true,
    taskId: 'initialize-storage',
    error: undefined,
  });
});

it('resolves a disk rename only after the matching trusted reply', async () => {
  const result = renameNasDisk('sdb1', 'Archive');
  const request = parent.postMessage.mock.calls[0][0];
  expect(request).toEqual({
    nas: 1,
    type: 'rename-disk',
    requestId: expect.any(String),
    device: 'sdb1',
    label: 'Archive',
  });
  arrive({
    nas: 1,
    type: 'rename-disk-result',
    requestId: request.requestId,
    success: true,
  });
  await expect(result).resolves.toEqual({ success: true, error: undefined });
});

it('returns S.M.A.R.T. data from the matching trusted reply', async () => {
  const result = readNasDiskSmart('sdb');
  const request = parent.postMessage.mock.calls[0][0];
  expect(request).toEqual({
    nas: 1,
    type: 'smart-disk',
    requestId: expect.any(String),
    device: 'sdb',
  });
  arrive({
    nas: 1,
    type: 'smart-disk-result',
    requestId: request.requestId,
    success: true,
    data: { smart_status: { passed: true } },
  });
  await expect(result).resolves.toEqual({
    success: true,
    data: { smart_status: { passed: true } },
    error: undefined,
  });
});

it('asks the shell to eject a disk and to read and change the marks', async () => {
  const ejected = ejectNasDisk('sdb1');
  const locks = readNasDiskLocks();
  const locked = lockNasDisk('ab12-cd34', true);
  const [eject, read, lock] = parent.postMessage.mock.calls.map(([message]) => message);
  expect(eject).toEqual({
    nas: 1,
    type: 'eject-disk',
    requestId: expect.any(String),
    device: 'sdb1',
  });
  expect(read).toEqual({ nas: 1, type: 'disk-locks', requestId: expect.any(String) });
  expect(lock).toEqual({
    nas: 1,
    type: 'lock-disk',
    requestId: expect.any(String),
    uuid: 'ab12-cd34',
    locked: true,
  });

  arrive({
    nas: 1,
    type: 'eject-disk-result',
    requestId: eject.requestId,
    success: false,
    error: 'busy',
  });
  arrive({ nas: 1, type: 'disk-locks-result', requestId: read.requestId, success: true, data: [] });
  arrive({
    nas: 1,
    type: 'lock-disk-result',
    requestId: lock.requestId,
    success: true,
    data: ['ab12-cd34'],
  });

  await expect(ejected).resolves.toEqual({ success: false, error: 'busy', data: undefined });
  await expect(locks).resolves.toEqual({ success: true, data: [], error: undefined });
  await expect(locked).resolves.toEqual({ success: true, data: ['ab12-cd34'], error: undefined });
});

it('answers the disk requests by itself outside the launcher, or when it does not answer', async () => {
  vi.useFakeTimers();
  const late = readNasDiskLocks();
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(late).resolves.toEqual({ success: false, error: 'Launcher unavailable' });
  vi.useRealTimers();

  Object.defineProperty(window, 'parent', { configurable: true, value: window });
  await expect(ejectNasDisk('sdb')).resolves.toEqual({
    success: false,
    error: 'Launcher unavailable',
  });
});
