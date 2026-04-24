'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getShares,
  getAllBoatReservations,
  getMyReservations,
  getMySwaps,
} from '@/services/api';

export function useBoatSnapshotQuery(boatId?: string | null) {
  return useQuery({
    queryKey: ['reservations', 'snapshot', boatId],
    queryFn: async () => {
      const { data } = await getAllBoatReservations(boatId!, { pastDays: 60, futureMonths: 12 });
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: !!boatId,
    staleTime: 10_000,
  });
}

export function useSharesForBoatsQuery(userId?: string) {
  return useQuery({
    queryKey: ['reservations', 'shares', userId],
    queryFn: async () => {
      const { data } = await getShares({ userId: userId! });
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useMyReservationsQuery() {
  return useQuery({
    queryKey: ['reservations', 'my'],
    queryFn: async () => {
      const { data } = await getMyReservations();
      return Array.isArray(data) ? data : data?.data || [];
    },
    staleTime: 10_000,
  });
}

export function useMySwapsQuery(userId?: string) {
  return useQuery({
    queryKey: ['reservations', 'swaps', userId],
    queryFn: async () => {
      const { data } = await getMySwaps();
      return Array.isArray(data) ? data : (data?.data || []);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
