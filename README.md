# nas-disk-manager

External application for the NAS launcher: it shows the inventory of the local, external and
network disks and their details. The launcher lists and classifies the local and external disks,
and the application asks it through the shell. When the launcher has encryption on, a data disk
can be formatted with or without LUKS, and an encrypted volume locked, unlocked and given a
password, an automatic unlock, a recovery key and a header backup; passwords are typed only over
HTTPS. The network section connects shared folders of other computers of the local network (SMB)
as disks, which Explorer and Backup use; the cloud section holds the introduction to cloud disks,
not there yet. The manifest asks for `cifs-utils`, which needs a launcher that installs it. Whole, empty data disks can be initialized as GPT/ext4 after an
explicit confirmation; the privileged operation stays in the launcher, not in the process of the
app. Every repository stands on its own and produces an archive the launcher can install.

## Local start

Requires Node.js 24, npm and Rust/Cargo.

```bash
pnpm install
pnpm run build
pnpm run backend:dev
```

In a second terminal:

```bash
pnpm run dev
```

Vite serves the UI on `http://127.0.0.1:1420/` and forwards `api/...` to the backend over a Unix socket. `NAS_APP_SOCKET` changes the path of the socket. The backend has one API, GET `api/network-disks`, the network shares mounted on the machine, which the manifest declares as the `network-disks` capability for the other applications (the launcher reads it on behalf of nas-backup-manager). The page opens on the section given by `?kind=local|external|network`.

For structure, tests and checks see [DEVELOPMENT.md](DEVELOPMENT.md). The contract for installation, search and communication with the launcher is in [APPS.md](APPS.md); packaging and release are in [NAS.md](NAS.md).
