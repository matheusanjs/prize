'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export function useAdminReservations() {
  return useQuery({
    queryKey: ['reservations'],
    queryFn: async () => {
      const { data } = await api.get('/reservations');
      return Array.isArray(data) ? data : data?.data || [];
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users', { params: { page: 1, limit: 200 } });
      return Array.isArray(data) ? data : data?.data || [];
    },
    staleTime: 60_000,
  });
}

export function useAdminWeatherCurrent() {
  return useQuery({
    queryKey: ['weather', 'current'],
    queryFn: async () => {
      const { data } = await api.get('/weather/current');
      return data?.data || null;
    },
    staleTime: 10 * 60_000,
  });
}

export function useAdminWeatherForecast() {
  return useQuery({
    queryKey: ['weather', 'forecast'],
    queryFn: async () => {
      const { data } = await api.get('/weather/forecast');
      return data?.data || [];
    },
    staleTime: 30 * 60_000,
  });
}
