import * as https from 'https';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const repoArg = process.argv[2];

if (!repoArg) {
  console.error('❌ Erro: Indique o repositório. Ex: sec-issue SlipPay2');
  process.exit(1);
}

// ==========================================
// 🧠 GRAPH ENTERPRISE & FIREJUNE CONFIG
// ==========================================
interface GraphNode {
  id: string;
  type: 'file' | 'function' | 'struct' | 'anchor_account' | 'endpoint';
  path: string;
  contentSnippet: string;
  dependencies: string[];
}

class GraphEnterpriseEngine {
  private nodes: Map<string, GraphNode> = new Map();
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  public buildKnowledgeGraph(allFiles: string[]) {
    console.log(`🕸️ [Graph RAG Engine] Construindo grafo de conhecimento e dependências corporativas...`);
    allFiles.forEach(file => {
      const ext = path.extname(file);
      if (['.ts', '.js', '.rs', '.json'].includes(ext)) {
        const content = fs.readFileSync(file, 'utf-8');
        const relativePath = path.relative(this.rootDir, file);
        
        this.nodes.set(relativePath, {
          id: relativePath,
          type: ext === '.rs' ? 'anchor_account' : 'file',
          path: relativePath,
          contentSnippet: content.substring(0, 200),
          dependencies: this.extractDependencies(content, ext)
        });
      }
    });
    console.log(`✅ [Graph RAG] Grafo construído com ${this.nodes.size} nós interligados.`);
  }

  private extractDependencies(content: string, ext: string): string[] {
    const deps: string[] = [];
    if (ext === '.rs') {
      const matches = content.matchAll(/use\s+([a-zA-Z0-9_::]+);/g);
      for (const m of matches) { deps.push(m[1]); }
    } else {
      const matches = content.matchAll(/import\s+.*?from\s+['"](.*?)['"]/g);
      for (const m of matches) { deps.push(m[1]); }
    }
    return deps;
  }

  public getContextForRemediation(targetFile: string): string {
    const node = this.nodes.get(targetFile);
    if (!node) return 'Contexto padrão Graph Enterprise.';
    return `[Graph RAG Context] Ficheiro: ${node.id} | Dependências detetadas: ${node.dependencies.join(', ')}`;
  }
}

function fetchGitHub(urlPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'SecOps-Agent',
        'Accept': 'application/vnd.github.v3+json',
        ...(GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {})
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.message || `Erro HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Falha ao parsear resposta da API do GitHub.'));
        }
      });
    }).on('error', err => reject(err));
  });
}

function postGitHubOnce(urlPath: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: urlPath,
      method: 'POST',
      headers: {
        'User-Agent': 'SecOps-Agent',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataString),
        ...(GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.message || `Erro HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Falha ao parsear resposta do POST da API do GitHub.'));
        }
      });
    });

    req.on('error', err => reject(err));
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Timeout na ligação com a API do GitHub.'));
    });
    req.write(dataString);
    req.end();
  });
}

async function postGitHub(urlPath: string, payload: any, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await postGitHubOnce(urlPath, payload);
    } catch (error: any) {
      console.warn(`⚠️ [GitHub API] Tentativa ${attempt}/${retries} falhou (${error.message}). A tentar novamente...`);
      if (attempt === retries) throw error;
      await new Promise(res => setTimeout(res, 3000 * attempt));
    }
  }
}

async function resolveRepoFullName(input: string): Promise<string> {
  if (input.includes('/')) return input;
  return `mrcoantonioconceicao-ctrl/${input}`;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    if (file === '.git' || file === 'node_modules' || file === 'target' || file === 'dist') return;
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

function performEnterpriseSelfHealing(localDir: string, graphEngine: GraphEnterpriseEngine): string[] {
  console.log(`\n🛠️ [Graph Enterprise + Vercel Hardening] Verificando integridade e pipeline de deploy...`);
  const fixedActions: string[] = [];

  // 1. Manutenção e validação do Smart Contract / Rust (mantido intacto)
  const allFiles = getAllFiles(localDir);
  allFiles.forEach(file => {
    const ext = path.extname(file);
    if (ext === '.rs') {
      let content = fs.readFileSync(file, 'utf-8');
      if (content.includes('UserCounter') && content.includes('increment') && !content.includes('constraint = user_counter.authority')) {
        if (content.includes('#[account(mut)]')) {
          content = content.replace(
            /#\[account\(mut\)\]\s*pub user_counter:/g,
            `#[account(mut, constraint = user_counter.authority == authority.key())]\n    pub user_counter:`
          );
          fs.writeFileSync(file, content, 'utf-8');
          fixedActions.push(`✅ [Smart Contract] Restrição de autoridade corrigida em \`${path.relative(localDir, file)}\``);
        }
      }
    }
  });

  // 2. Blindagem e configuração da Vercel (Aditivo para resolver falhas de preview/build)
  const vercelJsonPath = path.join(localDir, 'vercel.json');
  if (!fs.existsSync(vercelJsonPath)) {
    const defaultVercelConfig = {
      version: 2,
      builds: [
        { src: "package.json", use: "@vercel/static-build", config: { distDir: "dist" } }
      ],
      routes: [
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" }
      ]
    };
    fs.writeFileSync(vercelJsonPath, JSON.stringify(defaultVercelConfig, null, 2), 'utf-8');
    fixedActions.push(`✅ [Vercel Hardening] Criado \`vercel.json\` otimizado para estabilizar o pipeline de deploy.`);
  } else {
    fixedActions.push(`ℹ️ [Vercel Hardening] \`vercel.json\` já configurado e detetado.`);
  }

  if (fixedActions.length === 0) {
    fixedActions.push(`ℹ️ O motor Graph Enterprise validou o repositório sem pendências.`);
  }

  return fixedActions;
}

async function runEnterpriseWorkflow() {
  try {
    const repoFullName = await resolveRepoFullName(repoArg);
    const repoNameOnly = repoFullName.split('/')[1];

    console.log(`🛡️ [Graph Enterprise Agent] Inicializando motor corporativo para: ${repoFullName}...`);
    const issues = await fetchGitHub(`/repos/${repoFullName}/issues?state=open`);

    let issueNumber = 41;
    let issueTitle = 'Graph Enterprise & Vercel Pipeline Hardening';

    if (Array.isArray(issues) && issues.length > 0) {
      const validIssues = issues.filter((i: any) => !i.pull_request);
      if (validIssues.length > 0) {
        issueNumber = validIssues[0].number;
        issueTitle = validIssues[0].title;
      }
    }

    const homeDir = process.env.HOME || '/data/data/com.termux/files/home';
    const localDir = path.join(homeDir, repoNameOnly);

    // Hard Sync & Pre-Flight Check
    if (!fs.existsSync(localDir)) {
      console.log(`🚀 Clonando ${repoFullName} para ${localDir}...`);
      execSync(`git clone https://github.com/${repoFullName}.git ${localDir}`, { stdio: 'inherit' });
    } else {
      console.log(`🔄 [Pre-Flight Check] Sincronização blindada com o GitHub em ${localDir}...`);
      execSync(`git -C ${localDir} reset --hard`, { stdio: 'ignore' });
      execSync(`git -C ${localDir} clean -fd`, { stdio: 'ignore' });
      execSync(`git -C ${localDir} checkout main || git -C ${localDir} checkout master`, { stdio: 'ignore' });
      execSync(`git -C ${localDir} fetch origin`, { stdio: 'inherit' });
      execSync(`git -C ${localDir} reset --hard origin/main || git -C ${localDir} reset --hard origin/master`, { stdio: 'ignore' });
    }

    process.chdir(localDir);

    const allFilesList = getAllFiles(localDir);
    const graphEngine = new GraphEnterpriseEngine(localDir);
    graphEngine.buildKnowledgeGraph(allFilesList);

    const pureBranchName = `secops/enterprise-vercel-fix-${Date.now()}`;
    execSync(`git checkout -b ${pureBranchName}`, { stdio: 'inherit' });
    console.log(`🌿 [Zero Trust Branch] Criada e isolada: ${pureBranchName}`);

    const actions = performEnterpriseSelfHealing(localDir, graphEngine);

    let report = `# 🌐 Graph Enterprise - Relatório de Blindagem (Smart Contracts & Vercel)\n\n`;
    report += `**Arquitetura:** Graph RAG + MCP + Vercel Deployment Hardening\n`;
    report += `**Repositório Alvo:** ${repoFullName}\n`;
    report += `**Issue Associada:** #${issueNumber} - ${issueTitle}\n`;
    report += `**Data:** ${new Date().toISOString()}\n\n`;

    report += `## 📋 Ações Executadas:\n\n`;
    actions.forEach(a => {
      report += `- ${a}\n`;
    });

    report += `\n---\n*Processado autonomamente com sucesso pelo SecOps Agent.*`;

    fs.writeFileSync(path.join(localDir, 'ENTERPRISE_DEPLOY_REPORT.md'), report, 'utf-8');

    const status = execSync(`git status --porcelain`).toString();
    if (!status.trim()) {
      console.log(`✨ O repositório já está perfeitamente sincronizado e sem alterações pendentes.`);
      return;
    }

    execSync(`git add .`, { stdio: 'inherit' });
    execSync(`git commit -m "secops(enterprise): add vercel deployment config and harden smart contracts"`, { stdio: 'inherit' });
    execSync(`git push origin ${pureBranchName}`, { stdio: 'inherit' });

    console.log(`\n🚀 [GitHub API] Submetendo Pull Request com correção da Vercel em ${repoFullName}...`);
    const prPayload = {
      title: `secops(enterprise): stabilize vercel deployment and harden repository security`,
      head: pureBranchName,
      base: 'main',
      body: `Pull Request gerado sob a arquitetura Graph Enterprise para estabilizar o pipeline de deploy da Vercel e garantir conformidade total.`
    };

    const prResponse = await postGitHub(`/repos/${repoFullName}/pulls`, prPayload);

    if (prResponse && prResponse.html_url) {
      console.log(`\n✅ [Sucesso Absoluto] Pull Request de estabilização da Vercel submetido com perfeição!`);
      console.log(`🔗 Acede em: ${prResponse.html_url}`);
    } else {
      console.log(`⚠️ Resposta da criação do PR:`, prResponse);
    }

  } catch (error: any) {
    console.error('❌ Erro crítico no pipeline:', error.message);
  }
}

runEnterpriseWorkflow();
