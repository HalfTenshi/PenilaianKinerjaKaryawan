'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FileText, ClipboardList } from 'lucide-react';

const menuItems = [
  {
    href: '/admin/dashboard',
    label: 'Dashboard',
    icon: BarChart3,
  },
  {
    href: '/admin/penilaian-kinerja',
    label: 'Penilaian Kinerja',
    icon: FileText,
  },
  {
    href: '/admin/laporan',
    label: 'Laporan',
    icon: ClipboardList,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href;

  return (
    <aside className="w-80 bg-gray-100 border-r border-gray-200 fixed h-screen overflow-y-auto pt-32">
      <nav className="space-y-2 px-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                active
                  ? 'bg-blue-900 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
