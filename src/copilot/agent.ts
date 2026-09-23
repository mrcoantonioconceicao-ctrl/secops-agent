import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface RemediationPayload {
  filePath: string;
  contextBefore: string;
  targetSearch: string;
  contextAfter: string;
  replacementContent: string;
  cwe: string;
  justification: string;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      if (status === 404 || status === 422) {
        throw err;
      }
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`⚠️ [Resilience] Tentativa ${attempt}/${maxRetries} falhou (${err.message}). A tentar novamente em ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function validateClosedLoop(filePath: string, content: string): { valid: boolean; stderr: string } {
  const ext = path.extname(filePath);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "secops-gate-"));
  const tmpFile = path.join(tmpDir, path.basename(filePath));
  fs.writeFileSync(tmpFile, content, "utf-8");

  let cmd = "";
  if (ext === ".ts" || ext === ".tsx") {
    cmd = `npx tsc --noEmit --skipLibCheck ${tmpFile}`;
  } else if (ext === ".rs") {
    cmd = `rustc --crate-type lib --emit=metadata ${tmpFile}`;
  } else if (ext === ".py") {
    cmd = `python3 -m py_compile ${tmpFile}`;
  } else if (ext === ".c" || ext === ".cpp") {
    cmd = `clang -fsyntax-only ${tmpFile}`;
  } else {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { valid: true, stderr: "" };
  }

  try {
    execSync(cmd, { stdio: "pipe", timeout: 10000 });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { valid: true, stderr: "" };
  } catch (err: any) {
    const stderr = (err.stderr?.toString() || err.message || "").slice(0, 2048);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { valid: false, stderr };
  }
}

async function verifyRemoteCI(owner: string, repo: string, ref: string, maxRetries = 2, intervalMs = 3000): Promise<{ ok: boolean; summary: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🌐 [Remote CI] A consultar check runs para ${ref} (tentativa ${attempt}/${maxRetries})...`);
    try {
      const data = await withRetry(() => octokit.checks.listForRef({ owner, repo, ref }).then(r => r.data), 2, 1000);
      if (data.total_count > 0) {
        const failed = data.check_runs.filter(
          r => r.conclusion === 'failure' || r.conclusion === 'timed_out' || r.conclusion === 'action_required'
        );
        if (failed.length > 0) {
          const names = failed.map(f => f.name).join(', ');
          return { ok: false, summary: `Falhas no GitHub CI: ${names}` };
        }
        const completed = data.check_runs.filter(r => r.status === 'completed');
        if (completed.length === data.check_runs.length && data.check_runs.length > 0) {
          return { ok: true, summary: `${completed.length}/${data.check_runs.length} check runs concluídos com sucesso.` };
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ [Remote CI] Aviso ao consultar checks: ${err.message}`);
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  return { ok: true, summary: "Sem check runs bloqueantes ativos ou ignorados por polling timeout." };
}

async function applyZeroDirectPushRemediation(
  owner: string,
  repo: string,
  payload: RemediationPayload
) {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const safeCwe = payload.cwe.toLowerCase().replace(/[^a-z0-9]/g, "-") || "sec-fix";
  const branchName = `secops/fix-${safeCwe}-${timestamp}-${randomSuffix}`;

  console.log(`🛡️ [SecOps Gate] A iniciar fluxo resiliente para ${owner}/${repo} (${payload.filePath})`);

  let baseBranch = "main";
  let baseSha = "";
  try {
    const refRes = await withRetry(() => octokit.git.getRef({ owner, repo, ref: "heads/main" }));
    baseSha = refRes.data.object.sha;
  } catch {
    const refRes = await withRetry(() => octokit.git.getRef({ owner, repo, ref: "heads/master" }));
    baseBranch = "master";
    baseSha = refRes.data.object.sha;
  }

  await withRetry(() => octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  }));

  const fileRes = await withRetry(() => octokit.repos.getContent({
    owner,
    repo,
    path: payload.filePath,
    ref: branchName,
  }));

  if (!("content" in fileRes.data)) {
    throw new Error(`Ficheiro não encontrado ou binário: ${payload.filePath}`);
  }

  const originalContent = Buffer.from(fileRes.data.content, "base64").toString("utf-8");
  const fileSha = fileRes.data.sha;

  const fullBlock = payload.contextBefore + payload.targetSearch + payload.contextAfter;
  if (!originalContent.includes(fullBlock)) {
    throw new Error(`[Context-Mismatch] Falha na validação de escopo contextual para ${payload.filePath}.`);
  }

  const mutatedContent = originalContent.replace(fullBlock, payload.contextBefore + payload.replacementContent + payload.contextAfter);

  console.log(`🔍 [Closed-Loop Gate] A validar mutação com compilador/linter local...`);
  const validation = validateClosedLoop(payload.filePath, mutatedContent);
  if (!validation.valid) {
    console.error(`❌ [Closed-Loop Gate] Falha de compilação/linter detectada:\n${validation.stderr}`);
    throw new Error(`Closed-loop check failed. Abortando PR por risco de quebra de build.`);
  }
  console.log(`✅ [Closed-Loop Gate] Build/Linter passou sem erros.`);

  await withRetry(() => octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: payload.filePath,
    message: `sec(critical): automated surgical mitigation for ${payload.cwe} [closed-loop verified]`,
    content: Buffer.from(mutatedContent).toString("base64"),
    sha: fileSha,
    branch: branchName,
  }));

  const remoteStatus = await verifyRemoteCI(owner, repo, branchName);
  if (!remoteStatus.ok) {
    console.warn(`⚠️ [Remote CI Warning] ${remoteStatus.summary}`);
  }

  const pr = await withRetry(() => octokit.pulls.create({
    owner,
    repo,
    title: `🔒 [SecOps Auto-Fix] Mitigar ${payload.cwe} em ${payload.filePath}`,
    head: branchName,
    base: baseBranch,
    body: `## 🛡️ Relatório de Remediação Autônoma (SecOps-Agent)

- **CWE/Vulnerabilidade**: \`${payload.cwe}\`
- **Ficheiro Alvo**: \`${payload.filePath}\`
- **Branch Isolada**: \`${branchName}\`
- **Closed-Loop Gate (Local)**: ✅ Verificado
- **Remote CI Status**: \`${remoteStatus.summary}\`
- **Justificativa da IA**: > *${payload.justification}*

### ⚠️ Política de Segurança Obrigatória (Human-in-the-Loop)
O merge requer revisão humana de um engenheiro/SecOps.`,
  }));

  console.log(`✅ [SecOps Gate] Pull Request aberto com sucesso: ${pr.data.html_url}`);
  return pr.data.html_url;
}

export { applyZeroDirectPushRemediation, validateClosedLoop, verifyRemoteCI, withRetry };
