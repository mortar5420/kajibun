import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import '@mantine/core/styles.css';
import { queryClient } from '../lib/queryClient';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}
