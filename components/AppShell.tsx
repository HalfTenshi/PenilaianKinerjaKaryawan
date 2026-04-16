"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  FileText,
  History,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { href: "/karyawan/dashboard", label: "Dashboard", icon: Home },
    { href: "/karyawan/isi-penilaian", label: "Isi penilaian", icon: FileText },
    { href: "/karyawan/riwayat", label: "Riwayat Penilaian", icon: History },
  ];

  const isActive = (href: string) => pathname === href;

  const handleProfileClick = () => {
    router.push("/karyawan/profil");
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const namaTampil = user?.nama?.trim() || user?.email?.split("@")[0] || "User";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-80 border-r border-gray-200 bg-gradient-to-b from-blue-50 to-blue-50 pt-24 lg:block xl:w-96">
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
                    ? "bg-blue-700 text-white"
                    : "text-gray-700 hover:bg-blue-100"
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Overlay mobile */}
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      {/* Sidebar mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-sm flex-col border-r border-gray-200 bg-gradient-to-b from-blue-50 to-blue-50 transition-transform duration-300 lg:hidden ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-gray-200 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">
              CV
            </div>
            <span className="truncate text-sm font-semibold text-gray-900">
              CV natas nitis netes
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-2 text-gray-700 hover:bg-blue-100"
            aria-label="Tutup menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-2 px-4 py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                  active
                    ? "bg-blue-700 text-white"
                    : "text-gray-700 hover:bg-blue-100"
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-gray-200 p-4">
          <div className="mb-3 text-sm font-medium text-gray-700">
            {namaTampil}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleProfileClick}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-white transition hover:bg-blue-600"
              type="button"
            >
              <User size={18} />
              <span>Profil</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-white transition hover:bg-red-700"
              type="button"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Content area */}
      <div className="lg:ml-80 xl:ml-96">
        {/* Navbar */}
        <header className="fixed top-0 left-0 right-0 z-20 h-24 lg:left-80 xl:left-96">
          <div className="flex h-full items-center justify-between bg-blue-900 px-4 text-white sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg p-2 transition hover:bg-blue-800 lg:hidden"
                title="Buka menu"
                type="button"
              >
                <Menu size={22} />
              </button>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold">
                CV
              </div>

              <span className="truncate text-sm font-semibold sm:text-lg">
                CV natas nitis netes
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <span className="hidden max-w-[180px] truncate text-sm font-medium sm:block">
                {namaTampil}
              </span>

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
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 pb-8 pt-28 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}