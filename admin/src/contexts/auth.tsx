'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api, { login as apiLogin } from '@/services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Extract tokens from URL synchronously on module load (before any effects)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlRefresh = params.get('refreshToken');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      if (urlRefresh) localStorage.setItem('refreshToken', urlRefresh);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  const loadUser = useCallback(async () => {
    // Restore cached user immediately — prevents any loading flash / redirect on rebuild
    const cached = localStorage.getItem('cachedUser');
    if (cached) {
      try { setUser(JSON.parse(cached)); } catch { localStorage.removeItem('cachedUser'); }
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/users/profile');
      setUser(data);
      localStorage.setItem('cachedUser', JSON.stringify(data));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (!status || status >= 500) {
        // Network / server temporarily down (e.g. rebuild) — keep cached user, stay logged in
      } else {
        // 401 was handled by the interceptor (refresh or redirect already triggered)
        // Just clear cached data to stay in sync
        localStorage.removeItem('cachedUser');
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading) {
      const publicPages = ['/login', '/forgot-password', '/reset-password'];
      const isPublicPage = publicPages.some(p => pathname.startsWith(p));
      if (!user && !isPublicPage) {
        window.location.href = 'https://marinaprizeclub.com/login';
      } else if (user && pathname === '/login') {
        router.replace('/dashboard');
      }
    }
  }, [isLoading, user, pathname, router]);

  const login = async (email: string, password: string) => {
    const { data } = await apiLogin(email, password);
    if (data.user.role !== 'ADMIN') {
      if (data.user.role === 'WAITER') {
        // Redirect waiters to the garcom panel
        const params = new URLSearchParams({
          token: data.accessToken,
          refreshToken: data.refreshToken,
        });
        window.location.href = `https://garcom.marinaprizeclub.com/?${params.toString()}`;
        return;
      }
      // Redirect non-admin users to the PWA panel with tokens so they don't login twice
      const params = new URLSearchParams({
        token: data.accessToken,
        refreshToken: data.refreshToken,
      });
      window.location.href = `https://app.marinaprizeclub.com/?${params.toString()}`;
      return;
    }
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('cachedUser', JSON.stringify(data.user));
    setUser(data.user);
    router.push('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('cachedUser');
    setUser(null);
    window.location.href = 'https://marinaprizeclub.com/login';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
