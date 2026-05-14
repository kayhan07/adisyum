'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createAppQueryClient, registerQueryClient } from '@/lib/query/client';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = createAppQueryClient();
    registerQueryClient(client);
    return client;
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
