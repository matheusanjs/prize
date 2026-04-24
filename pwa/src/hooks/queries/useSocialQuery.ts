'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export function useTripsQuery() {
  return useQuery({
    queryKey: ['social', 'trips'],
    queryFn: async () => {
      const { data } = await api.get('/social/trips');
      return {
        trips: data.trips || [],
        hasShare: data.hasShare ?? true,
      };
    },
    staleTime: 60_000,
  });
}

export function useTripDetailQuery(tripId?: string) {
  return useQuery({
    queryKey: ['social', 'trip', tripId],
    queryFn: async () => {
      const { data } = await api.get(`/social/trips/${tripId}`);
      return data;
    },
    enabled: !!tripId,
    staleTime: 30_000,
  });
}
