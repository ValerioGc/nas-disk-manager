# nas-disk-manager

External application for the NAS launcher: it shows the inventory of the local, external and
network disks and their details. The launcher lists and classifies the local and external disks,
and the application asks it through the shell. When the launcher has encryption on, an internal
data disk can be formatted with or without LUKS, from Format or from Encrypt disk, never a removable
one. A new encrypted volume always gets a password, and the automatic unlock at startup is an option
on top. An encrypted volume can be locked and unlocked, also with the automatic key alone, its
password set or changed, its automatic unlock turned on or off, and it can get a recovery key and a
header backup. A change of keys asks for the password or the recovery key whenever the volume has
one, and the automatic unlock goes only while another key opens the volume. Passwords are typed
only over HTTPS. The keys of a volume are shown from the container and from the open volume inside
it. The wizard prepares disks without encryption, so encryption is always set up here. A disk with a locked volume is formatted only with the password or the recovery key of that
volume (`current`), unless the volume has only the automatic key of this NAS. Encryption does not need an encrypted system: when the launcher says the system disk is
not encrypted or has no TPM 2.0 (`disk-security`), the automatic unlock carries a note that whoever
takes the system disk away with the volume can open it. The network section connects shared folders
of other computers of the local network (SMB) as disks, which Files and Backup use; the cloud section holds the introduction to cloud disks,
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

Vite serves the UI on `http://127.0.0.1:1420/` and forwards `api/...` to the backend over a Unix socket. `NAS_APP_SOCKET` changes the path of the socket. The backend has one API, GET `api/network-disks`, the network shares mounted on the machine, which the manifest declares as the `network-disks` capability for the other applications. The page opens on the section given by `?kind=local|external|network|cloud`, and nas-backup-manager opens it on `cloud` from its cloud backups.

For structure, tests and checks see [DEVELOPMENT.md](DEVELOPMENT.md). The contract for installation, search and communication with the launcher is in [APPS.md](APPS.md); packaging and release are in [NAS.md](NAS.md).
