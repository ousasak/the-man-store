import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const inventoryService = {
  async getStock(params = {}) {
    const response = await api.get(API_ENDPOINTS.INVENTORY.STOCK, { params });
    return response.data;
  },

  async getMovements(params = {}) {
    const response = await api.get(API_ENDPOINTS.INVENTORY.MOVEMENTS, { params });
    return response.data;
  },

  async adjustStock(data) {
    const response = await api.post(API_ENDPOINTS.INVENTORY.ADJUST, data);
    return response.data;
  },

  async getLowStockAlerts() {
    const response = await api.get(API_ENDPOINTS.INVENTORY.LOW_STOCK);
    return response.data;
  },
};

export default inventoryService;
