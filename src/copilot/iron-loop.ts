import { spawnSync } from 'child_process';
import * as path from 'path';

export interface IronLoopOptions {
  workspaceDir?: string;
}

const SHELL_TERMUX = '/data/data/com.termux/files/usr/bin/bash';
const termuxPath = '/data/data/com.termux/files/usr/bin:/data/data/com.termux/files/usr/local/bin:' + (process.env.PATH || '');

function runBin(binArgs: string, cwd: string): boolean {
  console.log(`[IronLoop] Exec -> ${binArgs} (cwd: ${cwd})`);
  const fullCmd = `export PATH="${termuxPath}"; export LD_LIBRARY_PATH="/data/data/com.termux/files/usr/lib"; ${binArgs}`;
  const res = spawnSync(SHELL_TERMUX, ['-c', fullCmd], { 
    cwd, 
    stdio: 'inherit',
    env: { ...process.env, PATH: termuxPath }
  });
  if (res.error) {
    console.error(`[IronLoop] ❌ Erro de exec:`, res.error.message);
  }
  if (res.status !== 0) {
    console.error(`[IronLoop] ⚠️ Processo encerrou com exit code ${res.status}`);
  }
  return res.status === 0;
}

export function executeIronLoop(options: IronLoopOptions = {}) {
  const ws = path.resolve(options.workspaceDir || process.env.TARGET_WORKSPACE || process.cwd());

  console.log(`[IronLoop] Verificando integridade atômica em: ${ws}`);
  
  const ok = runBin('cargo check --workspace --target bpfel-unknown-unknown', ws);
  
  if (ok) {
    console.log('[IronLoop] ✔️ Gate atômico aprovado. Workspace íntegro.');
    return true;
  } else {
    console.error('[IronLoop] ❌ Falha crítica no gate atômico. Disparando rollback estrito...');
    const resetOk = runBin('git reset --hard HEAD && git clean -fd', ws);
    if (resetOk) {
      console.log('[IronLoop] 🔄 Workspace do alvo revertido com sucesso.');
    } else {
      console.error('[IronLoop] ⚠️ Falha crítica no rollback git.');
    }
    return false;
  }
}

const isDirectRun = process.argv.some(arg => arg.endsWith('iron-loop.ts'));
if (isDirectRun) {
  const target = process.env.TARGET || process.cwd();
  const ok = executeIronLoop({ workspaceDir: target });
  process.exit(ok ? 0 : 1);
}
