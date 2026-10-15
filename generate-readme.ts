import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function main() {
  const owner = "mrcoantonioconceicao-ctrl";
  const repo = "secops-agent";
  const branch = "main";

  console.log(`📖 Gerando README técnico de alta precisão para ${owner}/${repo}...`);
  
  const prompt = `Crie um README.md técnico, profissional e de nível enterprise para o repositório de segurança "secops-agent" (Node.js/TS, Gemini 2.5 Flash, Octokit, patching cirúrgico context-aware, suporte poliglota). Detalhe arquitetura, stack e fluxo de uso. Retorne APENAS Markdown puro.`;
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const readmeContent = response.text?.trim() || "# secops-agent\nEnterprise SecOps Agent.";
  fs.writeFileSync("README.md", readmeContent);
  console.log("✅ README.md gerado localmente.");
}

main().catch(console.error);
