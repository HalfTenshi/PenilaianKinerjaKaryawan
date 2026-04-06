'use client';

import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export function KaryawanLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRole="karyawan">
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
