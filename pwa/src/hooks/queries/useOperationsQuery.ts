'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getChecklists,
  getTodayReservationsForOperator,
} from '@/services/api';
import api from '@/services/api';

export function useChecklistsQuery() {
  return useQuery({
    queryKey: ['operations', 'checklists'],
    queryFn: async () => {
      const { data } = await getChecklists();
      const d = Array.isArray(data) ? data : data?.data || [];
      return d;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useQueueQuery() {
  return useQuery({
    queryKey: ['operations', 'queue'],
    queryFn: async () => {
      const { data } = await api.get('/operations/queue');
      const q = Array.isArray(data) ? data : data?.data || [];
      return q;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useTodayReservationsQuery() {
  return useQuery({
    queryKey: ['operations', 'todayReservations'],
    queryFn: async () => {
      const { data } = await getTodayReservationsForOperator();
      const t = Array.isArray(data) ? data : data?.data || [];
      return t;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useClientReservationsQuery() {
  return useQuery({
    queryKey: ['operations', 'clientReservations'],
    queryFn: async () => {
      const checklistRes = await api.get('/operations/pre-launch/my-reservations');
      const checklistData = Array.isArray(checklistRes.data) ? checklistRes.data : checklistRes.data?.data || [];

      let usageData: any[] = [];
      try {
        const usageRes = await api.get('/operations/usages/my');
        usageData = Array.isArray(usageRes.data) ? usageRes.data : usageRes.data?.data || [];
      } catch { /* empty */ }

      const mergedMap = new Map<string, any>();
      checklistData.forEach((r: any) => mergedMap.set(r.id, r));
      usageData.forEach((r: any) => {
        const existing = mergedMap.get(r.id);
        if (existing) {
          mergedMap.set(r.id, { ...r, checklist: existing.checklist || r.checklist });
        } else {
          mergedMap.set(r.id, r);
        }
      });

      return Array.from(mergedMap.values()).sort(
        (a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
