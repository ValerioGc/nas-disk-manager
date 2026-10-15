export type DiskKind = 'local' | 'external' | 'network' | 'cloud';

/** A share of another computer of the local network, connected as a disk. */
export interface NetworkDisk {
  id: string;
  name: string;
  server: string;
  share: string;
  username: string;
  domain?: string | null;
  automatic: boolean;
  connected: boolean;
  /** Disconnected by the person: it stays so until connected again. */
  held: boolean;
}

/** The network disks, and whether this NAS connects them at all. */
export interface NetworkDisks {
  available: boolean;
  disks: NetworkDisk[];
}

/** What the disk manager asks the launcher about a network disk. */
export type NetworkRequest =
  | {
      op: 'networkSave';
      id?: string;
      name: string;
      server: string;
      share: string;
      username: string;
      domain?: string;
      password?: string;
      automatic: boolean;
    }
  | {
      op: 'networkTest';
      server: string;
      share: string;
      username: string;
      domain?: string;
      password: string;
    }
  | { op: 'networkConnect' | 'networkDisconnect' | 'networkForget'; id: string };

/** The keys of an encrypted volume, and whether the person closed it. */
export interface DiskKeys {
  password: boolean;
  automatic: boolean;
  recovery: boolean;
  held: boolean;
}

/** What the disk manager asks the launcher about encryption. */
export type CryptRequest =
  | {
      op: 'format';
      device: string;
      identity: string;
      label: string;
      encrypt: boolean;
      automatic: boolean;
      password?: string;
    }
  | { op: 'unlock'; uuid: string; password: string }
  | { op: 'lock'; uuid: string }
  | { op: 'automatic'; uuid: string; enabled: boolean; password?: string }
  | { op: 'password'; uuid: string; current?: string; password: string }
  | { op: 'recovery'; uuid: string; current?: string }
  | { op: 'header'; uuid: string };

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
  /** The disk holds the system: nothing on it may be erased. */
  system_disk?: boolean;
  /** The identity of the whole disk, which an erasing request repeats. */
  identity?: string;
  /** The state of a LUKS container. */
  encryption?: 'locked' | 'open' | null;
  /** The keys of a LUKS container. */
  keys?: DiskKeys | null;
}
