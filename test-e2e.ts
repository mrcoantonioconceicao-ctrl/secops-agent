import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = "mrcoantonioconceicao-ctrl";
const repo = "secops-agent";
const testBranch = "test/e2e-canary-sandbox";
const canaryPath = "canary-vuln-test.ts";

async function runE2E() {
  if (!process.env.GITHUB_TOKEN) {
    console.error("❌ [E2E] GITHUB_TOKEN não está definido no ambiente.");
    process.exit(1);
  }

  console.log("🧪 [E2E] Preparando ambiente de teste isolado...");
  
  // 1. Obter SHA de main e criar branch de teste
  const mainRef = await octokit.git.getRef({ owner, repo, ref: "heads/main" });
  try {
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${testBranch}`, sha: mainRef.data.object.sha });
  } catch {
    await octokit.git.updateRef({ owner, repo, ref: `heads/${testBranch}`, sha: mainRef.data.object.sha, force: true });
  }

  // 2. Injetar arquivo vulnerável de teste (hardcoded secret falso)
  const vulnContent = `const stripeKey = "sk_live_fakekey_for_e2e_testing_99999999";\nexport function doPayment() { return stripeKey; }\n`;
  const base64Content = Buffer.from(vulnContent).toString("base64");
  
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: canaryPath,
    message: "test(canary): inject test vulnerability",
    content: base64Content,
    branch: testBranch
  });
  console.log(`⚠️ [E2E] Canary injetado em ${canaryPath} na branch ${testBranch}.`);

  // 3. Executar o secops-agent apontando para branch de teste via env
  console.log("🤖 [E2E] Disparando secops-agent contra o branch de teste...");
  try {
    process.env.TARGET_BRANCH = testBranch;
    execSync(`npx tsx src/copilot/agent.ts ${owner}/${repo}`, { stdio: "inherit" });
  } catch (err) {
    console.warn("⚠️ [E2E] Execução do agente retornou non-zero, inspecionando estado...");
  }

  // 4. Verificar se o arquivo remoto foi modificado para mitigar o segredo
  const remoteFile = await octokit.repos.getContent({ owner, repo, path: canaryPath, ref: testBranch });
  if ("content" in remoteFile.data) {
    const decoded = Buffer.from(remoteFile.data.content, "base64").toString("utf-8");
    console.log("📄 [E2E] Conteúdo final do arquivo no GitHub:");
    console.log("---");
    console.log(decoded);
    console.log("---");
    
    if (decoded.includes("SECURE_SECRET_REVOKED") || !decoded.includes("sk_live_fakekey_for_e2e_testing_99999999")) {
      console.log("✅ [E2E SUCESSO] O segredo vulnerável foi removido/substituído cirurgicamente de ponta a ponta!");
    } else {
      console.log("❌ [E2E FALHA] O segredo permaneceu inalterado no repositório remoto.");
    }
  }

  // 5. Cleanup: apagar branch de teste
  console.log("🧹 [E2E] Limpando ambiente (removendo branch de teste)...");
  await octokit.git.deleteRef({ owner, repo, ref: `heads/${testBranch}` }).catch(() => {});
  console.log("✨ [E2E] Teste de ponta a ponta finalizado e limpo.");
}

runE2E().catch(console.error);
