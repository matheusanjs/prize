'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export function useAdminQueue(date: string) {
  return useQuery({
    queryKey: ['operations', 'queue', date],
    queryFn: async () => {
      const { data } = await api.get('/operations/queue', { params: { date } });
      return Array.isArray(data) ? data : data?.data || [];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: !!date,
  });
}

export function useAdminChecklists(date: string) {
  return useQuery({
    queryKey: ['operations', 'checklists', date],
    queryFn: async () => {
      const { data } = await api.get('/operations/checklists', { params: { date } });
      return Array.isArray(data) ? data : data?.data || [];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: !!date,
  });
}

export function useAdminBoats() {
  return useQuery({
    queryKey: ['boats'],
    queryFn: async () => {
      const { data } = await api.get('/boats', { params: { page: 1, limit: 100 } });
      return Array.isArray(data) ? data : data?.data || [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useAdminTodayReservations(date: string) {
  return useQuery({
    queryKey: ['operations', 'today-reservations', date],
    queryFn: async () => {
      const { data } = await api.get('/operations/pre-launch/today-reservations', { params: { date } });
      return Array.isArray(data) ? data : data?.data || [];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: !!date,
  });
}
