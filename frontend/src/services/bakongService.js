import api from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

export const bakongService = {
  async generateKHQR(data) {
    const response = await api.post(API_ENDPOINTS.BAKONG.GENERATE_KHQR, data);
    return response.data;
  },

  async checkTransaction(md5) {
    const response = await api.post(API_ENDPOINTS.BAKONG.CHECK_TX, { md5 });
    return response.data;
  },

  async verifyPayment(data) {
    const response = await api.post(API_ENDPOINTS.BAKONG.VERIFY, data);
    return response.data;
  },

  playSuccessSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
      // Ignore audio error if blocked by browser autoplay policy
    }
  },
};

export default bakongService;
