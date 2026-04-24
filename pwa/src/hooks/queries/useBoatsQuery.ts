'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getShares,
  getMyCharges,
  getPendingSwaps,
  getMyReservations,
  getWeatherCurrent,
} from '@/services/api';
import api from '@/services/api';
import { differenceInCalendarDays, parseISO } from 'date-fns';

const MARINA_LAT = -22.97;
const MARINA_LNG = -44.32;

interface Weather {
  temp: number;
  code: number;
  wind: number;
  humidity?: number;
}

export function useSharesQuery(userId?: string) {
  return useQuery({
    queryKey: ['boats', 'shares', userId],
    queryFn: async () => {
      const { data } = await getShares({ userId: userId! });
      const raw = Array.isArray(data) ? data : data?.data || [];
      return raw;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useChargesByBoatQuery(userId?: string) {
  return useQuery({
    queryKey: ['boats', 'chargesByBoat', userId],
    queryFn: async () => {
      const { data } = await getMyCharges();
      const list = Array.isArray(data) ? data : data?.data || [];
      const grouped: Record<string, { overdue: number; pending: number }> = {};
      list.forEach((c: any) => {
        const bid = c.boatId || '_none';
        if (!grouped[bid]) grouped[bid] = { overdue: 0, pending: 0 };
        if (c.status === 'OVERDUE') grouped[bid].overdue++;
        if (c.status === 'PENDING') grouped[bid].pending++;
      });
      return grouped;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function usePendingSwapsQuery(userId?: string) {
  return useQuery({
    queryKey: ['boats', 'pendingSwaps', userId],
    queryFn: async () => {
      const { data } = await getPendingSwaps();
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useTodayReservationsBoatsQuery(userId?: string) {
  return useQuery({
    queryKey: ['boats', 'todayReservations', userId],
    queryFn: async () => {
      const { data } = await getMyReservations();
      const list = Array.isArray(data) ? data : data?.data || [];
      return list.filter((r: any) => {
        if (!['CONFIRMED', 'PENDING'].includes(r.status)) return false;
        const diff = differenceInCalendarDays(parseISO(r.startDate), new Date());
        return diff === 0 || diff === 1;
      });
    },
    enabled: !!userId,
    staleTime: 10_000,
  });
}

export function useHighlightedTripsQuery(userId?: string) {
  return useQuery({
    queryKey: ['boats', 'highlightedTrips', userId],
    queryFn: async () => {
      const { data } = await api.get('/social/trips');
      const trips = data.trips || [];
      return trips.filter((t: any) => t.isHighlighted).slice(0, 5);
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useWeatherQuery() {
  return useQuery({
    queryKey: ['weather'],
    queryFn: async (): Promise<Weather> => {
      try {
        const { data } = await getWeatherCurrent();
        const w = data?.data || data;
        if (w && typeof w.airTemperature === 'number') {
          const cc = Number(w.cloudCover ?? 0);
          const precip = Number(w.precipitation ?? 0);
          let code = 0;
          if (precip > 5) code = 65;
          else if (precip > 0) code = 51;
          else if (cc > 75) code = 3;
          else if (cc > 25) code = 2;
          else code = 0;
          return {
            temp: Math.round(Number(w.airTemperature)),
            code,
            wind: Math.round(Number(w.windSpeed ?? 0) * 3.6),
            humidity: w.humidity != null ? Math.round(Number(w.humidity)) : undefined,
          };
        }
      } catch { /* fall through */ }

      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${MARINA_LAT}&longitude=${MARINA_LNG}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=America/Sao_Paulo`
      );
      const d = await r.json();
      if (d?.current) {
        return {
          temp: Math.round(d.current.temperature_2m),
          code: d.current.weather_code,
          wind: Math.round(d.current.wind_speed_10m),
          humidity: d.current.relative_humidity_2m,
        };
      }
      throw new Error('No weather data');
    },
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
  });
}
