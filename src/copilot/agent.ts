import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

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

/**
 * ZER0-DIRECT-PUSH GATED REMEDIATION ENGINE
 * Isola alteração em branch dedidaca e abre Pull Request para revisão humana.
 */
async function applyZeroDirectPushRemediation(
  owner: string,
  repo: string,
  payload: RemediationPayload
) {
  const timestamp = Date.now();
  const safeCwe = payload.cwe.toLowerCase().replace(/[^a-z0-9]/g, "-") || "sec-fix";
  const branchName = `secops/fix-${safeCwe}-${timestamp}`;

  console.log(`🛡️ [SecOps Gate] A iniciar fluxo seguro para ${owner}/${repo} (${payload.filePath})`);

  // 1. Identificar branch base (main ou master)
  let baseBranch = "main";
  let baseSha = "";
  try {
    const refRes = await octokit.git.getRef({ owner, repo, ref: "heads/main" });
    baseSha = refRes.data.object.sha;
  } catch {
    const refRes = await octokit.git.getRef({ owner, repo, ref: "heads/master" });
    baseBranch = "master";
    baseSha = refRes.data.object.sha;
  }

  // 2. Criar branch isolada de remediação
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });
  console.log(`🌿 [SecOps Gate] Branch isolada criada: ${branchName}`);

  // 3. Ler arquivo alvo na branch isolada
  const fileRes = await octokit.repos.getContent({
    owner,
    repo,
    path: payload.filePath,
    ref: branchName,
  });

  if (!("content" in fileRes.data)) {
    throw new Error(`Arquivo não encontrado ou binário: ${payload.filePath}`);
  }

  const originalContent = Buffer.from(fileRes.data.content, "base64").toString("utf-8");
  const fileSha = fileRes.data.sha;

  // 4. Aplicar Patch Determinístico Context-Aware
  const fullBlock = payload.contextBefore + payload.targetSearch + payload.contextAfter;
  const targetBlock = payload.contextBefore + payload.replacementContent + payload.contextAfter;

  if (!originalContent.includes(fullBlock)) {
    throw new Error(`[Context-Mismatch] Falha na validação de escopo contextual para ${payload.filePath}. Abortando alteração não determinística.`);
  }

  const mutatedContent = originalContent.replace(fullBlock, targetBlock);

  // 5. Commit na branch isolada
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: payload.filePath,
    message: `sec(critical): automated surgical mitigation for ${payload.cwe}`,
    content: Buffer.from(mutatedContent).toString("base64"),
    sha: fileSha,
    branch: branchName,
  });
  console.log(`💾 [SecOps Gate] Mutação cirúrgica aplicada na branch ${branchName}.`);

  // 6. Abrir Pull Request Formal com Relatório de Auditoria (Human-in-the-Loop Lock)
  const pr = await octokit.pulls.create({
    owner,
    repo,
    title: `🔒 [SecOps Auto-Fix] Mitigar ${payload.cwe} em ${payload.filePath}`,
    head: branchName,
    base: baseBranch,
    body: `## 🛡️ Relatório de Remediação Autônoma (SecOps-Agent)

- **CWE/Vulnerabilidade**: \`${payload.cwe}\`
- **Arquivo Alvo**: \`${payload.filePath}\`
- **Branch Isolada**: \`${branchName}\`
- **Justificativa da IA**: > *${payload.justification}*

### ⚠️ Política de Segurança Obrigatória (Human-in-the-Loop)
Este PR foi gerado e validado de forma estritamente isolada. **O merge requer revisão humana de um engenheiro/SecOps** para garantir que a semântica de negócio não foi alterada indevidamente.`,
  });

  console.log(`✅ [SecOps Gate] Pull Request aberto com sucesso: ${pr.data.html_url}`);
  return pr.data.html_url;
}

// Exemplo de execução/CLI entrypoint
async function main() {
  const targetSlug = process.argv || "mrcoantonioconceicao-ctrl/secops-agent";
  const [owner, repo] = targetSlug.split("/");
  if (!owner || !repo) {
    console.error("Uso: npx tsx src/copilot/agent.ts <owner>/<repo>");
    process.exit(1);
  }

  console.log(`🔍 [SecOps] Varredura e gate ativo em ${owner}/${repo}`);
  // Aqui o core consome SAST/Webhooks e despacha para applyZeroDirectPushRemediation
}

if (import.meta.url === `file://${process.argv}`) {
  main().catch(console.error);
}

export { applyZeroDirectPushRemediation };
