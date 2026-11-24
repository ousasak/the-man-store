import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const categoryService = {
  async getAll(params = {}) {
    const response = await api.get(API_ENDPOINTS.CATEGORIES?.LIST || '/admin/categories', { params });
    return response.data;
  },

  async getById(id) {
    const endpoint = API_ENDPOINTS.CATEGORIES?.DETAIL
      ? API_ENDPOINTS.CATEGORIES.DETAIL(id)
      : `/admin/categories/${id}`;
    const response = await api.get(endpoint);
    return response.data;
  },

  async create(data) {
    const endpoint = API_ENDPOINTS.CATEGORIES?.CREATE || '/admin/categories';
    const response = await api.post(endpoint, data);
    return response.data;
  },

  async update(id, data) {
    const endpoint = API_ENDPOINTS.CATEGORIES?.UPDATE
      ? API_ENDPOINTS.CATEGORIES.UPDATE(id)
      : `/admin/categories/${id}`;
    if (data instanceof FormData) {
      if (!data.has('_method')) data.append('_method', 'PATCH');
      const response = await api.post(endpoint, data);
      return response.data;
    }
    const response = await api.patch(endpoint, data);
    return response.data;
  },

  async delete(id) {
    const endpoint = API_ENDPOINTS.CATEGORIES?.DELETE
      ? API_ENDPOINTS.CATEGORIES.DELETE(id)
      : `/admin/categories/${id}`;
    const response = await api.delete(endpoint);
    return response.data;
  },
};

export default categoryService;
