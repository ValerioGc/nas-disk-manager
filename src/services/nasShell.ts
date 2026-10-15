import { createNasShell, type NotificationTone } from '@valeriogc/nas-base-app';
import type { CryptRequest, NetworkRequest } from '@/types';

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

/** Whether the NAS may encrypt its data disks. */
export function readNasDiskEncryption(): Promise<DiskAnswer> {
  return askDisk('disk-encryption', {}, 10_000);
}

/** A format waits for the whole disk to be erased and prepared, the rest for one command. */
export function askNasDiskCrypt(request: CryptRequest): Promise<DiskAnswer> {
  return askDisk('disk-crypt', { request }, request.op === 'format' ? 16 * 60_000 : 3 * 60_000);
}

/** The network disks the NAS knows. */
export function readNasNetworkDisks(): Promise<DiskAnswer> {
  return askDisk('smb-disks', {}, 10_000);
}

/** A network disk saved, tried, connected, disconnected or forgotten. */
export function askNasNetworkDisk(request: NetworkRequest): Promise<DiskAnswer> {
  return askDisk('smb-disk', { request }, 150_000);
}

/** The local or external disks, as the launcher classifies them. */
export function readNasDisks(kind: 'local' | 'external'): Promise<DiskAnswer> {
  return askDisk('disk-inventory', { kind }, 30_000);
}

export function initializeNasDisk(
  device: string,
  label: string,
  identity: string,
): Promise<DiskAnswer> {
  return askDisk('initialize-disk', { device, label, identity }, 10 * 60 * 1000);
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
