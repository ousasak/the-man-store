import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const settingsService = {
  async getGeneral() {
    const response = await api.get(API_ENDPOINTS.SETTINGS.GENERAL);
    return response.data;
  },

  async updateGeneral(data) {
    const response = await api.put(API_ENDPOINTS.SETTINGS.GENERAL, data);
    return response.data;
  },

  async getPayments() {
    const response = await api.get(API_ENDPOINTS.SETTINGS.PAYMENTS);
    return response.data;
  },

  async updatePayments(data) {
    const response = await api.put(API_ENDPOINTS.SETTINGS.PAYMENTS, data);
    return response.data;
  },

  async getPrintConfig() {
    const response = await api.get(API_ENDPOINTS.SETTINGS.PRINT);
    return response.data;
  },

  async updatePrintConfig(data) {
    const response = await api.put(API_ENDPOINTS.SETTINGS.PRINT, data);
    return response.data;
  },
};

export default settingsService;
