use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::command;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct TerminalResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

// Validação de segurança para evitar acesso a diretórios críticos do sistema
fn validate_path(path_str: &str) -> Result<PathBuf, String> {
    let path = Path::new(path_str);
    
    let canonical_path = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => path.to_path_buf(),
    };

    let path_lossy = canonical_path.to_string_lossy().to_lowercase();

    let blocked_paths = vec![
        "system32",
        "syswow64",
        "windows\\system32",
        "/etc/shadow",
        "/etc/passwd",
    ];

    for blocked in blocked_paths {
        if path_lossy.contains(blocked) {
            return Err(format!("Acesso negado: O caminho '{}' está numa zona restrita do sistema.", path_str));
        }
    }

    Ok(canonical_path)
}

#[command]
pub async fn agent_fs_read_file(path: String, start_line: Option<usize>, end_line: Option<usize>) -> Result<String, String> {
    let safe_path = validate_path(&path)?;
    if !safe_path.exists() {
        return Err(format!("Ficheiro não encontrado: {}", path));
    }

    let content = fs::read_to_string(&safe_path).map_err(|e| e.to_string())?;

    if let (Some(start), Some(end)) = (start_line, end_line) {
        let lines: Vec<&str> = content.lines().collect();
        let start_idx = start.saturating_sub(1);
        let end_idx = std::cmp::min(end, lines.len());
        if start_idx >= lines.len() {
            return Ok("".to_string());
        }
        return Ok(lines[start_idx..end_idx].join("\n"));
    }

    Ok(content)
}

#[command]
pub async fn agent_fs_write_file(path: String, content: String, create_dirs: Option<bool>) -> Result<(), String> {
    let path_buf = Path::new(&path);
    
    if let Some(true) = create_dirs {
        if let Some(parent) = path_buf.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    fs::write(&path_buf, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn agent_fs_move_path(source: String, destination: String) -> Result<(), String> {
    let src_path = validate_path(&source)?;
    fs::rename(src_path, destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn agent_fs_delete_path(path: String, recursive: Option<bool>) -> Result<(), String> {
    let safe_path = validate_path(&path)?;
    if safe_path.is_dir() {
        if let Some(true) = recursive {
            fs::remove_dir_all(safe_path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_dir(safe_path).map_err(|e| e.to_string())?;
        }
    } else {
        fs::remove_file(safe_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn agent_fs_list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let safe_path = validate_path(&path)?;
    if !safe_path.is_dir() {
        return Err(format!("O caminho '{}' não é um diretório válido.", path));
    }

    let entries = fs::read_dir(safe_path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            result.push(DirEntryInfo {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: path.to_string_lossy().into_owned(),
                is_dir: path.is_dir(),
            });
        }
    }

    Ok(result)
}

#[command]
pub async fn agent_terminal_exec(command: String, cwd: Option<String>, timeout_ms: Option<u64>) -> Result<TerminalResult, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30000));
    
    #[cfg(target_os = "windows")]
    let (shell, arg) = ("cmd", "/C");
    #[cfg(not(target_os = "windows"))]
    let (shell, arg) = ("sh", "-c");

    let mut cmd = Command::new(shell);
    cmd.arg(arg).arg(&command);

    if let Some(ref dir) = cwd {
        cmd.current_dir(dir);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Err(format!("Falha ao iniciar processo: {}", e)),
    };

    let start_time = Instant::now();
    let mut timed_out = false;

    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if start_time.elapsed() > timeout {
                    let _ = child.kill();
                    timed_out = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Erro ao aguardar processo: {}", e)),
        }
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;

    Ok(TerminalResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
        timed_out,
    })
}
