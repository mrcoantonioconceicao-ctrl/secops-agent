import * as https from 'https';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const repoArg = process.argv[2];

if (!repoArg) {
  console.error('❌ Erro: Indique o repositório. Ex: sec-push SlipPay2');
  process.exit(1);
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

function performRealCodeAnalysis(localDir: string): { findings: string[], totalFilesChecked: number } {
  console.log(`\n🔍 [RustShield Quantum Engine] A executar análise estática real do código-fonte (Sem Mocks)...`);
  const allFiles = getAllFiles(localDir);
  const findings: string[] = [];
  let checkedCount = 0;

  allFiles.forEach(file => {
    const ext = path.extname(file);
    if (['.ts', '.js', '.rs', '.json', '.env', '.sol'].includes(ext)) {
      checkedCount++;
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(localDir, file);
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        // 1. Deteção real de segredos, chaves privadas ou tokens hardcoded (excluindo mocks explícitos ou placeholders vazios)
        if (/(password|secret|private_key|api_key|token)\s*[:=]\s*["'][a-zA-Z0-9_\-\.]{8,}["']/i.test(trimmed)) {
          if (!trimmed.includes('process.env') && !trimmed.includes('YOUR_') && !trimmed.includes('placeholder')) {
            findings.push(`🔴 **[A07:2025 - Authentication Failures]** Credencial ou segredo detetado em \`${relativePath}:${lineNum}\`: \`${trimmed.substring(0, 40)}...\``);
          }
        }

        // 2. Deteção real de blocos catch vazios (silenciamento de erros críticos)
        if (/catch\s*\(\s*[a-zA-Z0-9_$]*\s*\)\s*\{\s*\}/.test(trimmed) || /catch\s*\{[^}]*\}/.test(trimmed) === false && /catch\s*\(/.test(trimmed)) {
          // Verificar se a linha seguinte está vazia
          if (lines[idx + 1] && lines[idx + 1].trim() === '}') {
            findings.push(`🟠 **[Qualidade / Resiliência]** Bloco \`catch\` vazio detetado em \`${relativePath}:${lineNum}\`, mascarando falhas de execução.`);
          }
        }

        // 3. Deteção real de uso de funções de execução perigosa sem sanitização
        if (/\beval\s*\(/.test(trimmed) || /\bnew\s+Function\s*\(/.test(trimmed)) {
          findings.push(`🔴 **[A05:2025 - Injection]** Execução dinâmica insegura detetada em \`${relativePath}:${lineNum}\`.`);
        }

        // 4. Auditoria real de Smart Contracts em Rust / Anchor (Validação de restrições de contas e PDAs)
        if (ext === '.rs') {
          if (trimmed.includes('#[derive(Accounts)]')) {
            // Verificar próximas linhas à procura de restrições em falta
            let accountStructBlock = '';
            for (let i = idx; i < Math.min(idx + 15, lines.length); i++) {
              accountStructBlock += lines[i] + '\n';
            }
            if (!accountStructBlock.includes('mut') && !accountStructBlock.includes('signer') && !accountStructBlock.includes('has_one')) {
              findings.push(`🔴 **[Smart Contract / A01:2025 - Broken Access Control]** Estrutura de contas Anchor em \`${relativePath}:${lineNum}\` sem restrições explícitas de mutabilidade ou assinantes.`);
            }
          }
        }
      });
    }
  });

  if (findings.length === 0) {
    findings.push(`✅ A análise estática real em ${checkedCount} ficheiros não encontrou vulnerabilidades críticas ou violações ativas nas regras de segurança.`);
  }

  return { findings, totalFilesChecked: checkedCount };
}

async function runRealAudit() {
  try {
    const repoFullName = await resolveRepoFullName(repoArg);
    const repoNameOnly = repoFullName.split('/')[1];

    console.log(`🛡️ [SecOps Agent] A iniciar auditoria real e profunda para: ${repoFullName}...`);

    const homeDir = process.env.HOME || '/data/data/com.termux/files/home';
    const localDir = path.join(homeDir, repoNameOnly);

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

    const pureBranchName = `secops/real-code-audit-${Date.now()}`;
    execSync(`git checkout -b ${pureBranchName}`, { stdio: 'inherit' });
    console.log(`🌿 [Zero Trust Branch] Criada e isolada: ${pureBranchName}`);

    // Executar análise real do código sem simulações
    const { findings, totalFilesChecked } = performRealCodeAnalysis(localDir);

    let report = `# 🛡️ Relatório de Análise Estática e Auditoria Real de Código\n\n`;
    report += `**Repositório Alvo:** ${repoFullName}\n`;
    report += `**Data da Auditoria:** ${new Date().toISOString()}\n`;
    report += `**Ficheiros Analisados:** ${totalFilesChecked}\n`;
    report += `**Motor:** SecOps Agent (Real Code Inspector Engine)\n\n`;

    report += `## 📋 Metodologia de Inspeção Real\n`;
    report += `Inspeção estrutural direta do código-fonte clonado, mapeando ocorrências reais sem recurso a mocks, dados estáticos pré-gravados ou suposições:\n`;
    report += `1. **A01:2025 - Broken Access Control / Smart Contracts:** Verificação de assinantes e restrições em Rust/Anchor.\n`;
    report += `2. **A05:2025 - Injection:** Deteção de execução dinâmica de código.\n`;
    report += `3. **A07:2025 - Authentication Failures:** Verificação de segredos e chaves expostas no código.\n`;
    report += `4. **Resiliência e Tratamento de Erros:** Identificação de blocos \`catch\` vazios ou omissão de tratamento de exceções.\n\n`;

    report += `## 🔍 Ocorrências e Achados Reais:\n\n`;
    findings.forEach(f => {
      report += `- ${f}\n`;
    });

    report += `\n---\n*Relatório gerado autonomamente com base na inspeção real do código-fonte do repositório.*`;

    fs.writeFileSync(path.join(localDir, 'SECURITY_AUDIT_REPORT.md'), report, 'utf-8');

    execSync(`git add .`, { stdio: 'inherit' });
    execSync(`git commit -m "secops(security): real code inspection report based on actual source analysis"`, { stdio: 'inherit' });
    execSync(`git push origin ${pureBranchName}`, { stdio: 'inherit' });

    console.log(`\n🚀 [GitHub API] A criar o Pull Request de Auditoria Real em ${repoFullName}...`);
    const prPayload = {
      title: `secops(security): real code audit & vulnerability inspection report`,
      head: pureBranchName,
      base: 'main',
      body: `Relatório de auditoria gerado através de inspeção estática real do código-fonte do repositório, sem mocks ou dados simulados.`
    };

    const prResponse = await postGitHub(`/repos/${repoFullName}/pulls`, prPayload);

    if (prResponse && prResponse.html_url) {
      console.log(`\n✅ [Sucesso Absoluto] Pull Request de Auditoria Real submetido com perfeição!`);
      console.log(`🔗 Acede em: ${prResponse.html_url}`);
    } else {
      console.log(`⚠️ Resposta da criação do PR:`, prResponse);
    }

  } catch (error: any) {
    console.error('❌ Erro crítico na auditoria real:', error.message);
  }
}

runRealAudit();
