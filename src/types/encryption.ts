export interface DiskKeys {
  password: boolean;
  automatic: boolean;
  recovery: boolean;
  /** Locked by the person. */
  held: boolean;
}

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
