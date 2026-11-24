import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const orderService = {
  async getAll(params = {}) {
    const response = await api.get(API_ENDPOINTS.ORDERS.LIST, { params });
    return response.data;
  },

  async getById(id) {
    const response = await api.get(API_ENDPOINTS.ORDERS.BY_ID(id));
    return response.data;
  },

  async create(data) {
    const response = await api.post(API_ENDPOINTS.ORDERS.CREATE, data);
    return response.data;
  },

  async updateStatus(id, status, notes = '') {
    const response = await api.patch(API_ENDPOINTS.ORDERS.STATUS(id), { status, notes });
    return response.data;
  },

  async cancel(id, reason = '') {
    const response = await api.post(API_ENDPOINTS.ORDERS.CANCEL(id), { reason });
    return response.data;
  },
};

export default orderService;
