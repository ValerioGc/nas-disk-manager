use super::{
    disk_response, health, inventory::Disk, listen_path, network_disks, prepare_socket,
    resolve_ui_dir, run, static_file, AppState,
};
use axum::{
    body::to_bytes,
    extract::State,
    http::{header, StatusCode, Uri},
    response::IntoResponse,
};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT_TEMP: AtomicUsize = AtomicUsize::new(0);

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "nas-disk-manager-backend-test-{}-{}",
            std::process::id(),
            NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
async fn serves_health_and_static_files_and_blocks_api_fallback() {
    let health = health().await.into_response();
    assert_eq!(health.status(), StatusCode::OK);
    let body = to_bytes(health.into_body(), usize::MAX).await.unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["status"], "ok");

    let dir = TestDir::new();
    fs::write(dir.0.join("index.html"), "nas-disk-manager").unwrap();
    let state = State(AppState {
        ui_dir: dir.0.clone(),
    });
    let response = static_file(state.clone(), Uri::from_static("/")).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
    fs::create_dir_all(dir.0.join("assets")).unwrap();
    fs::write(dir.0.join("assets/index-abc.js"), "script").unwrap();
    let asset = static_file(state.clone(), Uri::from_static("/assets/index-abc.js")).await;
    assert_eq!(
        asset.headers()[header::CACHE_CONTROL],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    assert_eq!(
        to_bytes(response.into_body(), usize::MAX).await.unwrap(),
        "nas-disk-manager"
    );

    let api = static_file(state.clone(), Uri::from_static("/api/network-disks")).await;
    assert_eq!(api.status(), StatusCode::NOT_FOUND);
    let traversal = static_file(state.clone(), Uri::from_static("/../secret")).await;
    assert_eq!(traversal.status(), StatusCode::BAD_REQUEST);
    let missing = static_file(state, Uri::from_static("/missing.bin")).await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn static_file_uses_content_types_for_supported_extensions() {
    let dir = TestDir::new();
    let state = State(AppState {
        ui_dir: dir.0.clone(),
    });
    let cases = [
        ("app.js", "text/javascript; charset=utf-8"),
        ("app.css", "text/css; charset=utf-8"),
        ("icon.svg", "image/svg+xml"),
        ("image.png", "image/png"),
        ("image.webp", "image/webp"),
        ("favicon.ico", "image/x-icon"),
        ("font.woff2", "font/woff2"),
        ("unknown.dat", "application/octet-stream"),
    ];

    for (name, expected) in cases {
        fs::write(dir.0.join(name), "asset").unwrap();
        let uri: Uri = format!("/{name}").parse().unwrap();
        let response = static_file(state.clone(), uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{name}");
        assert_eq!(response.headers()[header::CONTENT_TYPE], expected, "{name}");
    }
}

#[tokio::test]
async fn answers_the_network_shares_it_scanned() {
    let share = Disk {
        id: "network:/mnt/share".to_owned(),
        name: "share".to_owned(),
        kind: "network",
        mount: Some("/mnt/share".to_owned()),
        filesystem: Some("cifs".to_owned()),
        read_only: false,
        source: Some("//nas/share".to_owned()),
    };
    let response = disk_response(Ok(Ok(vec![share])));
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let disks: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    assert_eq!(disks[0]["source"], "//nas/share");
}

#[tokio::test]
async fn reports_disk_scan_and_worker_failures() {
    let scan_error = disk_response(Ok(Err("mountinfo unreadable".to_owned())));
    assert_eq!(scan_error.status(), StatusCode::SERVICE_UNAVAILABLE);

    let worker_error = tokio::task::spawn_blocking(|| panic!("simulated worker failure"))
        .await
        .unwrap_err();
    let response = disk_response(Err(worker_error));
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[test]
fn selects_configured_packaged_and_development_ui_directories() {
    let dir = TestDir::new();
    let executable = dir.0.join("bin/nas-disk-manager");
    let packaged = dir.0.join("dist");
    let configured = dir.0.join("custom-ui");

    assert_eq!(
        resolve_ui_dir(None, || Ok(executable.clone())).unwrap(),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist/axum")
    );

    fs::create_dir_all(&packaged).unwrap();
    fs::write(packaged.join("index.html"), "Packaged UI").unwrap();
    assert_eq!(resolve_ui_dir(None, || Ok(executable)).unwrap(), packaged);
    assert_eq!(
        resolve_ui_dir(Some(configured.clone()), || panic!(
            "configured path takes precedence"
        ))
        .unwrap(),
        configured
    );
    assert_eq!(
        resolve_ui_dir(None, || Err("executable unavailable".to_owned())).unwrap_err(),
        "executable unavailable"
    );
}

#[tokio::test]
async fn checks_socket_paths_before_binding() {
    let dir = TestDir::new();
    let missing = dir.0.join("missing.sock");
    prepare_socket(&missing).await.unwrap();

    let occupied = dir.0.join("occupied.sock");
    fs::write(&occupied, "not a socket").unwrap();
    assert!(prepare_socket(&occupied)
        .await
        .unwrap_err()
        .contains("occupied"));
}

#[test]
fn parses_socket_arguments_and_environment_defaults() {
    let explicit = listen_path(
        ["--listen".into(), "/tmp/nas-disk-manager.sock".into()],
        None,
    )
    .unwrap();
    assert_eq!(explicit, PathBuf::from("/tmp/nas-disk-manager.sock"));

    let from_environment = listen_path([], Some("/tmp/from-env.sock".into())).unwrap();
    assert_eq!(from_environment, PathBuf::from("/tmp/from-env.sock"));
    assert!(listen_path([], None).unwrap_err().contains("Provide"));
    assert!(listen_path(["--listen".into()], None)
        .unwrap_err()
        .contains("requires a socket path"));
    assert!(listen_path(["--unknown".into()], None)
        .unwrap_err()
        .contains("Unrecognized argument"));
    assert!(listen_path(["--listen".into(), "".into()], None)
        .unwrap_err()
        .contains("Empty socket path"));
}

#[tokio::test]
async fn reads_the_network_shares_of_this_machine_or_says_why_not() {
    assert!(matches!(
        network_disks().await.status(),
        StatusCode::OK | StatusCode::SERVICE_UNAVAILABLE
    ));
}

#[tokio::test]
async fn serves_on_its_socket_until_stopped_and_needs_the_interface() {
    let dir = TestDir::new();
    let socket = dir.0.join("disks.sock");
    let missing = run(socket.clone(), dir.0.join("ui"), async {}).await;
    assert!(missing
        .unwrap_err()
        .to_string()
        .contains("Frontend not found"));

    let ui = dir.0.join("ui");
    fs::create_dir_all(&ui).unwrap();
    fs::write(ui.join("index.html"), "page").unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let server = tokio::spawn(run(socket.clone(), ui, async {
        let _ = stopped.await;
    }));
    for _ in 0..200 {
        if socket.exists() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    assert!(socket.exists());
    stop.send(()).unwrap();
    server.await.unwrap().unwrap();
    assert!(!socket.exists());
}
