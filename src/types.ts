export type DiskKind = 'local' | 'external' | 'network';

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
  source: string | null;
  uuid: string | null;
}
