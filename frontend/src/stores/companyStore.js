import { create } from './createStore';

export const useCompanyStore = create((set) => ({
  company: {
    name: 'THE MAN STORE',
    logo: '/images/logo.svg',
    phone: '012 345 678',
    email: 'contact@themanstore.com',
    currency: 'USD',
    taxRate: 0,
  },

  setCompany: (company) => set({ company }),
}));

export default useCompanyStore;
