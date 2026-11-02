import type { DiskKeys } from '@/types/encryption';

export type DiskKind = 'local' | 'external' | 'network' | 'cloud';

export type DetailTab = 'info' | 'smart' | 'actions';

/** Initializing an empty disk, or formatting a data disk with volumes on it. */
export type EraseMode = 'initialize' | 'format';

export interface Disk {
  id: string;
  name: string;
  device: string | null;
  kind: DiskKind;
  disk_type: string;
  size_bytes: number;
  mount: string | null;
  filesystem: string | null;
  model: string | null;
  transport: string | null;
  removable: boolean;
  read_only: boolean;
  initializable: boolean;
  parent: string | null;
  source?: string | null;
  uuid: string | null;
  /** Nothing on the system disk may be erased. */
  system_disk?: boolean;
  /** The identity of the whole disk, repeated by an erase request. */
  identity?: string;
  encryption?: 'locked' | 'open' | null;
  keys?: DiskKeys | null;
}

export interface SmartRow {
  label: string;
  value: unknown;
  unit?: string;
}
