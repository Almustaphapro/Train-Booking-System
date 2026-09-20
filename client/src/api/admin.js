import { apiClient } from './client.js';
export const listAdmin = async (resource, params = {}, signal) => (await apiClient.get(`/admin/${resource}`, { params, signal })).data.data;
export const saveAdmin = async (resource, id, input) => (await (id ? apiClient.put(`/admin/${resource}/${id}`, input) : apiClient.post(`/admin/${resource}`, input))).data.data;
export const deleteAdmin = (resource, id) => apiClient.delete(`/admin/${resource}/${id}`, { data: {}, headers: { 'Content-Type': 'application/json' } });
export async function adminOptions(resource, signal) {
  const rows = []; let page = 1, pages;
  do { const result = await listAdmin(resource, { page, pageSize: 100 }, signal); rows.push(...result.items); pages = result.pages; page++; } while (page <= pages);
  return rows;
}
