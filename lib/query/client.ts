'use client';

import { QueryClient } from '@tanstack/react-query';

let registeredQueryClient: QueryClient | null = null;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function registerQueryClient(client: QueryClient) {
  registeredQueryClient = client;
}

export function getRegisteredQueryClient() {
  return registeredQueryClient;
}

export function clearRegisteredQueryClient() {
  registeredQueryClient = null;
}
