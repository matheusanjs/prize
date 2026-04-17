import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// API origin for resolving static asset paths (e.g. /static/default-avatar.png)
const API_ORIGIN = BASE_URL.replace(/\/api\/v\d+$/, '');

export function resolveStaticUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Network error or server down — do NOT clear tokens, just reject
    if (!error.response) {
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== 'undefined'
    ) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        originalRequest._retry = true;
        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefresh } = res.data;
          localStorage.setItem('token', accessToken);
          localStorage.setItem('refreshToken', newRefresh);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch {
          // Refresh failed — only clear if server explicitly rejected (not network error)
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('cachedUser');
          if (window.location.pathname !== '/login') {
            window.location.href = 'https://marinaprizeclub.com/login';
          }
        }
      } else if (window.location.pathname !== '/login') {
        localStorage.removeItem('token');
        localStorage.removeItem('cachedUser');
        window.location.href = 'https://marinaprizeclub.com/login';
      }
    }
    return Promise.reject(error);
  },
);

// Auth
export const login = (email: string, password: string) => api.post('/auth/login', { email, password });

// Users
export const getUsers = (params?: { page?: number; limit?: number; role?: string; search?: string }) => api.get('/users', { params: { page: 1, limit: 100, ...params } });
export const getUser = (id: string) => api.get(`/users/${id}`);
export const createUser = (data: Record<string, unknown>) => api.post('/auth/register', data);
export const updateUser = (id: string, data: Record<string, unknown>) => api.patch(`/users/${id}`, data);
export const deleteUser = (id: string) => api.delete(`/users/${id}`);

// Boats
export const getBoats = (params?: { page?: number; limit?: number }) => api.get('/boats', { params: { page: 1, limit: 100, ...params } });
export const getBoat = (id: string) => api.get(`/boats/${id}`);
export const createBoat = (data: Record<string, unknown>) => api.post('/boats', data);
export const updateBoat = (id: string, data: Record<string, unknown>) => api.patch(`/boats/${id}`, data);
export const deleteBoat = (id: string) => api.delete(`/boats/${id}`);
export const uploadBoatDocument = (id: string, file: File) => { const fd = new FormData(); fd.append('file', file); return api.post(`/boats/${id}/upload-document`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); };
export const uploadBoatInsurance = (id: string, file: File) => { const fd = new FormData(); fd.append('file', file); return api.post(`/boats/${id}/upload-insurance`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); };
export const getBoatPdf = (id: string, type: 'document' | 'insurance' | 'combined') => api.get(`/boats/${id}/pdf/${type}`, { responseType: 'blob' });

// Shares
export const getShares = (params?: { boatId?: string; userId?: string }) => api.get('/shares', { params });
export const getSharesByBoat = (boatId: string) => api.get(`/shares/boat/${boatId}`);
export const createShare = (data: Record<string, unknown>) => api.post('/shares', data);
export const updateShare = (id: string, data: Record<string, unknown>) => api.patch(`/shares/${id}`, data);
export const deleteShare = (id: string) => api.delete(`/shares/${id}`);

// Reservations
export const getReservations = (params?: { boatId?: string; startDate?: string; endDate?: string; status?: string }) => api.get('/reservations', { params });
export const getBoatReservations = (boatId: string, date?: string) => api.get(`/reservations/boat/${boatId}`, { params: { date } });
export const createReservation = (data: Record<string, unknown>) => api.post('/reservations', data);
export const cancelReservation = (id: string, reason?: string) => api.patch(`/reservations/${id}/cancel`, { reason });

// Finance
export const getCharges = (params?: { status?: string; userId?: string; boatId?: string }) => api.get('/finance/charges', { params });
export const createCharge = (data: Record<string, unknown>) => api.post('/finance/charges', data);
export const updateCharge = (id: string, data: Record<string, unknown>) => api.patch(`/finance/charges/${id}`, data);
export const deleteCharge = (id: string) => api.delete(`/finance/charges/${id}`);
export const registerPayment = (data: Record<string, unknown>) => api.post('/finance/payments', data);
export const getFinanceDashboard = () => api.get('/finance/dashboard');
export const processDelinquency = () => api.post('/finance/delinquency/process');

// Fuel
export const getFuelLogs = (params?: { boatId?: string }) => api.get('/fuel', { params });
export const createFuelLog = (data: Record<string, unknown>) => api.post('/fuel', data);
export const getFuelPrice = (fuelType?: string) => api.get('/fuel/price', { params: { fuelType } });
export const setFuelPrice = (price: number, fuelType?: string, notes?: string) => api.put('/fuel/price', { price, fuelType, notes });
export const getFuelPriceHistory = (fuelType?: string) => api.get('/fuel/price/history', { params: { fuelType } });
export const analyzeGauge = (boatId: string, image: string, mimeType?: string, cropped?: boolean) => api.post('/fuel/analyze-gauge', { boatId, image, mimeType, cropped });
export const getGaugeExamples = (dashboardType?: string) => api.get('/fuel/gauge-examples', { params: { dashboardType } });
export const addGaugeExample = (data: { image: string; mimeType?: string; percentage: number; dashboardType?: string; description?: string }) => api.post('/fuel/gauge-examples', data);
export const removeGaugeExample = (id: string) => api.delete(`/fuel/gauge-examples/${id}`);

// Maintenance
export const getMaintenances = (params?: { boatId?: string; status?: string }) => api.get('/maintenance', { params });
export const createMaintenance = (data: Record<string, unknown>) => api.post('/maintenance', data);
export const updateMaintenance = (id: string, data: Record<string, unknown>) => api.patch(`/maintenance/${id}`, data);
export const resolveMaintenance = (id: string) => api.patch(`/maintenance/${id}/resolve`, {});

// Queue
export const getQueue = (params?: { status?: string; date?: string }) => api.get('/operations/queue', { params });
export const updateQueueStatus = (id: string, status: string) => api.patch(`/queue/${id}/status`, { status });
export const liftBoat = (queueId: string, returnData?: Record<string, unknown>) => api.patch(`/operations/queue/${queueId}/lift`, returnData || {});
export const liftAllBoats = () => api.post('/operations/queue/lift-all');
export const launchToWater = (queueId: string) => api.patch(`/operations/queue/${queueId}/launch`);
export const getLastReturnInspection = (boatId: string) => api.get(`/operations/return-inspection/${boatId}`);
export const getChecklistsByBoat = (boatId: string) => api.get(`/operations/checklists/boat/${boatId}`);

// Operations
export const getChecklists = (params?: { boatId?: string; status?: string; date?: string }) => api.get('/operations/checklists', { params });
export const createChecklist = (data: Record<string, unknown>) => api.post('/operations/checklists', data);
export const deleteChecklist = (id: string) => api.delete(`/operations/checklists/${id}`);
export const getUsages = (params?: { boatId?: string; userId?: string; status?: string; from?: string; to?: string }) => api.get('/operations/usages', { params });
export const getTodayReservations = (date?: string) => api.get('/operations/pre-launch/today-reservations', { params: date ? { date } : undefined });
export const startAdHocPreLaunch = (boatId: string, reservationId?: string) => api.post('/operations/pre-launch/start-adhoc', { boatId, reservationId });
export const submitPreLaunch = (checklistId: string, data: Record<string, unknown>) => api.post(`/operations/pre-launch/${checklistId}/submit`, data);

// AI
export const getAiInsights = () => api.get('/ai/insights');
export const chatWithAi = (message: string) => api.post('/ai/chat', { message });
export const getAiUsage = () => api.get('/ai/usage');

// Notifications
export const sendNotification = (data: Record<string, unknown>) => api.post('/notifications', data);

// Share Sales
export const getShareSales = (params?: { page?: number; limit?: number }) => api.get('/share-sale', { params });
export const getShareSale = (id: string) => api.get(`/share-sale/${id}`);
export const createShareSale = (data: Record<string, unknown>) => api.post('/share-sale', data);
export const cancelShareSale = (id: string) => api.patch(`/share-sale/${id}/cancel`);

// Menu
export const getMenuCategories = (includeInactive?: boolean) => api.get('/menu/categories', { params: includeInactive ? { includeInactive: 'true' } : {} });
export const getMenuCategory = (id: string) => api.get(`/menu/categories/${id}`);
export const createMenuCategory = (data: Record<string, unknown>) => api.post('/menu/categories', data);
export const updateMenuCategory = (id: string, data: Record<string, unknown>) => api.put(`/menu/categories/${id}`, data);
export const deleteMenuCategory = (id: string) => api.delete(`/menu/categories/${id}`);
export const getMenuItems = (categoryId?: string) => api.get('/menu/items', { params: categoryId ? { categoryId } : {} });
export const getMenuItem = (id: string) => api.get(`/menu/items/${id}`);
export const createMenuItem = (data: Record<string, unknown>) => api.post('/menu/items', data);
export const updateMenuItem = (id: string, data: Record<string, unknown>) => api.put(`/menu/items/${id}`, data);
export const deleteMenuItem = (id: string) => api.delete(`/menu/items/${id}`);
export const uploadMenuImage = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<{ url: string }>('/menu/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ─── Orders ───────────────────────────────────────────────
export const getOrders = (params?: Record<string, string>) => api.get('/orders', { params });
export const getOrderStats = () => api.get('/orders/stats');
export const getOrder = (id: string) => api.get(`/orders/${id}`);
export const createOrder = (data: Record<string, unknown>) => api.post('/orders', data);
export const updateOrder = (id: string, data: Record<string, unknown>) => api.put(`/orders/${id}`, data);
export const advanceOrder = (id: string) => api.put(`/orders/${id}/advance`);
export const cancelOrder = (id: string) => api.put(`/orders/${id}/cancel`);
export const deleteOrder = (id: string) => api.delete(`/orders/${id}`);

// ─── PDV ──────────────────────────────────────────────────
// Tables
export const getPdvTables = () => api.get('/pdv/tables');
export const createPdvTable = (data: Record<string, unknown>) => api.post('/pdv/tables', data);
export const updatePdvTable = (id: string, data: Record<string, unknown>) => api.put(`/pdv/tables/${id}`, data);
export const deletePdvTable = (id: string) => api.delete(`/pdv/tables/${id}`);
export const generateTableToken = (id: string) => api.post(`/pdv/tables/${id}/generate-token`);
// Waiters
export const getPdvWaiters = () => api.get('/pdv/waiters');
export const createPdvWaiter = (data: Record<string, unknown>) => api.post('/pdv/waiters', data);
export const updatePdvWaiter = (id: string, data: Record<string, unknown>) => api.put(`/pdv/waiters/${id}`, data);
export const deletePdvWaiter = (id: string) => api.delete(`/pdv/waiters/${id}`);
export const getWaiterCommissions = (id: string, from?: string, to?: string) => api.get(`/pdv/waiters/${id}/commissions`, { params: { from, to } });
// Terminals
export const getPdvTerminals = () => api.get('/pdv/terminals');
export const createPdvTerminal = (data: Record<string, unknown>) => api.post('/pdv/terminals', data);
export const updatePdvTerminal = (id: string, data: Record<string, unknown>) => api.put(`/pdv/terminals/${id}`, data);
export const deletePdvTerminal = (id: string) => api.delete(`/pdv/terminals/${id}`);
// Cash Registers
export const openCashRegister = (data: Record<string, unknown>) => api.post('/pdv/cash-registers/open', data);
export const closeCashRegister = (id: string, data: Record<string, unknown>) => api.put(`/pdv/cash-registers/${id}/close`, data);
export const getCashRegisters = (params?: Record<string, string>) => api.get('/pdv/cash-registers', { params });
export const getCashRegister = (id: string) => api.get(`/pdv/cash-registers/${id}`);
export const getCashRegisterHistory = (params?: Record<string, string>) => api.get('/pdv/cash-registers/history', { params });
export const addCashTransaction = (id: string, data: Record<string, unknown>) => api.post(`/pdv/cash-registers/${id}/transactions`, data);
// PDV Sell
export const createPdvSell = (data: Record<string, unknown>) => api.post('/pdv/sell', data);
export const finalizePdvOrders = (data: { orderIds: string[]; paymentMethod: string; cashRegisterId: string; waiterFeeAmount?: number }) => api.put('/pdv/orders/finalize', data);
export const getPdvStats = (cashRegisterId?: string) => api.get('/pdv/stats', { params: cashRegisterId ? { cashRegisterId } : {} });

// Weather
export const getWeatherCurrent = () => api.get('/weather/current');
export const getWeatherHistory = (hours?: number) => api.get('/weather/history', { params: hours ? { hours } : {} });
export const getWeatherForecast = () => api.get('/weather/forecast');
export const triggerWeatherCollection = () => api.post('/weather/trigger');

// Damages report
export const getDamagesReport = (params?: { boatId?: string; from?: string; to?: string }) => api.get('/operations/damages', { params });

// ─── Woovi (Pix Payments) ───────────────────────────────
export const createWooviCharge = (chargeId: string) => api.post(`/payments/woovi/charge/${chargeId}`);
export const getWooviChargeStatus = (correlationID: string) => api.get(`/payments/woovi/charge/${correlationID}`);

// ─── WhatsApp ───────────────────────────────────────────
export const getWhatsappStatus = () => api.get('/whatsapp/status');
export const connectWhatsapp = () => api.post('/whatsapp/connect');
export const disconnectWhatsapp = () => api.post('/whatsapp/disconnect');
export const getWhatsappMessages = (params?: Record<string, string>) => api.get('/whatsapp/messages', { params });
export const getWhatsappConversation = (phone: string) => api.get('/whatsapp/conversation', { params: { phone } });
export const getWhatsappConversations = () => api.get('/whatsapp/conversations');
export const sendWhatsappMessage = (data: { phone: string; message: string; userId?: string }) => api.post('/whatsapp/send', data);
export const broadcastWhatsapp = (data: { message: string }) => api.post('/whatsapp/broadcast', data);
export const getWhatsappStats = () => api.get('/whatsapp/stats');
export const getWhatsappTemplates = () => api.get('/whatsapp/templates');
export const createWhatsappTemplate = (data: { slug: string; name: string; body: string; category: string }) => api.post('/whatsapp/templates', data);
export const updateWhatsappTemplate = (id: string, data: { name?: string; body?: string; category?: string; isActive?: boolean }) => api.patch(`/whatsapp/templates/${id}`, data);
export const triggerReservationConfirmations = () => api.post('/whatsapp/trigger/reservation-confirmations');
export const triggerPaymentReminders = () => api.post('/whatsapp/trigger/payment-reminders');
export const triggerOverdueAlerts = () => api.post('/whatsapp/trigger/overdue-alerts');

// ─── Push Notifications (Admin) ─────────────────────────
export const getPushStats = () => api.get('/admin/push/stats');
export const getPushDevices = (page?: number) => api.get('/admin/push/devices', { params: { page } });
export const getPushHistory = (page?: number, type?: string) => api.get('/admin/push/history', { params: { page, type } });
export const getPushUsers = (search?: string) => api.get('/admin/push/users', { params: { search } });
export const sendPushNotification = (data: { title: string; body: string; target: string; userIds?: string[]; type?: string; url?: string; imageUrl?: string }) => api.post('/admin/push/send', data);
export const sendPushTest = (data: { userId: string; title?: string; body?: string }) => api.post('/admin/push/test', data);

// Dashboard
export const getDashboardStats = () => api.get('/dashboard/stats');

// Reports
export const getReportFinance = (from?: string, to?: string) => api.get('/reports/finance', { params: { from, to } });
export const getReportReservations = (from?: string, to?: string) => api.get('/reports/reservations', { params: { from, to } });
export const getReportFuel = (from?: string, to?: string) => api.get('/reports/fuel', { params: { from, to } });
export const getReportBoats = (from?: string, to?: string) => api.get('/reports/boats', { params: { from, to } });
export const getReportMaintenance = (from?: string, to?: string) => api.get('/reports/maintenance', { params: { from, to } });
export const getReportOperations = (from?: string, to?: string) => api.get('/reports/operations', { params: { from, to } });
export const getReportRestaurant = (from?: string, to?: string) => api.get('/reports/restaurant', { params: { from, to } });
export const getReportClients = (from?: string, to?: string) => api.get('/reports/clients', { params: { from, to } });

export default api;
