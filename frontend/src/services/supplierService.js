import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const supplierService = {
  async getAll(params = {}) {
    const response = await api.get(API_ENDPOINTS.SUPPLIERS.LIST, { params });
    return response.data;
  },

  async getById(id) {
    const response = await api.get(API_ENDPOINTS.SUPPLIERS.BY_ID(id));
    return response.data;
  },

  async create(data) {
    const response = await api.post(API_ENDPOINTS.SUPPLIERS.CREATE, data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(API_ENDPOINTS.SUPPLIERS.UPDATE(id), data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(API_ENDPOINTS.SUPPLIERS.DELETE(id));
    return response.data;
  },
};

export default supplierService;
