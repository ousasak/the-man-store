import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const brandService = {
  async getAll(params = {}) {
    const response = await api.get(API_ENDPOINTS.BRANDS?.LIST || '/admin/brands', { params });
    return response.data;
  },

  async getById(id) {
    const endpoint = API_ENDPOINTS.BRANDS?.DETAIL
      ? API_ENDPOINTS.BRANDS.DETAIL(id)
      : `/admin/brands/${id}`;
    const response = await api.get(endpoint);
    return response.data;
  },

  async create(data) {
    const endpoint = API_ENDPOINTS.BRANDS?.CREATE || '/admin/brands';
    const response = await api.post(endpoint, data);
    return response.data;
  },

  async update(id, data) {
    const endpoint = API_ENDPOINTS.BRANDS?.UPDATE
      ? API_ENDPOINTS.BRANDS.UPDATE(id)
      : `/admin/brands/${id}`;
    if (data instanceof FormData) {
      if (!data.has('_method')) data.append('_method', 'PATCH');
      const response = await api.post(endpoint, data);
      return response.data;
    }
    const response = await api.patch(endpoint, data);
    return response.data;
  },

  async delete(id) {
    const endpoint = API_ENDPOINTS.BRANDS?.DELETE
      ? API_ENDPOINTS.BRANDS.DELETE(id)
      : `/admin/brands/${id}`;
    const response = await api.delete(endpoint);
    return response.data;
  },
};

export default brandService;
