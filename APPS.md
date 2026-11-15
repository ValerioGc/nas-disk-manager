# Contract of nas-disk-manager with the NAS launcher

The contract every application shares with the launcher (package, manifest, permissions, frame
protocol, launcher socket and providers) is `docs/development/external_apps/APPS.md` in the
nas-launcher repository, and the bridge is the one of `@valeriogc/nas-base-app`. This file keeps
only what is specific to nas-disk-manager, which builds and releases on its own.

## Identity

- id `nas-disk-manager`, category `storage`, system application
- permissions `paths` ["/proc"], `packages` ["cifs-utils"]
- provides `network-disks` at `/api/network-disks`

## Specific to this application

Application-to-shell messages are `ready`, `notify`, `open`, `describe`, `pick-files`, `network-disks`, and the nas-disk-manager-only `initialize-disk`. The shell returns `context`, `described` notification labels, `pick-files-result`, `network-disks-result`, and `initialize-disk-result`. The `open` request may carry `location`, a query string beginning with `?` and at most 2048 characters. The common TypeScript contract, the transport (`createNasShell`) and the Vue lifecycle (`useNasLauncherContext`) live in the shared library `@valeriogc/nas-base-app`. No application imports launcher source files.

Only nas-disk-manager may send `{ nas: 1, type: 'disk-inventory', requestId, kind }`, with `kind` `local` or `external`: the shell answers `disk-inventory-result` with the disks and volumes the launcher classified, the system left out. Each entry carries `system_disk` (nothing on that disk may be erased), `identity` (WWN, serial and size of the whole disk) and `encryption` (`locked` or `open` for a LUKS container).

Only nas-disk-manager may send `{ nas: 1, type: 'disk-encryption', requestId }`, answered with whether the launcher has disk encryption on, and `{ nas: 1, type: 'disk-crypt', requestId, request }`, where `request` is one of `{ op: 'format', device, identity, label, encrypt, automatic, password?, current? }`, `{ op: 'unlock', uuid, password? }` (without `password` the launcher uses the automatic key), `{ op: 'lock', uuid }`, `{ op: 'automatic', uuid, enabled, password? }`, `{ op: 'password', uuid, current?, password }`, `{ op: 'recovery', uuid, current? }` and `{ op: 'header', uuid }`; the answer carries `recovery` (the new recovery key) or `header` (the header backup in base64). Only nas-disk-manager may send `{ nas: 1, type: 'smb-disks', requestId }`, answered with `{ available, disks }` (the network disks: `id`, `name`, `server`, `share`, `username`, `domain`, `automatic`, `connected`, `held`), and `{ nas: 1, type: 'smb-disk', requestId, request }`, where `request` is `{ op: 'networkSave', id?, name, server, share, username, domain?, password?, automatic }`, `{ op: 'networkTest', server, share, username, domain?, password }` or `{ op: 'networkConnect' | 'networkDisconnect' | 'networkForget', id }`. The shell refuses a request with a password unless the page is on HTTPS or on the machine itself. A container in the inventory carries `keys`: `password`, `automatic`, `recovery` and `held` (locked by the person, it stays locked until unlocked).

Only nas-disk-manager may send `{ nas: 1, type: 'initialize-disk', requestId, device, label, identity }`, where `identity` is the one the inventory listed: the root unit refuses a disk whose identity changed. The launcher derives the sender from the registered frame, validates the request again and answers with `{ nas: 1, type: 'initialize-disk-result', requestId, success, taskId?, error? }`. The application never receives block-device privileges and never calls the launcher's API directly.

For external disks nas-disk-manager alone may also send `{ nas: 1, type: 'eject-disk', requestId, device }`, `{ nas: 1, type: 'disk-locks', requestId }` and `{ nas: 1, type: 'lock-disk', requestId, uuid, locked }`. The shell answers each with `<type>-result`, `{ requestId, success, data?, error? }`: `disk-locks` and `lock-disk` carry the filesystem UUIDs marked as not removable. The launcher ejects a disk through a root unit (unmount, then detach from the kernel) and refuses one with a marked volume; the mark is kept by the launcher per filesystem UUID, so it survives unplugging.

nas-disk-manager declares the `network-disks` capability at `/api/network-disks`, which answers with the network shares mounted on the host (`cifs`, `smb3`, `nfs`, `nfs4`, `fuse.sshfs`) in the same shape as `/api/disks`. An application sends `{ nas: 1, type: 'network-disks', requestId }` through `requestNetworkDisks()`; the launcher starts the first installed version 1 provider if necessary, reads the endpoint and returns `{ nas: 1, type: 'network-disks-result', requestId, success, data?: [{ name, mount, source, readOnly }], error? }`. No application asks for it at present. nas-backup-manager reaches the network disks through the Explorer picker like the other disks, while its cloud backups wait for the cloud disks of nas-disk-manager and open that section with `location: '?kind=cloud'`.

The commands that check the repository are in [DEVELOPMENT.md](DEVELOPMENT.md).
