import { apiClient } from './client.js';
export const searchJourneys = async (params, signal) => (await apiClient.get('/schedules/search', { params, signal })).data.data;
export const getPublicData = async (path, signal) => (await apiClient.get(path, { signal })).data.data.items;
