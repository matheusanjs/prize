'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api, { login as apiLogin } from '@/services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT';
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

function processToken(urlToken: string, urlRefresh: string | null) {
  localStorage.setItem('token', urlToken);
  if (urlRefresh) localStorage.setItem('refreshToken', urlRefresh);
  window.history.replaceState({}, '', window.location.pathname);
}

function restoreCachedUser(): User | null {
  const raw = localStorage.getItem('cachedUser');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { localStorage.removeItem('cachedUser'); return null; }
}

async function fetchUserProfile(): Promise<User | null> {
  const { data } = await api.get('/users/profile');
  if (data.role === 'ADMIN') {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('cachedUser');
    return null;
  }
  localStorage.setItem('cachedUser', JSON.stringify(data));
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const initialized = useRef(false);

  // Run auth initialization exactly once
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      // Handle URL token injection
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) processToken(urlToken, params.get('refreshToken'));
      }

      const token = localStorage.getItem('token');
      if (!token) { setIsLoading(false); return; }

      // Restore cached user immediately for instant rendering
      const cached = restoreCachedUser();
      if (cached) {
        setUser(cached);
        setIsLoading(false);
      }

      // Always fetch fresh profile in background
      try {
        const profile = await fetchUserProfile();
        setUser(prev => profile && (!prev || prev.id !== profile.id) ? profile : prev);
        if (!cached) setIsLoading(false);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        // On server/network error, keep cached user
        if (!cached) setIsLoading(false);
        if (!status || status >= 500) return;
        // On 4xx, clear everything
        localStorage.removeItem('cachedUser');
        setUser(null);
      }
    })();
  }, []);

  // Redirect to login only when auth has settled and user is null
  useEffect(() => {
    if (!isLoading && !user && pathname !== '/login' && !pathname.startsWith('/social/share/')) {
      window.location.href = 'https://marinaprizeclub.com/login';
    }
  }, [isLoading, user, pathname]);

  const login = async (email: string, password: string) => {
    const { data } = await apiLogin(email, password);
    if (data.user.role === 'ADMIN') {
      throw new Error('Acesse o painel administrativo para contas de admin.');
    }
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('cachedUser', JSON.stringify(data.user));
    setUser(data.user);
    if (data.user.role === 'OPERATOR') router.push('/fuel');
    else router.push('/reservations');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('cachedUser');
    setUser(null);
    window.location.href = 'https://marinaprizeclub.com/login';
  };

  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const profile = await fetchUserProfile();
      if (profile) setUser(profile);
    } catch { /* keep cached data on failure */ }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
