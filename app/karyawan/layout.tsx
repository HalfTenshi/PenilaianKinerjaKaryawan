'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/AppShell';

export default function KaryawanLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // belum login
    if (!user) {
      router.replace('/login');
      return;
    }

    // role bukan karyawan
    if (user.role !== 'karyawan') {
      router.replace('/login');
      return;
    }

    // akun nonaktif (opsional tapi sesuai model kamu)
    if (user.statusAktif === false) {
      router.replace('/login');
      return;
    }
  }, [user, isLoading, router, pathname]);

  // Loading auth (menunggu onAuthStateChanged + getUserProfile)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Memuat...</p>
      </div>
    );
  }

  // Jika bukan karyawan / tidak ada user, layout tidak render apa-apa karena sudah redirect
  if (!user || user.role !== 'karyawan' || user.statusAktif === false) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}