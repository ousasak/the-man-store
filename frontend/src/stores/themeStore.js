import { create } from './createStore';

export const useThemeStore = create((set) => ({
  theme: localStorage.getItem('theme') || 'system',
  primaryColor: '#C59B27', // Default Champagne Gold

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },

  setPrimaryColor: (color) => {
    set({ primaryColor: color });
  },
}));

export default useThemeStore;
