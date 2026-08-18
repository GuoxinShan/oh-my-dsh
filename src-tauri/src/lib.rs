//! Desktop shell for the DeepSeek Harness web UI (M1).
//!
//! One run: find the harness checkout, own `~/.dsh-desktop/` as the sidecar's
//! DSH_HOME, idempotently install the desktop-bridge plugin into the web
//! profile, spawn `dsh web` on a random loopback port, poll
//! `/api/host.describe` until ready, then open the main window with the
//! desktop gate signal injected. IPC command backends implement the contract
//! table in the repository AGENTS.md.

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Ready-probe cadence and budget (tsx cold start is slow).
const PROBE_INTERVAL: Duration = Duration::from_millis(500);
const PROBE_BUDGET: Duration = Duration::from_secs(120);

/// The sidecar child, killed when the app exits.
static SIDECAR: Mutex<Option<Child>> = Mutex::new(None);

/// The e2e verdict reported through the IPC channel, if it works.
static E2E_VERDICT: Mutex<Option<String>> = Mutex::new(None);

/// Run the shell.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || match boot_sequence(&app_handle) {
                Ok(()) => {}
                Err(error) => {
                    eprintln!("dsh-desktop: boot failed: {error}");
                    app_handle.exit(1);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dsh_desktop_open_external,
            dsh_desktop_notify,
            dsh_desktop_save_file,
            dsh_desktop_e2e_report
        ])
        .build(tauri::generate_context!())
        .expect("dsh-desktop: tauri context")
        .run(|_app, event| {
            match event {
                RunEvent::Exit => kill_sidecar(),
                RunEvent::ExitRequested { code: Some(code), .. } => {
                    kill_sidecar();
                    std::process::exit(code);
                }
                _ => {}
            }
        });
}

/// Kill the sidecar child if one is running (idempotent).
fn kill_sidecar() {
    if let Ok(mut guard) = SIDECAR.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }
}

/// Boot to a ready window: sidecar spawn, readiness, window creation.
fn boot_sequence(app: &tauri::AppHandle) -> Result<(), String> {
    let runtime = find_runtime()?;
    let bridge = find_bridge()?;
    let logs = shell_root()?;
    let dsh_home = dsh_home()?;

    // The bridge row must be in the profile before the server scans it.
    run_plugin_install(&runtime, &bridge, &dsh_home, &logs)?;

    let port = free_port()?;
    let url = format!("http://127.0.0.1:{port}");
    spawn_sidecar(&runtime, &dsh_home, &logs, port)?;

    if !wait_ready(port) {
        return Err(format!(
            "harness server at {url} did not answer GET / within {}s (see {})",
            PROBE_BUDGET.as_secs(),
            logs.join("logs/sidecar.log").display()
        ));
    }

    let e2e = std::env::var("DSH_DESKTOP_E2E_PROBE").ok().as_deref() == Some("1");
    open_main_window(app, &url, e2e)?;
    Ok(())
}

/// Locate the harness checkout: $DSH_CHECKOUT, then the conventional path.
fn find_checkout() -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(from_env) = std::env::var("DSH_CHECKOUT") {
        candidates.push(PathBuf::from(from_env));
    }
    if let Ok(home) = std::env::var("HOME") {
        candidates.push(Path::new(&home).join("workspace/coding-study/deepseek-harness"));
    }
    for candidate in &candidates {
        if candidate.join("docs/architecture.md").is_file() && candidate.join("apps/cli/src/bin.ts").is_file() {
            return Ok(candidate.clone());
        }
    }
    Err(format!(
        "no DeepSeek Harness checkout found (need docs/architecture.md and apps/cli/src/bin.ts); tried: {}",
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ")
    ))
}

/// How the sidecar is launched: a prebuilt runtime tree, or the source checkout.
struct Runtime {
    /// Node binary (bundled tools or PATH).
    node: PathBuf,
    /// Extra args before the CLI entry (source mode: ["--import", "tsx/esm"]).
    args_prefix: Vec<String>,
    /// The dsh CLI entry (bundled: lib/bin.js; source: apps/cli/src/bin.ts).
    cli: PathBuf,
    /// Working directory for the CLI.
    cwd: PathBuf,
    /// Directories prepended to PATH so the CLI finds pnpm and tools.
    path_prepend: Vec<PathBuf>,
}

/// Build a CLI invocation for the resolved runtime (prefix args, cwd, PATH).
fn cli_command(runtime: &Runtime) -> Command {
    let mut command = Command::new(&runtime.node);
    for arg in &runtime.args_prefix {
        command.arg(arg);
    }
    command.arg(&runtime.cli);
    command.current_dir(&runtime.cwd);
    if !runtime.path_prepend.is_empty() {
        let existing = std::env::var("PATH").unwrap_or_default();
        let prepend = runtime.path_prepend.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(":");
        command.env("PATH", format!("{prepend}:{existing}"));
    }
    command
}

/// Resolve the sidecar runtime: $DSH_DESKTOP_RUNTIME, then the assembled
/// runtime/build/<sha> from runtime/revision.json, then the source checkout.
fn find_runtime() -> Result<Runtime, String> {
    if let Ok(dir) = std::env::var("DSH_DESKTOP_RUNTIME") {
        return bundled_runtime(PathBuf::from(dir));
    }
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let revision_path = repo_root.join("runtime/revision.json");
    if revision_path.is_file() {
        let text = fs::read_to_string(&revision_path).map_err(|e| format!("read {}: {e}", revision_path.display()))?;
        let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("parse {}: {e}", revision_path.display()))?;
        let sha = value.get("sha").and_then(|s| s.as_str()).unwrap_or("");
        if !sha.is_empty() {
            let dir = repo_root.join("runtime/build").join(sha);
            if dir.join("dsh/lib/bin.js").is_file() {
                return bundled_runtime(dir);
            }
        }
    }
    source_runtime()
}

/// The assembled prebuilt runtime tree (prepare-runtime.mjs output).
fn bundled_runtime(dir: PathBuf) -> Result<Runtime, String> {
    let cli = dir.join("dsh/node_modules/@deepseek-ai/dsh/lib/bin.js");
    if !cli.is_file() {
        return Err(format!("bundled runtime missing CLI entry: {}", cli.display()));
    }
    let node = dir.join("tools/node_modules/node/bin/node");
    if !node.is_file() {
        return Err(format!("bundled runtime missing node binary: {}", node.display()));
    }
    Ok(Runtime {
        node,
        args_prefix: Vec::new(),
        cli,
        cwd: dir.join("dsh"),
        path_prepend: vec![dir.join("tools/node_modules/.bin"), dir.join("tools/node_modules/node/bin")],
    })
}

/// The source checkout (dev): tsx-run CLI from the fork working tree.
fn source_runtime() -> Result<Runtime, String> {
    let checkout = find_checkout()?;
    let node = std::env::var("DSH_NODE").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("node"));
    Ok(Runtime {
        node,
        args_prefix: vec!["--import".to_string(), "tsx/esm".to_string()],
        cli: checkout.join("apps/cli/src/bin.ts"),
        cwd: checkout,
        path_prepend: Vec::new(),
    })
}

/// The bridge package directory: $DSH_DESKTOP_BRIDGE, then the dev checkout layout.
fn find_bridge() -> Result<PathBuf, String> {
    if let Ok(from_env) = std::env::var("DSH_DESKTOP_BRIDGE") {
        let p = PathBuf::from(from_env);
        if p.join("package.json").is_file() {
            return Ok(p);
        }
        return Err(format!("DSH_DESKTOP_BRIDGE={} has no package.json", p.display()));
    }
    // Dev builds bake the crate directory; release packaging rewrites this discovery.
    let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../plugin/dsh-desktop-bridge");
    if dev.join("package.json").is_file() {
        return Ok(dev);
    }
    Err(format!(
        "desktop-bridge package not found at {} (set DSH_DESKTOP_BRIDGE)",
        dev.display()
    ))
}

/// The shell-private root (`~/.dsh-desktop/`): logs only.
fn shell_root() -> Result<PathBuf, String> {
    let user_home = std::env::var("HOME").map_err(|_| "$HOME is not set".to_string())?;
    let root = Path::new(&user_home).join(".dsh-desktop");
    fs::create_dir_all(root.join("logs")).map_err(|e| format!("create {}: {e}", root.join("logs").display()))?;
    Ok(root)
}

/// The DSH home the sidecar runs with: the user's real `~/.dsh`, shared with
/// the terminal (sessions, workspaces, settings, credentials — the desktop
/// IS another face of the same account). $DSH_HOME overrides for isolation.
/// Caveat: two live harness servers on one home have no locking story —
/// mostly fine for one user (per-session JSONL logs; JSON storages are
/// last-wins whole-file writes), but a shared session being driven from two
/// faces at once is undefined. Coordinated single-instance is an M2 item.
fn dsh_home() -> Result<PathBuf, String> {
    if let Ok(from_env) = std::env::var("DSH_HOME") {
        if !from_env.is_empty() {
            return Ok(PathBuf::from(from_env));
        }
    }
    let user_home = std::env::var("HOME").map_err(|_| "$HOME is not set".to_string())?;
    Ok(Path::new(&user_home).join(".dsh"))
}

/// Idempotently ensure the bridge row is installed in the web profile.
/// pnpm versions flap between machines (store v10 vs v11): when the install
/// fails on the store-mismatch error, relink the profile with a plain
/// `pnpm install` through the dsh CLI's own recovery and retry once.
fn run_plugin_install(runtime: &Runtime, bridge: &Path, dsh_home: &Path, logs: &Path) -> Result<(), String> {
    match plugin_install_once(runtime, bridge, dsh_home, logs) {
        Ok(()) => Ok(()),
        Err(first) => {
            eprintln!("dsh-desktop: plugin install failed once ({first}); relinking the profile and retrying");
            relink_profile(runtime, dsh_home, logs)?;
            plugin_install_once(runtime, bridge, dsh_home, logs)
        }
    }
}

/// One plugin-install attempt.
fn plugin_install_once(runtime: &Runtime, bridge: &Path, dsh_home: &Path, logs: &Path) -> Result<(), String> {
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("logs/install.log"))
        .map_err(|e| format!("open install log: {e}"))?;
    let status = cli_command(runtime)
        .arg("plugin")
        .arg("--profile")
        .arg("web")
        .arg("add")
        .arg(bridge)
        .env("DSH_HOME", dsh_home)
        .stdout(Stdio::from(log.try_clone().map_err(|e| format!("clone log: {e}"))?))
        .stderr(Stdio::from(log))
        .status()
        .map_err(|e| format!("run plugin add: {e}"))?;
    if !status.success() {
        return Err(format!("plugin --profile web add failed with {status}"));
    }
    Ok(())
}

/// Relink the profile's node_modules with a plain install (recovers from a
/// pnpm store-version mismatch: node_modules linked from a store built by a
/// different pnpm major). Runs the same dsh CLI the plugin command uses.
fn relink_profile(runtime: &Runtime, dsh_home: &Path, logs: &Path) -> Result<(), String> {
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("logs/install.log"))
        .map_err(|e| format!("open install log: {e}"))?;
    let status = cli_command(runtime)
        .arg("plugin")
        .arg("--profile")
        .arg("web")
        .arg("install")
        .env("DSH_HOME", dsh_home)
        .env("CI", "true")
        .stdout(Stdio::from(log.try_clone().map_err(|e| format!("clone log: {e}"))?))
        .stderr(Stdio::from(log))
        .status()
        .map_err(|e| format!("run profile relink: {e}"))?;
    if !status.success() {
        return Err(format!("profile relink failed with {status}"));
    }
    Ok(())
}

/// Ask the OS for one free loopback port.
fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind for port pick: {e}"))?;
    let port = listener.local_addr().map_err(|e| format!("read local addr: {e}"))?.port();
    drop(listener);
    Ok(port)
}

/// Spawn the harness web server as a direct node child (no pnpm layer).
fn spawn_sidecar(runtime: &Runtime, dsh_home: &Path, logs: &Path, port: u16) -> Result<(), String> {
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("logs/sidecar.log"))
        .map_err(|e| format!("open sidecar log: {e}"))?;
    let child = cli_command(runtime)
        .arg("web")
        .arg("--port")
        .arg(port.to_string())
        .env("DSH_HOME", dsh_home)
        .stdout(Stdio::from(log.try_clone().map_err(|e| format!("clone sidecar log: {e}"))?))
        .stderr(Stdio::from(log))
        .spawn()
        .map_err(|e| format!("spawn sidecar: {e}"))?;
    SIDECAR.lock().map_err(|e| e.to_string())?.replace(child);
    Ok(())
}

/// Poll `GET /` until the webserver answers 2xx, within the budget.
fn wait_ready(port: u16) -> bool {
    let started = Instant::now();
    while started.elapsed() < PROBE_BUDGET {
        if probe_ready(port) {
            return true;
        }
        std::thread::sleep(PROBE_INTERVAL);
    }
    false
}

/// One hand-rolled HTTP probe (no HTTP client dependency for one status line).
fn probe_ready(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 32];
    let Ok(n) = stream.read(&mut head) else {
        return false;
    };
    // Any 2xx status means the webserver (and its SPA index) is answering.
    let text = String::from_utf8_lossy(&head[..n]);
    text.starts_with("HTTP/1.1 2") || text.starts_with("HTTP/1.0 2")
}

/// Create the main window on the UI thread with the gate signal injected.
fn open_main_window(app: &tauri::AppHandle, url: &str, e2e: bool) -> Result<(), String> {
    let platform = std::env::consts::OS;
    let gate = format!(
        "window.__DSH_DESKTOP__ = {{ version: 1, shell: 'dsh-desktop', platform: '{platform}' }};"
    );
    let init_script = if e2e {
        format!("{gate}{}", e2e_error_hooks())
    } else {
        gate
    };
    let handle = app.clone();
    let load_url = if e2e { format!("{url}/?e2e=1") } else { url.to_string() };
    let load_parsed: tauri::Url = load_url.parse().map_err(|e| format!("parse {load_url}: {e}"))?;
    app.run_on_main_thread(move || {
        let window = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(load_parsed))
            .title("DeepSeek Harness")
            .inner_size(1400.0, 900.0)
            .initialization_script(&init_script)
            .build();
        match window {
            Ok(window) => {
                println!("dsh-desktop: window built, loading {load_url}");
                if e2e {
                    eval_when_loaded(&handle, &window);
                    watch_e2e_title(handle, window);
                }
            }
            Err(error) => eprintln!("dsh-desktop: window build failed: {error}"),
        }
    })
    .map_err(|e| format!("schedule window creation: {e}"))
}

/// Inject the e2e probe by eval once the SPA has had time to settle: init
/// scripts run before page scripts exist, while the probe wants the loaded
/// DOM. Waiting on the URL becoming the final http document is the cheapest
/// settle signal; the probe's own waitFs cover the rest.
fn eval_when_loaded(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let app = app.clone();
    let window = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        // wry's WKWebView eval must run on the main thread; scheduling through
        // the app handle keeps the background thread out of the webview.
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = window.eval(&e2e_probe_script()) {
                println!("dsh-desktop e2e: probe eval failed: {error}");
            }
        }) {
            println!("dsh-desktop e2e: probe scheduling failed: {error}");
        }
    });
}

/// Page-error hooks for the e2e run: route window errors and unhandled
/// rejections into the location-hash channel the shell polls.
fn e2e_error_hooks() -> String {
    r#"
(function () {
  var send = function (kind, text) {
    try {
      if ((location.hash || '').indexOf('#dsh-e2e-') === 0) return
      history.replaceState(null, '', '#dsh-' + kind + '-' + encodeURIComponent(String(text).slice(0, 200)))
    } catch (error) { /* nothing else to do */ }
  }
  window.addEventListener('error', function (event) {
    send('err', (event.error && event.error.message) || event.message || 'error')
  })
  window.addEventListener('unhandledrejection', function (event) {
    send('rej', (event.reason && event.reason.message) || String(event.reason) || 'rejection')
  })
})()
"#
    .to_string()
}

/// The e2e probe: gate → IPC carrier → badge DOM → save-file roundtrip.
/// Every stage rejects through the promise chain, so any failure lands in
/// the window title the shell polls.
fn e2e_probe_script() -> String {
    r#"
(function () {
  function report(verdict) {
    try { history.replaceState(null, '', '#dsh-e2e-' + encodeURIComponent(verdict)) } catch (error) { /* hash channel dead */ }
    try {
      var reported = window.__TAURI_INTERNALS__.invoke('dsh_desktop_e2e_report', { verdict: verdict })
      if (reported && typeof reported.catch === 'function') reported.catch(function () { /* IPC refused; the hash above already carries the verdict */ })
    } catch (error) { /* IPC carrier unusable */ }
  }
  function waitFor(pred, timeoutMs, what) {
    return new Promise(function (resolve, reject) {
      var started = Date.now()
      var tick = function () {
        var value
        try { value = pred() } catch (error) { return reject(error) }
        if (value) return resolve(undefined)
        if (Date.now() - started > timeoutMs) return reject(new Error('timeout waiting for ' + what))
        setTimeout(tick, 500)
      }
      setTimeout(tick, 500)
    })
  }
  var stage = function (name) {
    try { history.replaceState(null, '', '#dsh-stage-' + name) } catch (error) { /* best effort */ }
  }
  Promise.resolve()
    .then(function () {
      stage('gate')
      if (window.__DSH_DESKTOP__ === undefined) throw new Error('gate signal missing')
      return waitFor(function () { return window.__TAURI_INTERNALS__ !== undefined }, 30000, '__TAURI_INTERNALS__')
    })
    .then(function () {
      stage('app-root')
      return waitFor(function () {
        var root = document.getElementById('root')
        return root !== null && root.childElementCount > 0
      }, 60000, 'app root content (boot graph: ' + (window.__DSH_BOOT__ ? 'present' : 'absent') + ')')
    })
    .then(function () {
      stage('badge')
      return waitFor(function () { return document.querySelector('[data-desktop-badge]') !== null }, 60000, 'badge DOM')
    })
    .then(function () {
      stage('save-invoke')
      return Promise.race([
        window.__TAURI_INTERNALS__.invoke('dsh_desktop_save_file', { name: 'dsh-e2e-probe.txt', base64: btoa('dsh-desktop e2e check') }),
        new Promise(function (_, reject) { setTimeout(function () { reject(new Error('save invoke timed out')) }, 30000) }),
      ])
    })
    .then(function (saved) {
      if (typeof saved !== 'string' || saved.length === 0) throw new Error('save returned no path')
      report('OK')
    })
    .catch(function (error) {
      var diag = 'root=' + (document.getElementById('root') ? document.getElementById('root').childElementCount : -1)
        + ',overlay=' + (document.querySelector('div[data-slot="shell.overlay"]') ? document.querySelector('div[data-slot="shell.overlay"]').childElementCount : -1)
      var match = document.body.innerText.match(/\/plugins\/[^\s]+client\.js\?rev=[a-f0-9]+/)
      if (match === null) {
        report('FAIL:' + String(error && error.message ? error.message : error).slice(0, 120) + ' | ' + diag + ' | body=' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))
        return
      }
      fetch(match[0]).then(function (r) {
        if (!r.ok) throw new Error('retry fetch status ' + r.status)
        return r.text()
      }).then(function (text) {
        report('FAIL:retry-ok bytes=' + text.length + ' | ' + diag)
      }).catch(function (fetchError) {
        report('FAIL:retry-' + String(fetchError && fetchError.message ? fetchError.message : fetchError).slice(0, 120) + ' | ' + diag)
      })
    })
})()
"#
    .to_string()
}

/// Poll both verdict channels for the e2e result; log it and optionally exit.
/// The title channel is dead on macOS (WKWebView document.title does not
/// sync to the NSWindow title), so the channels are the IPC command and the
/// location-hash fallback written by the probe.
fn watch_e2e_title(app: tauri::AppHandle, window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        let started = Instant::now();
        let exit_when_done = std::env::var("DSH_DESKTOP_E2E_EXIT").ok().as_deref() == Some("1");
        let mut last_fragment = String::new();
        while started.elapsed() < Duration::from_secs(120) {
            std::thread::sleep(Duration::from_millis(500));
            // Hash diagnostics: read the URL only after navigation must have
            // committed, and contain wry's nil-URL panic for good measure.
            if started.elapsed() >= Duration::from_secs(20) {
                let read = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| window.url().ok()));
                if let Ok(Some(url)) = read {
                    let fragment = url.fragment().unwrap_or_default();
                    if fragment != last_fragment && !fragment.is_empty() {
                        println!("dsh-desktop e2e: fragment -> {fragment}");
                        last_fragment = fragment.to_string();
                    }
                }
            }
            let Some(verdict) = ipc_verdict() else { continue };
            println!("dsh-desktop e2e: DSH_E2E_{verdict}");
            use std::io::Write as _;
            let _ = std::io::stdout().flush();
            if exit_when_done {
                app.exit(if verdict.starts_with("OK") { 0 } else { 2 });
            }
            return;
        }
        println!("dsh-desktop e2e: timed out waiting for the probe verdict");
        if exit_when_done {
            app.exit(3);
        }
    });
}

/// The verdict stored by the IPC report command, if any.
fn ipc_verdict() -> Option<String> {
    E2E_VERDICT.lock().ok().and_then(|guard| guard.clone())
}

/// IPC: the e2e probe's verdict report (primary verdict channel).
#[tauri::command]
fn dsh_desktop_e2e_report(verdict: String) -> Result<(), String> {
    if let Ok(mut guard) = E2E_VERDICT.lock() {
        *guard = Some(verdict);
    }
    Ok(())
}

/// IPC: open a URL in the system browser (scheme-whitelisted).
#[tauri::command]
fn dsh_desktop_open_external(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    let allowed = lower.starts_with("http://") || lower.starts_with("https://")
        || lower.starts_with("mailto:") || lower.starts_with("tel:");
    if !allowed {
        return Err(format!("scheme not allowed: {url}"));
    }
    let opener = match std::env::consts::OS {
        "macos" => ("open", vec![url]),
        "windows" => ("cmd", vec!["/C".to_string(), "start".to_string(), url]),
        _ => ("xdg-open", vec![url]),
    };
    Command::new(opener.0)
        .args(opener.1)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("open external: {e}"))
}

/// IPC: fire a native system notification (best effort).
#[tauri::command]
fn dsh_desktop_notify(title: String, body: String) -> Result<(), String> {
    let esc = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");
    let status = match std::env::consts::OS {
        "macos" => Command::new("osascript")
            .arg("-e")
            .arg(format!("display notification \"{}\" with title \"{}\"", esc(&body), esc(&title)))
            .status(),
        _ => Command::new("notify-send")
            .arg(title)
            .arg(body)
            .status(),
    };
    match status {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("notify exited {status}")),
        Err(e) => Err(format!("notify spawn: {e}")),
    }
}

/// IPC: write base64 bytes into the user's Downloads directory.
#[tauri::command]
fn dsh_desktop_save_file(name: String, base64: String) -> Result<String, String> {
    let sanitized = name
        .rsplit(['/', '\\'])
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("download")
        .to_string();
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, base64.as_bytes())
        .map_err(|e| format!("base64 decode: {e}"))?;
    let dir = downloads_dir()?;
    let path = unique_path(&dir, &sanitized);
    fs::write(&path, bytes).map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(path.display().to_string())
}

/// The user's Downloads directory ($HOME/Downloads, created on demand).
fn downloads_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "$HOME is not set".to_string())?;
    let dir = Path::new(&home).join("Downloads");
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// `name.ext` → first free `name.ext` / `name-1.ext` / `name-2.ext` / …
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (name.to_string(), String::new()),
    };
    for n in 1.. {
        let candidate = dir.join(format!("{stem}-{n}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!("the loop returns on the first free candidate")
}
