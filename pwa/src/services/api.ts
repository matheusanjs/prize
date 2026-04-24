import axios, { AxiosResponse } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// ─── In-flight GET request deduplicator ───────────────────────────────────
// Coalesces simultaneous GET requests to the same URL so only one HTTP call
// is made. Does NOT cache responses — every completed request is forgotten,
// so component remounts always get fresh data from the server.

const inflight = new Map<string, Promise<AxiosResponse>>();

function dedupKey(url: string, params?: Record<string, unknown>): string {
  return url + (params ? '?' + JSON.stringify(params) : '');
}

function dedupGet(url: string, params?: Record<string, unknown>): Promise<AxiosResponse> {
  const key = dedupKey(url, params);
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = api.get(url, { params });
  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));
  return promise;
}

export function invalidateCache(pattern?: string | RegExp) {
  if (!pattern) { inflight.clear(); return; }
  for (const key of inflight.keys()) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      inflight.delete(key);
    }
  }
}

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
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
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('cachedUser');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      } else if (window.location.pathname !== '/login') {
        localStorage.removeItem('token');
        localStorage.removeItem('cachedUser');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// Auth
export const login = (email: string, password: string) => api.post('/auth/login', { email, password });
export const registerUser = (data: { name: string; email: string; password: string; phone?: string; cpfCnpj?: string }) =>
  api.post('/auth/register', { ...data, role: 'CLIENT' });

// Users
export const getUsers = (params?: Record<string, unknown>) => dedupGet('/users', { page: 1, limit: 100, ...params });

// Boats
export const getBoats = (params?: Record<string, unknown>) => dedupGet('/boats', { page: 1, limit: 100, ...params });

// Shares
export const getShares = (params?: { boatId?: string; userId?: string }) => dedupGet('/shares', params);

// Reservations
export const getReservations = (params?: Record<string, unknown>) => dedupGet('/reservations', params);
export const getMyReservations = () => dedupGet('/reservations/my-reservations');
export const getBoatReservations = (boatId: string, date?: string) => dedupGet(`/reservations/boat/${boatId}`, date ? { date } : undefined);
export const getBoatCalendar = (boatId: string, month: number, year: number) => dedupGet(`/reservations/calendar/${boatId}`, { month, year });
export const getAllBoatReservations = (boatId: string, opts?: { pastDays?: number; futureMonths?: number }) =>
  dedupGet(`/reservations/boat/${boatId}/all`, opts);
export const createReservation = (data: Record<string, unknown>) => api.post('/reservations', data);
export const cancelReservation = (id: string, reason?: string) => api.patch(`/reservations/${id}/cancel`, { reason });
export const confirmArrival = (id: string, expectedArrivalTime: string) => api.patch(`/reservations/${id}/confirm-arrival`, { expectedArrivalTime });

// Reservation Swaps
export const createSwapRequest = (data: { targetReservationId: string; offeredReservationId: string; message?: string }) => api.post('/reservations/swap', data);
export const getMySwaps = () => dedupGet('/reservations/swaps/my');
export const getPendingSwaps = () => dedupGet('/reservations/swaps/pending');
export const respondToSwap = (id: string, accept: boolean) => api.patch(`/reservations/swaps/${id}/respond`, { accept });
export const getCoOwners = (boatId: string) => dedupGet(`/reservations/co-owners/${boatId}`);

// Reservation Substitutes (Suplente de cota)
export const registerSubstitute = (reservationId: string, message?: string) =>
  api.post(`/reservations/${reservationId}/substitute`, { message });
export const cancelSubstitute = (substituteId: string) =>
  api.patch(`/reservations/substitutes/${substituteId}/cancel`);
export const getMySubstituteRequests = () => dedupGet('/reservations/substitutes/my');
export const getIncomingSubstitutes = () => dedupGet('/reservations/substitutes/incoming');
export const getSubstitutableReservations = () => dedupGet('/reservations/substitutes/available');
export const listReservationSubstitutes = (reservationId: string) =>
  dedupGet(`/reservations/${reservationId}/substitutes`);
export const passToNextSubstitute = (reservationId: string) =>
  api.post(`/reservations/${reservationId}/pass-to-substitute`);

// Finance / Charges
export const getCharges = (params?: Record<string, unknown>) => dedupGet('/finance/charges', params);
export const getMyCharges = (params?: Record<string, unknown>) => dedupGet('/finance/my-charges', params);

// Fuel
export const getFuelLogs = (params?: Record<string, unknown>) => dedupGet('/fuel', params);
export const getMyFuelLogs = (params?: Record<string, unknown>) => dedupGet('/fuel/my-logs', params);
export const getFuelLog = (id: string) => dedupGet(`/fuel/${id}`);
export const createFuelLog = (data: Record<string, unknown>) => api.post('/fuel', data);
export const getFuelPrice = (fuelType?: string) => dedupGet('/fuel/price', fuelType ? { fuelType } : undefined);
export const setFuelPrice = (price: number, fuelType?: string, notes?: string) => api.put('/fuel/price', { price, fuelType, notes });
export const analyzeGauge = (boatId: string, image: string, mimeType?: string, cropped?: boolean) => api.post('/fuel/analyze-gauge', { boatId, image, mimeType, cropped });
export const getSharesByBoat = (boatId: string) => dedupGet(`/shares/boat/${boatId}`);

// Maintenance
export const getMaintenances = (params?: Record<string, unknown>) => dedupGet('/maintenance', params);
export const createMaintenance = (data: Record<string, unknown>) => api.post('/maintenance', data);
export const updateMaintenance = (id: string, data: Record<string, unknown>) => api.patch(`/maintenance/${id}`, data);

// Operations
export const getChecklists = (params?: Record<string, unknown>) => dedupGet('/operations/checklists', params);
export const createChecklist = (data: Record<string, unknown>) => api.post('/operations/checklists', data);
export const startPreLaunch = (reservationId: string) => api.post(`/operations/pre-launch/${reservationId}/start`);
export const submitPreLaunch = (checklistId: string, data: Record<string, unknown>) => api.post(`/operations/pre-launch/${checklistId}/submit`, data);
export const getMyReservationsForChecklist = () => dedupGet('/operations/pre-launch/my-reservations');
export const getMyUsages = () => dedupGet('/operations/usages/my');
export const getTodayReservationsForOperator = () => dedupGet('/operations/pre-launch/today-reservations');
export const startAdHocPreLaunch = (boatId: string, reservationId?: string) => api.post('/operations/pre-launch/start-adhoc', { boatId, reservationId });
export const deleteChecklist = (id: string) => api.delete(`/operations/checklists/${id}`);
export const liftBoat = (queueId: string, returnData?: Record<string, unknown>) => api.patch(`/operations/queue/${queueId}/lift`, returnData || {});
export const liftAllBoats = () => api.patch('/operations/queue/lift-all');
export const launchToWater = (queueId: string) => api.patch(`/operations/queue/${queueId}/launch`);
export const getChecklistsByBoat = (boatId: string) => dedupGet(`/operations/checklists/boat/${boatId}`);
export const getChecklistById = (id: string) => dedupGet(`/operations/pre-launch/checklist/${id}`);
export const getLastReturnInspection = (boatId: string) => dedupGet(`/operations/return-inspection/${boatId}`);
export const getRecentUsers = (boatId: string) => dedupGet(`/operations/recent-users/${boatId}`);
export const getLastMarksForBoat = (boatId: string) => dedupGet(`/operations/boat/${boatId}/last-marks`);

// Queue
export const getQueue = () => dedupGet('/queue/today');
export const updateQueueStatus = (id: string, status: string) => api.patch(`/queue/${id}/status`, { status });

// Weather
export const getWeatherCurrent = () => dedupGet('/weather/current');
export const getWeatherHistory = (hours?: number) => dedupGet('/weather/history', hours ? { hours } : undefined);
export const getWeatherForecast = () => dedupGet('/weather/forecast');
export const getWeatherAiSummary = () => dedupGet('/weather/ai-summary');

export const getMarketplaceBoats = () => axios.get(`${BASE_URL}/public/boats/marketplace`);

// ─── Woovi (Pix Payments) ───────────────────────────────
export const createWooviCharge = (chargeId: string) => api.post(`/payments/woovi/charge/${chargeId}`);
export const getWooviChargeStatus = (correlationID: string) => dedupGet(`/payments/woovi/charge/${correlationID}`);

// Profile
export const updateProfile = (data: { name?: string; phone?: string; avatar?: string }) =>
  api.patch('/users/profile', data);

export const changePassword = (data: { currentPassword: string; newPassword: string }) =>
  api.post('/auth/change-password', data);

export const deleteAccount = () => api.delete('/users/profile');

// ─── Convenience Store (APP COTISTA) ───────────────────
export const getConvenienceItems = () => dedupGet('/menu/convenience');
export const createConvenienceOrder = (data: {
  items: { menuItemId: string; quantity: number; notes?: string }[];
  notes?: string;
  paymentMethod: 'PIX' | 'PICKUP';
}) => api.post('/orders/app-cotista', data);

export default api;
