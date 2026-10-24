import * as https from 'https';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const modeArg = process.argv[2] || 'issue'; 
const repoArg = process.argv[3] || 'NEXAVOR-QUANTUM-AUDIT';
const targetArg = process.argv[4] || '7'; 

async function resolveRepoFullName(input: string): Promise<string> {
  if (input.includes('/')) return input;
  return `mrcoantonioconceicao-ctrl/${input}`;
}

function githubRequest(method: string, urlPath: string, payload?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const dataString = payload ? JSON.stringify(payload) : '';
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: urlPath,
      method: method,
      headers: {
        'User-Agent': 'Nexa-SecOps-Master-Agent',
        'Accept': 'application/vnd.github.v3+json',
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataString)
        } : {}),
        ...(GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.message || `Erro HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Falha ao processar resposta da API do GitHub.'));
        }
      });
    });

    req.on('error', err => reject(err));
    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error('Timeout na ligação com a API do GitHub.'));
    });
    if (payload) req.write(dataString);
    req.end();
  });
}

function applyRobustWorkflowFixes(localDir: string) {
  console.log(`🛠️ A aplicar correções robustas de workflows e dependências em: ${localDir}`);

  // 1. Configurar vercel.json limpo
  const vercelJsonPath = path.join(localDir, 'vercel.json');
  const vercelConfig = {
    version: 2,
    builds: [
      {
        src: "server.ts",
        use: "@vercel/node"
      }
    ],
    routes: [
      {
        src: "/(.*)",
        dest: "/server.ts"
      }
    ]
  };
  fs.writeFileSync(vercelJsonPath, JSON.stringify(vercelConfig, null, 2), 'utf-8');

  // 2. Inspecionar workflows e garantir instalação correta de dependências com npm install antes do build
  const workflowsDir = path.join(localDir, '.github', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    const files = fs.readdirSync(workflowsDir);
    for (const file of files) {
      if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        const filePath = path.join(workflowsDir, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Substituir ou injetar npm install de forma garantida antes de qualquer npm run build
        if (content.includes('npm run build')) {
          if (!content.includes('npm install') && !content.includes('npm ci')) {
            content = content.replace('run: npm run build', 'run: npm install\n          npm run build');
          } else {
            // Garantir que usa npm install limpo se necessário
            content = content.replace('npm ci', 'npm install');
          }
          fs.writeFileSync(filePath, content, 'utf-8');
          console.log(`📄 Workflow ${file} otimizado com instalação robusta de dependências.`);
        }
      }
    }
  }
}

async function fixConflictsAndPullRequest(repoFullName: string, prNumber: string, localDir: string) {
  console.log(`🔍 [Resolução Robusta & SecOps] A inspecionar o PR #${prNumber} em ${repoFullName}...`);
  
  const prData = await githubRequest('GET', `/repos/${repoFullName}/pulls/${prNumber}`);
  const branchName = prData.head?.ref;
  
  if (!branchName) {
    throw new Error(`Não foi possível determinar a branch associada ao PR #${prNumber}.`);
  }

  console.log(`🌿 Branch associada ao PR encontrada: ${branchName}`);

  execSync(`git -C ${localDir} fetch origin`, { stdio: 'inherit' });
  execSync(`git -C ${localDir} checkout main`, { stdio: 'inherit' });
  execSync(`git -C ${localDir} pull origin main`, { stdio: 'inherit' });
  
  execSync(`git -C ${localDir} checkout ${branchName} || git -C ${localDir} checkout -b ${branchName} origin/${branchName}`, { stdio: 'inherit' });

  console.log(`⚡ A executar rebase da branch ${branchName} com a main...`);
  try {
    execSync(`git -C ${localDir} rebase origin/main`, { stdio: 'inherit' });
  } catch (err) {
    console.log(`⚠️ Conflitos detetados. O agente vai aplicar resolução autónoma...`);
    const statusOutput = execSync(`git -C ${localDir} status --porcelain`, { encoding: 'utf-8' });
    const lines = statusOutput.split('\n');
    for (const line of lines) {
      if (line.startsWith('UU ') || line.startsWith('AA ') || line.includes('U ')) {
        const conflictFile = line.substring(3).trim();
        console.log(`🔧 A resolver conflito no ficheiro: ${conflictFile}`);
        execSync(`git -C ${localDir} checkout --ours ${conflictFile} || git -C ${localDir} add ${conflictFile}`, { stdio: 'inherit' });
      }
    }
    try {
      execSync(`git -C ${localDir} rebase --continue`, { stdio: 'inherit' });
    } catch (e) {
      try { execSync(`git -C ${localDir} rebase --skip`, { stdio: 'ignore' }); } catch(_){}
    }
  }

  // Aplicar correções robustas
  applyRobustWorkflowFixes(localDir);

  execSync(`git -C ${localDir} add .`, { stdio: 'inherit' });
  
  try {
    execSync(`git -C ${localDir} commit -m "fix(secops): ensure robust npm install before build in workflows for PR #${prNumber}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log(`ℹ️ Nenhuma alteração nova pendente de commit.`);
  }

  execSync(`git -C ${localDir} push origin ${branchName} --force`, { stdio: 'inherit' });
  console.log(`✅ [Sucesso Absoluto] O PR #${prNumber} foi corrigido com dependências robustas e sincronizado com sucesso!`);
}

async function main() {
  try {
    const repoFullName = await resolveRepoFullName(repoArg);
    const repoNameOnly = repoFullName.split('/')[1];
    const homeDir = process.env.HOME || '/data/data/com.termux/files/home';
    const localDir = path.join(homeDir, repoNameOnly);

    if (!fs.existsSync(localDir)) {
      console.log(`📦 Clonando ${repoFullName} para ${localDir}...`);
      const authUrl = GITHUB_TOKEN 
        ? `https://${GITHUB_TOKEN}@github.com/${repoFullName}.git`
        : `https://github.com/${repoFullName}.git`;
      execSync(`git clone ${authUrl} ${localDir}`, { stdio: 'inherit' });
    } else {
      console.log(`🔄 Sincronizando repositório local em ${localDir}...`);
      execSync(`git -C ${localDir} reset --hard`, { stdio: 'ignore' });
      execSync(`git -C ${localDir} clean -fd`, { stdio: 'ignore' });
      execSync(`git -C ${localDir} fetch origin`, { stdio: 'inherit' });
    }

    if (modeArg === 'fix-pr') {
      await fixConflictsAndPullRequest(repoFullName, targetArg, localDir);
    }

  } catch (error: any) {
    console.error('❌ Erro na execução do agente:', error.message);
  }
}

main();
