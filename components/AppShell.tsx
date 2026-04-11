'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, FileText, History, User, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const menuItems = [
    { href: '/karyawan/dashboard', label: 'Dashboard', icon: Home },
    { href: '/karyawan/isi-penilaian', label: 'Isi penilaian', icon: FileText },
    { href: '/karyawan/riwayat', label: 'Riwayat Penilaian', icon: History },
  ];

  const isActive = (href: string) => pathname === href;

  const handleProfileClick = () => {
    router.push('/karyawan/profil');
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const namaTampil =
    user?.nama?.trim() ||
    user?.email?.split('@')[0] ||
    'User';

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-96 bg-gradient-to-b from-blue-50 to-blue-50 border-r border-gray-200 pt-24">
        <nav className="space-y-2 px-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-gray-700 hover:bg-blue-100'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="ml-96 flex flex-1 flex-col">
        {/* Navbar */}
        <header className="fixed top-0 left-0 right-0 z-50 ml-96 flex h-24 items-center justify-between bg-blue-900 px-8 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-sm font-bold">
              CV
            </div>
            <span className="text-lg font-semibold">CV natas nitis netes</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{namaTampil}</span>

            <div className="flex gap-2">
              <button
                onClick={handleProfileClick}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 transition hover:bg-blue-600"
                title="Lihat Profil"
                type="button"
              >
                <User size={20} />
              </button>

              <button
                onClick={handleLogout}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 transition hover:bg-red-700"
                title="Logout"
                type="button"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-8 pt-24 pb-8">{children}</main>
      </div>
    </div>
  );
}