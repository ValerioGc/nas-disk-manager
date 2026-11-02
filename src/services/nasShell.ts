import { createNasShell, type NotificationTone } from '@valeriogc/nas-base-app';
import type { CryptRequest, DiskAnswer, NetworkRequest } from '@/types';

export const shell = createNasShell();

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

export function readNasDiskEncryption(): Promise<DiskAnswer> {
  return askDisk('disk-encryption', {}, 10_000);
}

export function readNasDiskSecurity(): Promise<DiskAnswer> {
  return askDisk('disk-security', {}, 10_000);
}

/** A format waits for the whole disk to be erased, the other operations for one command. */
export function askNasDiskCrypt(request: CryptRequest): Promise<DiskAnswer> {
  return askDisk('disk-crypt', { request }, request.op === 'format' ? 16 * 60_000 : 3 * 60_000);
}

export function readNasNetworkDisks(): Promise<DiskAnswer> {
  return askDisk('smb-disks', {}, 10_000);
}

export function askNasNetworkDisk(request: NetworkRequest): Promise<DiskAnswer> {
  return askDisk('smb-disk', { request }, 150_000);
}

export function readNasDisks(kind: 'local' | 'external'): Promise<DiskAnswer> {
  return askDisk('disk-inventory', { kind }, 30_000);
}

export function initializeNasDisk(
  device: string,
  label: string,
  identity: string,
): Promise<DiskAnswer> {
  return askDisk('initialize-disk', { device, label, identity }, 10 * 60_000);
}

export function renameNasDisk(device: string, label: string): Promise<DiskAnswer> {
  return askDisk('rename-disk', { device, label }, 90_000);
}

export function readNasDiskSmart(device: string): Promise<DiskAnswer> {
  return askDisk('smart-disk', { device }, 45_000);
}

export function ejectNasDisk(device: string): Promise<DiskAnswer> {
  return askDisk('eject-disk', { device }, 150_000);
}

export function readNasDiskLocks(): Promise<DiskAnswer> {
  return askDisk('disk-locks', {}, 10_000);
}

export function lockNasDisk(uuid: string, locked: boolean): Promise<DiskAnswer> {
  return askDisk('lock-disk', { uuid, locked }, 10_000);
}
