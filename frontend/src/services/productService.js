import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const productService = {
  async getAll(params = {}) {
    const response = await api.get(API_ENDPOINTS.PRODUCTS.LIST, { params });
    return response.data;
  },

  async getById(id) {
    const endpoint = API_ENDPOINTS.PRODUCTS.BY_ID
      ? API_ENDPOINTS.PRODUCTS.BY_ID(id)
      : API_ENDPOINTS.PRODUCTS.DETAIL(id);
    const response = await api.get(endpoint);
    return response.data;
  },

  async create(data) {
    const response = await api.post(API_ENDPOINTS.PRODUCTS.CREATE, data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(API_ENDPOINTS.PRODUCTS.UPDATE(id), data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(API_ENDPOINTS.PRODUCTS.DELETE(id));
    return response.data;
  },

  async getCategories() {
    const response = await api.get(API_ENDPOINTS.PRODUCTS.CATEGORIES);
    return response.data;
  },

  async getBrands() {
    const response = await api.get(API_ENDPOINTS.PRODUCTS.BRANDS);
    return response.data;
  },
};

export default productService;
