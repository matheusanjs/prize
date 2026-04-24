'use client';

import { useQuery } from '@tanstack/react-query';
import { getMyCharges } from '@/services/api';

export function useChargesQuery() {
  return useQuery({
    queryKey: ['invoices', 'charges'],
    queryFn: async () => {
      const { data } = await getMyCharges({ status: undefined });
      const items = Array.isArray(data) ? data : data?.data || [];
      items.sort((a: any, b: any) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
      return items;
    },
    staleTime: 30_000,
  });
}
