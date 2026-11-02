export interface NetworkDisk {
  id: string;
  name: string;
  server: string;
  share: string;
  username: string;
  domain?: string | null;
  automatic: boolean;
  connected: boolean;
  /** Disconnected by the person, it stays so until connected again. */
  held: boolean;
}

export interface NetworkDisks {
  /** Whether this NAS connects network disks at all. */
  available: boolean;
  disks: NetworkDisk[];
}

export interface NetworkForm {
  name: string;
  server: string;
  share: string;
  username: string;
  password: string;
  domain: string;
  automatic: boolean;
}

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

export interface NetworkField {
  key: Exclude<keyof NetworkForm, 'automatic'>;
  label: string;
  testid: string;
  maxlength?: number;
  type?: 'password';
  spellcheck?: false;
}
