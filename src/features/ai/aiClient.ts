export async function fetchLocalModels(provider: 'ollama' | 'lmstudio', baseUrl: string): Promise<string[]> {
  try {
    if (provider === 'ollama') {
      const hostUrl = baseUrl.replace('/v1', '');
      const response = await fetch(`${hostUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } else {
      const response = await fetch(`${baseUrl}/models`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.data?.map((m: any) => m.id) || [];
    }
  } catch (error) {
    console.warn('Servidor local offline ou inacessível:', error);
    return [];
  }
}

export async function checkServerStatus(baseUrl: string): Promise<boolean> {
  try {
    const hostUrl = baseUrl.includes('/v1') ? baseUrl.replace('/v1', '') : baseUrl;
    const response = await fetch(`${hostUrl}/`, { method: 'GET' });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}
