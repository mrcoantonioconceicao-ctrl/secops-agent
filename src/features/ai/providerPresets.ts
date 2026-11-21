export const PROVIDER_PRESETS = {
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    modelsEndpoint: 'http://localhost:11434/api/tags',
    requiresApiKey: false,
  },
  lmstudio: {
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    modelsEndpoint: 'http://localhost:1234/v1/models',
    requiresApiKey: false,
  },
  'local-custom': {
    name: 'Servidor Local Customizado',
    baseUrl: 'http://localhost:8080/v1',
    requiresApiKey: false,
  },
};
