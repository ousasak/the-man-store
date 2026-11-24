import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const customerService = {
  async getAll(params = {}) {
    const response = await api.get(API_ENDPOINTS.CUSTOMERS.LIST, { params });
    return response.data;
  },

  async getById(id) {
    const response = await api.get(API_ENDPOINTS.CUSTOMERS.BY_ID(id));
    return response.data;
  },

  async create(data) {
    const response = await api.post(API_ENDPOINTS.CUSTOMERS.CREATE, data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(API_ENDPOINTS.CUSTOMERS.UPDATE(id), data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(API_ENDPOINTS.CUSTOMERS.DELETE(id));
    return response.data;
  },
};

export default customerService;
