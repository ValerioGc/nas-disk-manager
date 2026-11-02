use super::*;

#[test]
fn reads_the_network_shares_of_the_host() {
    let mounts =
        network_mounts("36 25 0:34 / /mnt/My\\040Share ro,relatime - cifs //nas/share rw\n");
    assert_eq!(mounts.len(), 1);
    assert_eq!(mounts[0].name, "My Share");
    assert_eq!(mounts[0].mount.as_deref(), Some("/mnt/My Share"));
    assert_eq!(mounts[0].source.as_deref(), Some("//nas/share"));
    assert!(mounts[0].read_only);
    assert_eq!(unescape_mount("/mnt/caf\\303\\251"), "/mnt/café");
}

#[test]
fn ignores_local_filesystems() {
    assert!(network_mounts("36 25 0:34 / /mnt/data rw - ext4 /dev/sda1 rw\n").is_empty());
    assert!(network_mounts("not a mount line\n").is_empty());
}

#[test]
fn keeps_a_backslash_that_starts_no_octal_escape() {
    assert_eq!(unescape_mount(r"/mnt/my\040disk"), "/mnt/my disk");
    assert_eq!(unescape_mount(r"/mnt/a\xyzb"), r"/mnt/a\xyzb");
    assert_eq!(unescape_mount(r"/mnt/end\0"), r"/mnt/end\0");
}

#[test]
fn scans_the_mounts_of_this_machine() {
    assert!(scan_network().is_ok() || host_mountinfo().is_err());
}
