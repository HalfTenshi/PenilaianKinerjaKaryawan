'use client';

import { User, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export function Topbar() {
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="fixed top-0 left-80 right-0 h-24 bg-blue-900 text-white px-8 flex items-center justify-between z-40">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-blue-700 rounded-full flex items-center justify-center text-sm font-bold">
          CV
        </div>
        <span className="text-xl font-semibold">CV natas nitis netes</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm">Admin123</span>
        <div className="flex gap-2">
          <button className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center hover:bg-blue-600 transition">
            <User size={20} />
          </button>
          <button
            onClick={handleLogout}
            className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
