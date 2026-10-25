import React, { useEffect, useState } from 'react';
import { PROVIDER_PRESETS } from '../ai/providerPresets';
import { fetchLocalModels, checkServerStatus } from '../ai/aiClient';

export function ProviderConfigForm() {
  const [selectedProvider, setSelectedProvider] = useState<'ollama' | 'lmstudio' | 'local-custom'>('ollama');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS.ollama.baseUrl);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    async function loadLocalEnvironment() {
      const online = await checkServerStatus(baseUrl);
      setIsOnline(online);
      if (online) {
        const detectedModels = await fetchLocalModels(selectedProvider, baseUrl);
        setModels(detectedModels);
        if (detectedModels.length > 0 && !selectedModel) {
          setSelectedModel(detectedModels[0]);
        }
      } else {
        setModels([]);
      }
    }
    loadLocalEnvironment();
  }, [selectedProvider, baseUrl]);

  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-700">
      <h3 className="text-lg font-bold mb-3">Painel Central de LLMs Locais (EPIC-04 / Issue 12)</h3>
      
      {/* Indicador de Status */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-sm font-medium">
          {isOnline ? 'Servidor Local Online & Conectado' : 'Servidor Local Desligado ou Inacessível'}
        </span>
      </div>

      {/* Seleção de Provedor */}
      <label className="block text-sm mb-1">Provedor Local</label>
      <select 
        className="w-full p-2 bg-slate-800 border border-slate-600 rounded mb-3"
        value={selectedProvider}
        onChange={(e) => {
          const prov = e.target.value as any;
          setSelectedProvider(prov);
          setBaseUrl(PROVIDER_PRESETS[prov].baseUrl);
        }}
      >
        <option value="ollama">Ollama (localhost:11434)</option>
        <option value="lmstudio">LM Studio (localhost:1234)</option>
        <option value="local-custom">Customizado</option>
      </select>

      {/* Dropdown Automático de Modelos */}
      <label className="block text-sm mb-1">Modelos Instalados na Máquina</label>
      <select 
        className="w-full p-2 bg-slate-800 border border-slate-600 rounded mb-3"
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        disabled={models.length === 0}
      >
        {models.length === 0 ? (
          <option value="">Nenhum modelo detetado (inicie o Ollama/LM Studio)</option>
        ) : (
          models.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))
        )}
      </select>
    </div>
  );
}
