import { apiClient } from './client.js';

export const fetchCurrentUser = async signal => (await apiClient.get('/auth/me', { signal })).data.data.user;
export const register = async input => (await apiClient.post('/auth/register', input)).data.data.user;
export const login = async input => (await apiClient.post('/auth/login', input)).data.data.user;
export const logout = async () => { await apiClient.post('/auth/logout', {}); };
