import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// ─── Lightweight GET response cache (30s TTL) ────────────────────────────

const CACHE_TTL = 10_000; // 10 seconds
const NO_CACHE_URLS = ['/reservations/calendar/', '/reservations/boat/'];
const responseCache = new Map<string, { data: unknown; expiresAt: number }>();

// Clear stale cache on route navigation — prevents cross-page cache hits
if (typeof window !== 'undefined') {
  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    const newPath = window.location.pathname;
    if (newPath !== lastPath) { lastPath = newPath; responseCache.clear(); }
  });
  observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
}

function cacheKey(url: string, params?: Record<string, unknown>): string {
  return url + (params ? '?' + JSON.stringify(params) : '');
}

export function invalidateCache(pattern?: string | RegExp) {
  if (!pattern) { responseCache.clear(); return; }
  for (const key of responseCache.keys()) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      responseCache.delete(key);
    }
  }
}

export function getCachedData<T>(key: string): T | undefined {
  const entry = responseCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  if (entry) responseCache.delete(key);
  return undefined;
}

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  // Always attach token first, even for cached responses
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }

  // Only cache GET requests
  if (config.method === 'get' && config.url) {
    // Never cache calendar and boat reservation endpoints
    if (NO_CACHE_URLS.some(u => config.url!.includes(u))) return config;
    const key = cacheKey(config.url, config.params);
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      // Return a resolved AxiosResponse-like object to skip the network call
      return Promise.resolve({ data: cached.data, status: 200, statusText: 'OK', headers: {}, config } as any);
    }
  }
  return config;
});

api.interceptors.response.use(
  (r) => {
    // Cache GET responses for deduplication
    if (r.config.method === 'get' && r.config.url) {
      if (NO_CACHE_URLS.some(u => r.config.url!.includes(u))) return r;
      const key = cacheKey(r.config.url, r.config.params);
      responseCache.set(key, { data: r.data, expiresAt: Date.now() + CACHE_TTL });
    }
    return r;
  },
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
export const getUsers = (params?: Record<string, unknown>) => api.get('/users', { params: { page: 1, limit: 100, ...params } });

// Boats
export const getBoats = (params?: Record<string, unknown>) => api.get('/boats', { params: { page: 1, limit: 100, ...params } });

// Shares
export const getShares = (params?: { boatId?: string; userId?: string }) => api.get('/shares', { params });

// Reservations
export const getReservations = (params?: Record<string, unknown>) => api.get('/reservations', { params });
export const getMyReservations = () => api.get('/reservations/my-reservations');
export const getBoatReservations = (boatId: string, date?: string) => api.get(`/reservations/boat/${boatId}`, { params: date ? { date } : undefined });
export const getBoatCalendar = (boatId: string, month: number, year: number) => api.get(`/reservations/calendar/${boatId}`, { params: { month, year } });
export const createReservation = (data: Record<string, unknown>) => api.post('/reservations', data);
export const cancelReservation = (id: string, reason?: string) => api.patch(`/reservations/${id}/cancel`, { reason });
export const confirmArrival = (id: string, expectedArrivalTime: string) => api.patch(`/reservations/${id}/confirm-arrival`, { expectedArrivalTime });

// Reservation Swaps
export const createSwapRequest = (data: { targetReservationId: string; offeredReservationId: string; message?: string }) => api.post('/reservations/swap', data);
export const getMySwaps = () => api.get('/reservations/swaps/my');
export const getPendingSwaps = () => api.get('/reservations/swaps/pending');
export const respondToSwap = (id: string, accept: boolean) => api.patch(`/reservations/swaps/${id}/respond`, { accept });
export const getCoOwners = (boatId: string) => api.get(`/reservations/co-owners/${boatId}`);

// Finance / Charges
export const getCharges = (params?: Record<string, unknown>) => api.get('/finance/charges', { params });
export const getMyCharges = (params?: Record<string, unknown>) => api.get('/finance/my-charges', { params });

// Fuel
export const getFuelLogs = (params?: Record<string, unknown>) => api.get('/fuel', { params });
export const getMyFuelLogs = (params?: Record<string, unknown>) => api.get('/fuel/my-logs', { params });
export const getFuelLog = (id: string) => api.get(`/fuel/${id}`);
export const createFuelLog = (data: Record<string, unknown>) => api.post('/fuel', data);
export const getFuelPrice = (fuelType?: string) => api.get('/fuel/price', { params: { fuelType } });
export const setFuelPrice = (price: number, fuelType?: string, notes?: string) => api.put('/fuel/price', { price, fuelType, notes });
export const analyzeGauge = (boatId: string, image: string, mimeType?: string, cropped?: boolean) => api.post('/fuel/analyze-gauge', { boatId, image, mimeType, cropped });
export const getSharesByBoat = (boatId: string) => api.get(`/shares/boat/${boatId}`);

// Maintenance
export const getMaintenances = (params?: Record<string, unknown>) => api.get('/maintenance', { params });
export const createMaintenance = (data: Record<string, unknown>) => api.post('/maintenance', data);
export const updateMaintenance = (id: string, data: Record<string, unknown>) => api.patch(`/maintenance/${id}`, data);

// Operations
export const getChecklists = (params?: Record<string, unknown>) => api.get('/operations/checklists', { params });
export const createChecklist = (data: Record<string, unknown>) => api.post('/operations/checklists', data);
export const startPreLaunch = (reservationId: string) => api.post(`/operations/pre-launch/${reservationId}/start`);
export const submitPreLaunch = (checklistId: string, data: Record<string, unknown>) => api.post(`/operations/pre-launch/${checklistId}/submit`, data);
export const getMyReservationsForChecklist = () => api.get('/operations/pre-launch/my-reservations');
export const getMyUsages = () => api.get('/operations/usages/my');
export const getTodayReservationsForOperator = () => api.get('/operations/pre-launch/today-reservations');
export const startAdHocPreLaunch = (boatId: string, reservationId?: string) => api.post('/operations/pre-launch/start-adhoc', { boatId, reservationId });
export const deleteChecklist = (id: string) => api.delete(`/operations/checklists/${id}`);
export const liftBoat = (queueId: string, returnData?: Record<string, unknown>) => api.patch(`/operations/queue/${queueId}/lift`, returnData || {});
export const liftAllBoats = () => api.patch('/operations/queue/lift-all');
export const launchToWater = (queueId: string) => api.patch(`/operations/queue/${queueId}/launch`);
export const getChecklistsByBoat = (boatId: string) => api.get(`/operations/checklists/boat/${boatId}`);
export const getChecklistById = (id: string) => api.get(`/operations/pre-launch/checklist/${id}`);
export const getLastReturnInspection = (boatId: string) => api.get(`/operations/return-inspection/${boatId}`);
export const getLastMarksForBoat = (boatId: string) => api.get(`/operations/boat/${boatId}/last-marks`);

// Queue
export const getQueue = () => api.get('/queue/today');
export const updateQueueStatus = (id: string, status: string) => api.patch(`/queue/${id}/status`, { status });

// Weather
export const getWeatherCurrent = () => api.get('/weather/current');
export const getWeatherHistory = (hours?: number) => api.get('/weather/history', { params: hours ? { hours } : {} });
export const getWeatherForecast = () => api.get('/weather/forecast');
export const getWeatherAiSummary = () => api.get('/weather/ai-summary');

export const getMarketplaceBoats = () => axios.get(`${BASE_URL}/public/boats/marketplace`);

// ─── Woovi (Pix Payments) ───────────────────────────────
export const createWooviCharge = (chargeId: string) => api.post(`/payments/woovi/charge/${chargeId}`);
export const getWooviChargeStatus = (correlationID: string) => api.get(`/payments/woovi/charge/${correlationID}`);

// Profile
export const updateProfile = (data: { name?: string; phone?: string; avatar?: string }) =>
  api.patch('/users/profile', data);

export const changePassword = (data: { currentPassword: string; newPassword: string }) =>
  api.post('/auth/change-password', data);

export default api;
