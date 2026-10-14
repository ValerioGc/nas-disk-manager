use super::*;

#[test]
fn inherited_usb_and_network_mounts() {
    let disks = parse_lsblk(
        r#"{"blockdevices":[{"name":"sdb","path":"/dev/sdb","type":"disk","size":1000,"tran":"usb","rm":false,"children":[{"name":"sdb1","path":"/dev/sdb1","type":"part","size":900,"mountpoint":"/run/media/user/usb","label":"Photos","uuid":" AB12-CD34 "}]}]}"#,
        "",
    )
    .unwrap();
    assert_eq!(disks.len(), 1);
    assert_eq!(disks[0].kind, "external");
    assert_eq!(disks[0].parent.as_deref(), Some("sdb"));
    assert_eq!(disks[0].name, "Photos");
    assert_eq!(disks[0].uuid.as_deref(), Some("AB12-CD34"));

    let mounts =
        network_mounts("36 25 0:34 / /mnt/My\\040Share rw,relatime - cifs //nas/share rw\n");
    assert_eq!(mounts.len(), 1);
    assert_eq!(mounts[0].mount.as_deref(), Some("/mnt/My Share"));
    assert_eq!(mounts[0].source.as_deref(), Some("//nas/share"));
    assert_eq!(mounts[0].uuid, None);
    assert_eq!(unescape_mount("/mnt/caf\\303\\251"), "/mnt/café");
}

#[test]
fn rejects_invalid_lsblk_and_ignores_unrecognized_mounts() {
    assert!(parse_lsblk("not json", "").is_err());
    assert!(network_mounts("36 25 0:34 / /mnt/data rw - ext4 /dev/sda1 rw\n").is_empty());
}

#[test]
fn excludes_system_disk_and_its_non_data_partitions() {
    let disks = parse_lsblk(
        r#"{"blockdevices":[{"name":"sda","type":"disk","size":1000},{"name":"sdb","type":"disk","size":2000,"children":[{"name":"sdb1","type":"part","fstype":"ext4","mountpoint":"/"},{"name":"sdb2","type":"part"},{"name":"sdb5","type":"part","fstype":"swap","mountpoint":"[SWAP]"}]}]}"#,
        "",
    )
    .unwrap();
    assert_eq!(
        disks
            .iter()
            .map(|disk| disk.id.as_str())
            .collect::<Vec<_>>(),
        ["sda"]
    );
    assert!(disks[0].initializable);
}

#[test]
fn keeps_data_partition_on_system_disk_without_exposing_system_partition() {
    let disks = parse_lsblk(
        r#"{"blockdevices":[{"name":"sda","type":"disk","children":[{"name":"sda1","type":"part","fstype":"vfat","parttype":"c12a7328-f81f-11d2-ba4b-00a0c93ec93b"},{"name":"sda2","type":"part","fstype":"ext4","mountpoints":["/"]},{"name":"sda3","type":"part","fstype":"ext4","mountpoint":"/srv/storage/v-data"}]}]}"#,
        "",
    )
    .unwrap();
    assert_eq!(
        disks
            .iter()
            .map(|disk| disk.id.as_str())
            .collect::<Vec<_>>(),
        ["sda3"]
    );
}

#[test]
fn uses_host_mounts_hidden_from_the_application_and_matches_device_numbers() {
    let disks = parse_lsblk(
        r#"{"blockdevices":[{"name":"sdb","type":"disk","maj:min":"8:16","tran":"sata","children":[{"name":"sdb1","path":"/dev/sdb1","type":"part","maj:min":"8:17","fstype":"ext4","label":"Data-sdb","mountpoint":null,"mountpoints":[null]}]},{"name":"sdc1","type":"part","maj:min":"8:33","fstype":"ext4","mountpoint":"/stale/mount"},{"name":"nvme0n1","type":"disk","maj:min":"259:0","mountpoints":[null]}]}"#,
        "40 25 8:17 / /srv/nas-volumes/data rw - ext4 /dev/disk/by-uuid/data rw\n41 25 8:17 /.nas-users/admin /srv/storage/Data\\040Disk rw - ext4 /dev/disk/by-uuid/data rw\n",
    )
    .unwrap();
    assert_eq!(disks.len(), 3);
    assert_eq!(disks[0].name, "Data-sdb");
    assert_eq!(disks[0].mount.as_deref(), Some("/srv/nas-volumes/data"));
    assert!(!disks[0].initializable);
    assert_eq!(disks[1].mount, None);
    assert_eq!(disks[2].mount, None);
    assert!(disks[2].initializable);

    let bind_mount = parse_lsblk(
        r#"{"blockdevices":[{"name":"sdb1","type":"part","maj:min":"8:17","fstype":"ext4"}]}"#,
        "41 25 8:17 /.nas-users/admin /srv/storage/Data\\040Disk rw - ext4 /dev/sdb1 rw\n",
    )
    .unwrap();
    assert_eq!(
        bind_mount[0].mount.as_deref(),
        Some("/srv/storage/Data Disk")
    );
}

#[test]
fn excludes_system_mounts_even_when_hidden_from_lsblk() {
    let disks = parse_lsblk(
        r#"{"blockdevices":[{"name":"sda","type":"disk","maj:min":"8:0","children":[{"name":"sda1","type":"part","maj:min":"8:1","fstype":"ext4","mountpoint":null},{"name":"sda2","type":"part","maj:min":"8:2","fstype":"ext4"}]}]}"#,
        "30 25 8:1 / / rw - ext4 /dev/sda1 rw\n31 25 8:2 / /srv/storage/data rw - ext4 /dev/sda2 rw\n",
    )
    .unwrap();
    assert_eq!(disks.len(), 1);
    assert_eq!(disks[0].id, "sda2");
    assert_eq!(disks[0].mount.as_deref(), Some("/srv/storage/data"));
}

#[test]
fn reads_the_first_nonempty_mount_from_multiple_mountpoints() {
    let disks = parse_lsblk(
        r#"{"blockdevices":[{"name":"sdb1","type":"part","fstype":"ext4","mountpoint":" ","mountpoints":[null," ","/srv/storage/data","/mnt/data"]}]}"#,
        "",
    )
    .unwrap();
    assert_eq!(disks[0].mount.as_deref(), Some("/srv/storage/data"));
}

#[test]
fn knows_the_partitions_of_the_system_by_their_type() {
    for parttype in [
        "C12A7328-F81F-11D2-BA4B-00A0C93EC93B",
        "0657fd6d-a4ab-43c4-84e5-0933c84b4f4f",
        "0x27",
    ] {
        assert!(system_partition(Some(parttype)), "{parttype}");
    }
    assert!(!system_partition(Some(
        "0fc63daf-8483-4772-8e79-3d69d8477de4"
    )));
    assert!(!system_partition(None));
}

#[test]
fn keeps_a_backslash_that_starts_no_octal_escape() {
    assert_eq!(unescape_mount(r"/mnt/my\040disk"), "/mnt/my disk");
    assert_eq!(unescape_mount(r"/mnt/a\xyzb"), r"/mnt/a\xyzb");
    assert_eq!(unescape_mount(r"/mnt/end\0"), r"/mnt/end\0");
}

#[test]
fn scans_this_machine_with_lsblk_and_its_mounts() {
    if let Ok(disks) = scan() {
        assert!(disks.iter().all(|disk| !disk.kind.is_empty()));
    }
    assert!(scan_network().is_ok() || host_mountinfo().is_err());
}
