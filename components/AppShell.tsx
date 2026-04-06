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

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-96 bg-gradient-to-b from-blue-50 to-blue-50 border-r border-gray-200 pt-24">
        <nav className="px-6 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
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

      <div className="flex flex-col flex-1 ml-96">
        {/* Navbar */}
        <header className="fixed top-0 left-0 right-0 h-24 bg-blue-900 text-white px-8 flex items-center justify-between z-50 ml-96">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center text-sm font-bold">
              CV
            </div>
            <span className="text-lg font-semibold">CV natas nitis netes</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user?.name || 'User'}</span>
            <div className="flex gap-2">
              <button
                onClick={handleProfileClick}
                className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center hover:bg-blue-600 transition cursor-pointer"
                title="Lihat Profil"
              >
                <User size={20} />
              </button>
              <button
                onClick={handleLogout}
                className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition cursor-pointer"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 pt-24 px-8 pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
