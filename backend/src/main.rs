mod inventory;

use axum::{
    extract::State,
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use nas_app_core::prepare_socket;
use serde_json::json;
use std::{env, path::PathBuf};
use tokio::net::UnixListener;

#[derive(Clone)]
struct AppState {
    ui_dir: PathBuf,
}

async fn network_disks() -> Response {
    disk_response(tokio::task::spawn_blocking(inventory::scan_network).await)
}

fn disk_response(
    result: Result<Result<Vec<inventory::Disk>, String>, tokio::task::JoinError>,
) -> Response {
    match result {
        Ok(Ok(disks)) => Json(disks).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error":error})),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":error.to_string()})),
        )
            .into_response(),
    }
}

async fn health() -> impl IntoResponse {
    Json(json!({"status":"ok","version":env!("CARGO_PKG_VERSION")}))
}

fn ui_dir() -> Result<PathBuf, String> {
    resolve_ui_dir(env::var_os("NAS_UI_DIR").map(PathBuf::from), || {
        env::current_exe().map_err(|error| error.to_string())
    })
}

fn resolve_ui_dir(
    configured: Option<PathBuf>,
    executable: impl FnOnce() -> Result<PathBuf, String>,
) -> Result<PathBuf, String> {
    if let Some(path) = configured {
        return Ok(path);
    }
    let executable = executable()?;
    let binary_dir = executable.parent().ok_or("Invalid executable path")?;
    let packaged = binary_dir
        .parent()
        .ok_or("Invalid executable path")?
        .join("dist");
    if packaged.join("index.html").is_file() {
        Ok(packaged)
    } else {
        Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/axum"))
    }
}

async fn static_file(State(state): State<AppState>, uri: Uri) -> Response {
    nas_app_core::serve_static(&state.ui_dir, uri.path()).await
}

async fn shutdown() {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {},
        _ = terminate.recv() => {},
    }
}

fn listen_path(
    args: impl IntoIterator<Item = std::ffi::OsString>,
    mut listen: Option<std::ffi::OsString>,
) -> Result<PathBuf, String> {
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if arg == "--listen" {
            listen = Some(args.next().ok_or("--listen requires a socket path")?);
        } else {
            return Err(format!("Unrecognized argument: {}", arg.to_string_lossy()));
        }
    }
    let path = PathBuf::from(listen.ok_or("Provide --listen or NAS_APP_SOCKET")?);
    if path.as_os_str().is_empty() {
        return Err("Empty socket path".to_owned());
    }
    Ok(path)
}

type Failure = Box<dyn std::error::Error + Send + Sync>;

async fn run(
    path: PathBuf,
    ui_dir: PathBuf,
    shutdown_signal: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), Failure> {
    let state = AppState { ui_dir };
    if !state.ui_dir.join("index.html").is_file() {
        return Err(format!("Frontend not found: {}", state.ui_dir.display()).into());
    }
    prepare_socket(&path).await?;
    let listener = UnixListener::bind(&path)?;
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/network-disks", get(network_disks))
        .fallback(get(static_file))
        .with_state(state);
    println!("nas-disk-manager listening on {}", path.display());
    let result = axum::serve(nas_app_core::LauncherOnly::new(listener), app)
        .with_graceful_shutdown(shutdown_signal)
        .await;
    if let Err(error) = tokio::fs::remove_file(&path).await {
        eprintln!("unable to remove the socket ({error})");
    }
    result?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Failure> {
    let path = listen_path(env::args_os().skip(1), env::var_os("NAS_APP_SOCKET"))?;
    run(path, ui_dir()?, shutdown()).await
}

#[cfg(test)]
#[path = "../tests/unit/main.rs"]
mod tests;
