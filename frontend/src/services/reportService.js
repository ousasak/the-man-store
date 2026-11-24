import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const reportService = {
  async getSummary(params = {}) {
    const response = await api.get(API_ENDPOINTS.REPORTS.SUMMARY, { params });
    return response.data;
  },

  async getSales(params = {}) {
    const response = await api.get(API_ENDPOINTS.REPORTS.SALES, { params });
    return response.data;
  },

  async getInventoryAnalytics(params = {}) {
    const response = await api.get(API_ENDPOINTS.REPORTS.INVENTORY, { params });
    return response.data;
  },
};

export default reportService;
