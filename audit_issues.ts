import axios from 'axios';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_NAME = process.argv[2] || 'mrcoantonioconceicao-ctrl/blockx';

async function processGitHubIssues() {
  const headers: any = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }

  try {
    console.log(`[SecOps Cloud Agent] A consultar open issues para o repositório: ${REPO_NAME}...`);
    const url = `https://api.github.com/repos/${REPO_NAME}/issues?state=open`;
    const response = await axios.get(url, { headers });
    const issues = response.data;

    console.log(`[SecOps Cloud Agent] Encontradas ${issues.length} issues abertas no total.\n`);

    for (const issue of issues) {
      // Ignorar Pull Requests que a API do GitHub retorna na lista de issues
      if (issue.pull_request) continue;

      console.log(`--------------------------------------------------`);
      console.log(`📌 Issue #${issue.number}: ${issue.title}`);
      console.log(`👤 Autor: ${issue.user?.login}`);
      
      const bodyText = issue.body || '';
      console.log(`📝 Resumo: ${bodyText.substring(0, 120)}...`);

      // Detetar se a issue está relacionada com segurança ou correções estruturais
      const metadata = (issue.title + ' ' + bodyText).toLowerCase();
      const isSecurityTarget = metadata.includes('security') || 
                               metadata.includes('vuln') || 
                               metadata.includes('iam') || 
                               metadata.includes('patch') || 
                               metadata.includes('bug');

      if (isSecurityTarget) {
        console.log(`🛡️ [RustShield Quantum] Classificada como vulnerabilidade/tarefa de segurança. Preparando branch de remediação...`);
        // Aqui o agente pode correlacionar o texto da issue com a árvore do repositório para aplicar o patch
      } else {
        console.log(`ℹ️ [Governance] Issue fora do escopo imediato de auditoria estática.`);
      }
    }
    console.log(`--------------------------------------------------`);
    console.log(`[SecOps Cloud Agent] Processamento de issues concluído com sucesso!`);

  } catch (error: any) {
    console.error('Erro ao aceder às issues do GitHub:', error?.response?.data || error.message);
  }
}

processGitHubIssues();
