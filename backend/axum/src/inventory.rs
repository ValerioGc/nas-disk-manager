use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, process::Command};

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Disk {
    pub id: String,
    pub name: String,
    pub device: Option<String>,
    pub kind: &'static str,
    pub disk_type: String,
    pub size_bytes: u64,
    pub mount: Option<String>,
    pub filesystem: Option<String>,
    pub model: Option<String>,
    pub transport: Option<String>,
    pub removable: bool,
    pub read_only: bool,
    pub initializable: bool,
    pub parent: Option<String>,
    pub source: Option<String>,
    /// The UUID of the filesystem: what marks an external disk as not removable.
    pub uuid: Option<String>,
}

#[derive(Deserialize)]
struct Lsblk {
    blockdevices: Vec<Block>,
}

#[derive(Deserialize)]
struct Block {
    name: String,
    #[serde(rename = "maj:min")]
    device_number: Option<String>,
    path: Option<String>,
    #[serde(rename = "type")]
    disk_type: String,
    size: Option<u64>,
    mountpoint: Option<String>,
    mountpoints: Option<Vec<Option<String>>>,
    fstype: Option<String>,
    parttype: Option<String>,
    label: Option<String>,
    uuid: Option<String>,
    model: Option<String>,
    tran: Option<String>,
    rm: Option<bool>,
    ro: Option<bool>,
    children: Option<Vec<Block>>,
}

fn clean(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })
}

fn system_mount(path: &str) -> bool {
    if path.starts_with("/run/media/") {
        return false;
    }
    [
        "/", "/boot", "/efi", "/usr", "/var", "/home", "/etc", "/sys", "/proc", "/dev", "/run",
    ]
    .iter()
    .any(|mount| path == *mount || (*mount != "/" && path.starts_with(&format!("{mount}/"))))
}

fn system_partition(parttype: Option<&str>) -> bool {
    parttype.is_some_and(|value| {
        matches!(
            value.to_ascii_lowercase().as_str(),
            "c12a7328-f81f-11d2-ba4b-00a0c93ec93b" // EFI system
                | "21686148-6449-6e6f-744e-656564454649" // BIOS boot
                | "0657fd6d-a4ab-43c4-84e5-0933c84b4f4f" // swap
                | "4f68bce3-e8cd-4db1-96e7-fbcaf984b709" // x86-64 root
                | "44479540-f297-41b2-9af7-d131d5f0458a" // x86 root
                | "4d21b016-b534-45c2-a9fb-5c16e091fd2d" // /var
                | "933ac7e1-2eb4-4f13-b844-0e14e2aef915" // /home
                | "de94bba4-06d1-4d40-a16a-bfd50179d6ac" // Windows recovery
                | "0x27" // MBR recovery
        )
    })
}

fn is_system(block: &Block) -> bool {
    block.fstype.as_deref() == Some("swap")
        || system_partition(block.parttype.as_deref())
        || block.mountpoint.as_deref().is_some_and(system_mount)
        || block
            .mountpoints
            .as_ref()
            .is_some_and(|paths| paths.iter().flatten().any(|path| system_mount(path)))
}

fn contains_system(block: &Block) -> bool {
    is_system(block)
        || block
            .children
            .as_ref()
            .is_some_and(|children| children.iter().any(contains_system))
}

fn flatten(
    block: Block,
    parent: Option<&str>,
    external: bool,
    system_disk: bool,
    inherited_transport: Option<&str>,
    inherited_model: Option<&str>,
    output: &mut Vec<Disk>,
) {
    let removable = block.rm.unwrap_or(false);
    let transport = clean(block.tran.clone()).or_else(|| inherited_transport.map(str::to_owned));
    let model = clean(block.model.clone()).or_else(|| inherited_model.map(str::to_owned));
    let external = external || removable || transport.as_deref() == Some("usb");
    let protected = contains_system(&block);
    let system_disk = system_disk || (block.disk_type == "disk" && protected);
    let id = block.name;
    let children = block.children.unwrap_or_default();
    let has_children = !children.is_empty();
    let initializable = block.disk_type == "disk"
        && children.is_empty()
        && block
            .fstype
            .as_ref()
            .is_none_or(|value| value.trim().is_empty())
        && block
            .mountpoint
            .as_ref()
            .is_none_or(|value| value.trim().is_empty())
        && block
            .mountpoints
            .as_ref()
            .is_none_or(|paths| paths.iter().flatten().all(|path| path.trim().is_empty()))
        && !block.ro.unwrap_or(false)
        && !protected
        && !system_disk;
    if !protected
        && !(system_disk && block.disk_type == "part" && block.fstype.is_none())
        && (block.disk_type != "disk" || !has_children)
        && matches!(
            block.disk_type.as_str(),
            "disk" | "part" | "lvm" | "crypt" | "raid"
        )
    {
        let label = clean(block.label);
        let name = label
            .clone()
            .or_else(|| model.clone())
            .unwrap_or_else(|| id.clone());
        output.push(Disk {
            id: id.clone(),
            name,
            device: clean(block.path),
            kind: if external { "external" } else { "local" },
            disk_type: block.disk_type,
            size_bytes: block.size.unwrap_or_default(),
            mount: clean(block.mountpoint).or_else(|| {
                block
                    .mountpoints
                    .unwrap_or_default()
                    .into_iter()
                    .find_map(clean)
            }),
            filesystem: clean(block.fstype),
            model: model.clone(),
            transport: transport.clone(),
            removable,
            read_only: block.ro.unwrap_or(false),
            initializable,
            parent: parent.map(str::to_owned),
            source: None,
            uuid: clean(block.uuid),
        });
    }
    for child in children {
        flatten(
            child,
            Some(&id),
            external,
            system_disk,
            transport.as_deref(),
            model.as_deref(),
            output,
        );
    }
}

fn apply_mounts(block: &mut Block, mounts: &HashMap<&str, Vec<Option<String>>>) {
    if let Some(number) = &block.device_number {
        block.mountpoint = None;
        block.mountpoints = Some(mounts.get(number.as_str()).cloned().unwrap_or_default());
    }
    for child in block.children.iter_mut().flatten() {
        apply_mounts(child, mounts);
    }
}

fn parse_lsblk(json: &str, mountinfo: &str) -> Result<Vec<Disk>, String> {
    let blocks: Lsblk = serde_json::from_str(json).map_err(|error| error.to_string())?;
    let mut mounts: HashMap<&str, Vec<Option<String>>> = HashMap::new();
    for line in mountinfo.lines() {
        let fields: Vec<_> = line.split_whitespace().collect();
        if let (Some(number), Some(path)) = (fields.get(2), fields.get(4)) {
            mounts
                .entry(number)
                .or_default()
                .push(Some(unescape_mount(path)));
        }
    }
    let mut disks = Vec::new();
    for mut block in blocks.blockdevices {
        apply_mounts(&mut block, &mounts);
        flatten(block, None, false, false, None, None, &mut disks);
    }
    Ok(disks)
}

fn unescape_mount(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\\' && index + 3 < bytes.len() {
            if let Ok(octal) = std::str::from_utf8(&bytes[index + 1..index + 4]) {
                if let Ok(byte) = u8::from_str_radix(octal, 8) {
                    output.push(byte);
                    index += 4;
                    continue;
                }
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

fn network_mounts(mountinfo: &str) -> Vec<Disk> {
    mountinfo
        .lines()
        .filter_map(|line| {
            let (left, right) = line.split_once(" - ")?;
            let fields: Vec<_> = left.split_whitespace().collect();
            let details: Vec<_> = right.split_whitespace().collect();
            let filesystem = *details.first()?;
            if !matches!(filesystem, "cifs" | "smb3" | "nfs" | "nfs4" | "fuse.sshfs") {
                return None;
            }
            let mount = unescape_mount(fields.get(4)?);
            let source = unescape_mount(details.get(1)?);
            Some(Disk {
                id: format!("network:{mount}"),
                name: mount
                    .rsplit('/')
                    .next()
                    .filter(|s| !s.is_empty())
                    .unwrap_or(&source)
                    .to_owned(),
                device: None,
                kind: "network",
                disk_type: "network".to_owned(),
                size_bytes: 0,
                mount: Some(mount),
                filesystem: Some(filesystem.to_owned()),
                model: None,
                transport: None,
                removable: false,
                read_only: fields
                    .get(5)
                    .is_some_and(|options| options.split(',').any(|option| option == "ro")),
                initializable: false,
                parent: None,
                source: Some(source),
                uuid: None,
            })
        })
        .collect()
}

pub fn scan() -> Result<Vec<Disk>, String> {
    let result = Command::new("lsblk")
        .args([
            "--json",
            "--bytes",
            "--output",
            "NAME,PATH,MAJ:MIN,TYPE,SIZE,MOUNTPOINT,MOUNTPOINTS,FSTYPE,PARTTYPE,LABEL,UUID,MODEL,TRAN,RM,RO",
        ])
        .output()
        .map_err(|error| format!("lsblk unavailable: {error}"))?;
    if !result.status.success() {
        return Err(format!(
            "lsblk: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    let mountinfo = host_mountinfo()?;
    let mut disks = parse_lsblk(&String::from_utf8_lossy(&result.stdout), &mountinfo)?;
    disks.extend(network_mounts(&mountinfo));
    Ok(disks)
}

/// The network shares alone: what the `network-disks` capability answers, without lsblk.
pub fn scan_network() -> Result<Vec<Disk>, String> {
    Ok(network_mounts(&host_mountinfo()?))
}

/// PID 1 sees the host mounts, including those hidden by the application's sandbox.
fn host_mountinfo() -> Result<String, String> {
    fs::read_to_string("/proc/1/mountinfo")
        .map_err(|error| format!("impossibile leggere i montaggi del sistema: {error}"))
}

#[cfg(test)]
#[path = "../../tests/unit/axum/inventory.rs"]
mod tests;
