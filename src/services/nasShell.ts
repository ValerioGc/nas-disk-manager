import { createNasShell, type NotificationTone } from '@valeriogc/nas-base-app';

/** The answer of the launcher to a request about a disk. */
export interface DiskAnswer {
  success: boolean;
  data?: unknown;
  taskId?: string;
  error?: string;
}

/** The one bridge of the application to the launcher, its context included. */
export const shell = createNasShell();

/**
 * Asks the launcher about a disk and waits for its answer, as long as the operation may take: an
 * answer that never comes is a launcher that is not there.
 */
function askDisk(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<DiskAnswer> {
  return shell
    .request(type, payload, { timeoutMs })
    .catch(() => ({ success: false, error: 'Launcher unavailable' }));
}

export function notifyNasShell(title: string, message = '', tone: NotificationTone = 'info'): void {
  shell.notify(title, message, tone);
}

export function initializeNasDisk(device: string, label: string): Promise<DiskAnswer> {
  return askDisk('initialize-disk', { device, label }, 10 * 60 * 1000);
}

export function renameNasDisk(device: string, label: string): Promise<DiskAnswer> {
  return askDisk('rename-disk', { device, label }, 90_000);
}

export function readNasDiskSmart(device: string): Promise<DiskAnswer> {
  return askDisk('smart-disk', { device }, 45_000);
}

/** Ejecting waits for the disk to be unmounted and detached. */
export function ejectNasDisk(device: string): Promise<DiskAnswer> {
  return askDisk('eject-disk', { device }, 150_000);
}

export function readNasDiskLocks(): Promise<DiskAnswer> {
  return askDisk('disk-locks', {}, 10_000);
}

export function lockNasDisk(uuid: string, locked: boolean): Promise<DiskAnswer> {
  return askDisk('lock-disk', { uuid, locked }, 10_000);
}
