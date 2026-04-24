'use client';

import { useQuery } from '@tanstack/react-query';
import { getWeatherCurrent, getWeatherForecast } from '@/services/api';

export function useWeatherCurrentQuery() {
  return useQuery({
    queryKey: ['weather', 'current'],
    queryFn: async () => {
      const { data } = await getWeatherCurrent();
      if (data.ok && data.data) return data.data;
      throw new Error('No weather data');
    },
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export function useWeatherForecastQuery() {
  return useQuery({
    queryKey: ['weather', 'forecast'],
    queryFn: async () => {
      const { data } = await getWeatherForecast();
      if (data.ok && data.data) return data.data;
      return [];
    },
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });
}

export function useWeatherAiSummaryQuery() {
  return useQuery({
    queryKey: ['weather', 'ai-summary'],
    queryFn: async () => {
      const { getWeatherAiSummary } = await import('@/services/api');
      const { data } = await getWeatherAiSummary();
      return data?.data?.summary || data?.summary || null;
    },
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
  });
}
