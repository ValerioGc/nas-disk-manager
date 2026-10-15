//! The network shares mounted on the machine: what the `network-disks` capability answers. The
//! local and external disks are listed by the launcher, which classifies them.

use serde::Serialize;
use std::fs;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Disk {
    pub id: String,
    pub name: String,
    pub kind: &'static str,
    pub mount: Option<String>,
    pub filesystem: Option<String>,
    pub read_only: bool,
    pub source: Option<String>,
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
                kind: "network",
                mount: Some(mount),
                filesystem: Some(filesystem.to_owned()),
                read_only: fields
                    .get(5)
                    .is_some_and(|options| options.split(',').any(|option| option == "ro")),
                source: Some(source),
            })
        })
        .collect()
}

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
