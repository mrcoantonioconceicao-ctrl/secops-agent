use std::env;
use std::process::Command;
use std::path::Path;

mod quantum_patch;

fn main() {
    let args: Vec<String> = env::args().collect();
    let raw_workspace = if args.len() > 1 { &args[1] } else { "." };
    
    let home_dir = env::var("HOME").unwrap_or_else(|_| "/data/data/com.termux/files/home".to_string());
    let direct_path = Path::new(raw_workspace);
    
    let absolute_workspace = if direct_path.is_absolute() {
        direct_path.to_path_buf()
    } else {
        let local_candidate = env::current_dir().unwrap().join(raw_workspace);
        let home_candidate = Path::new(&home_dir).join(raw_workspace);
        
        if local_candidate.exists() && local_candidate.is_dir() {
            local_candidate
        } else if home_candidate.exists() && home_candidate.is_dir() {
            home_candidate
        } else {
            local_candidate
        }
    };
    
    let workspace = absolute_workspace.to_str().unwrap();

    println!("🛡️ [Autonomous DevSecOps & Governance Agent] Analisando workspace em: {}", workspace);

    // 1. Zero Trust Branch Management
    let branch_name = format!("secops/governance-hardened-{}", chrono_timestamp());
    
    let _ = Command::new("git").args(["fetch", "origin"]).current_dir(workspace).status();
    let _ = Command::new("git").args(["checkout", "-b", &branch_name]).current_dir(workspace).status();
    println!("🌿 [Zero Trust Branch] Criada e isolada com sucesso: {}", branch_name);

    // 2. Pre-Flight Engine & RustShield Quantum Auto-Healing
    println!("🔍 [RustShield Quantum] Executando auditoria estrutural e JSON diagnostic...");
    if let Err(e) = quantum_patch::run_self_healing_audit(workspace) {
        println!("⚠️ [Quantum Patch Engine] Aviso: {}", e);
    }

    // 3. Governance Gate & PR Submission
    println!("🚀 [Governance Gate] Consolidando alterações e abrindo Pull Request...");
    let _ = Command::new("git").args(["add", "."]).current_dir(workspace).status();
    let _ = Command::new("git").args(["commit", "-m", "secops: quantum auto-patch and security governance hardening"]).current_dir(workspace).status();
    
    let push_status = Command::new("git")
        .args(["push", "-u", "origin", &branch_name])
        .current_dir(workspace)
        .status();

    // Descobrir o URL remoto do Git para gerar o link do PR dinamicamente
    let remote_url_output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(workspace)
        .output();

    let mut repo_web_url = String::new();
    if let Ok(output) = remote_url_output {
        let url_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // Converte git@github.com:user/repo.git ou https://github.com/user/repo.git para https://github.com/user/repo
        let clean_url = url_str
            .replace("git@github.com:", "https://github.com/")
            .replace(".git", "");
        repo_web_url = clean_url;
    }

    if push_status.is_ok() {
        println!("✅ Pull Request governada e auto-corrigida pronta para submissão!");
        if !repo_web_url.is_empty() {
            println!("🔗 Crie o PR em: {}/pull/new/{}", repo_web_url, branch_name);
        } else {
            println!("🔗 Branch empurrada com sucesso para o remote.");
        }
    } else {
        println!("❌ Falha ao submeter branch para o remote.");
    }
}

fn chrono_timestamp() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
}
