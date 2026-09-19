import { apiClient } from './client.js';

export async function getHealth(signal) {
  const { data } = await apiClient.get('/health', { signal });

  if (data.success !== true || data.data?.status !== 'ok') {
    throw new Error('The service returned an unexpected health response.');
  }

  return data.data;
}
