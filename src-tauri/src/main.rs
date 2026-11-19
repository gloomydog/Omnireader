// OmniReader — a lightweight e-book / document reader for Linux.
// The Rust side only does file I/O, dialogs and small helpers; rendering is done in the WebView.

use std::path::{Path, PathBuf};
use tauri::ipc::Response;
use tauri_plugin_dialog::DialogExt;

const IDENTIFIER: &str = "io.github.omnireader";

const BOOK_EXTS: &[&str] = &[
    "epub", "pdf", "mobi", "azw3", "azw", "fb2", "fbz", "cbz",
    "txt", "text", "md", "markdown", "html", "htm", "xhtml",
];
const CODE_EXTS: &[&str] = &[
    "py", "js", "mjs", "ts", "tsx", "jsx", "rs", "go", "c", "h", "cc", "cpp", "hpp", "java", "kt", "scala",
    "swift", "rb", "php", "pl", "lua", "r", "jl", "sh", "bash", "zsh", "sql", "css", "scss", "json", "yaml",
    "yml", "toml", "ini", "cfg", "conf", "xml", "vue", "svelte", "dart", "cs", "hs", "ml", "ex", "exs", "erl",
    "clj", "el", "vim", "nix", "tf", "diff", "patch", "log", "csv", "tsv", "cmake", "mk", "asm", "zig", "nim",
    "proto", "graphql", "tex", "bib",
];

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// $XDG_DATA_HOME, or ~/.local/share
fn data_home() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home().join(".local/share"))
}

/// ~/.local/share/omnireader — the word book lives here
fn data_dir() -> PathBuf {
    data_home().join("omnireader")
}

fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// One-time migration from the app's previous name ("Shiori"):
/// reading positions / highlights / settings (WebView storage) and the word book.
fn migrate_from_old_name() {
    let base = data_home();
    let (old_web, new_web) = (base.join("app.shiori.reader"), base.join(IDENTIFIER));
    if old_web.is_dir() && !new_web.exists() {
        for sub in ["localstorage", "storage"] {
            let from = old_web.join(sub);
            if from.is_dir() {
                let _ = copy_dir(&from, &new_web.join(sub));
            }
        }
    }
    let (old_wb, new_wb) = (base.join("shiori/wordbook.json"), data_dir().join("wordbook.json"));
    if old_wb.is_file() && !new_wb.exists() {
        let _ = std::fs::create_dir_all(data_dir());
        let _ = std::fs::copy(old_wb, new_wb);
    }
}

// File I/O commands are async so they run off the main thread and never block the UI.

/// Whole file as raw bytes (used for small files)
#[tauri::command]
async fn read_file(path: String) -> Result<Response, String> {
    std::fs::read(&path).map(Response::new).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
async fn file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path).map(|m| m.len()).map_err(|e| format!("{path}: {e}"))
}

/// Read only a byte range (large files are read on demand)
#[tauri::command]
async fn read_range(path: String, start: u64, len: u64) -> Result<Response, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(&path).map_err(|e| format!("{path}: {e}"))?;
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = Vec::with_capacity(len.min(256 << 20) as usize);
    f.take(len).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(Response::new(buf))
}

/// Timing logs are printed to stderr only when OMNIREADER_DEBUG is set
#[tauri::command]
fn debug_enabled() -> bool {
    std::env::var_os("OMNIREADER_DEBUG").is_some()
}
#[tauri::command]
fn debug_log(msg: String) {
    if std::env::var_os("OMNIREADER_DEBUG").is_some() {
        eprintln!("[omnireader] {msg}");
    }
}

/// File passed on the command line (`omnireader book.epub`)
#[tauri::command]
fn initial_path() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .and_then(|p| std::fs::canonicalize(p).ok())
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_file(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Open / 開く")
        .set_directory(home())
        .add_filter("All supported", &[BOOK_EXTS, CODE_EXTS].concat())
        .add_filter("Books & text", BOOK_EXTS)
        .add_filter("Source code", CODE_EXTS)
        .blocking_pick_file()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

// ---------- word book ----------

#[tauri::command]
async fn wordbook_load() -> String {
    std::fs::read_to_string(data_dir().join("wordbook.json")).unwrap_or_else(|_| "[]".into())
}

#[tauri::command]
async fn wordbook_save(json: String) -> Result<(), String> {
    write_atomic(&data_dir().join("wordbook.json"), &json)
}

#[tauri::command]
fn wordbook_path() -> String {
    data_dir().join("wordbook.json").to_string_lossy().into_owned()
}

/// Pick a TSV/CSV file and return its contents
#[tauri::command]
async fn import_text(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_directory(home())
        .add_filter("TSV / CSV", &["tsv", "csv", "txt"])
        .blocking_pick_file()
        .and_then(|f| f.into_path().ok())
    else {
        return Ok(None);
    };
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

/// Ask for a destination and write text there
#[tauri::command]
async fn export_text(app: tauri::AppHandle, name: String, content: String) -> Result<Option<String>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_directory(home())
        .set_file_name(&name)
        .blocking_save_file()
        .and_then(|f| f.into_path().ok())
    else {
        return Ok(None);
    };
    write_atomic(&path, &content)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Open a URL in the default browser (http/https only)
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("unsupported url".into());
    }
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn main() {
    migrate_from_old_name();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            file_size,
            read_range,
            debug_enabled,
            debug_log,
            initial_path,
            pick_file,
            wordbook_load,
            wordbook_save,
            wordbook_path,
            import_text,
            export_text,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("failed to run OmniReader");
}
