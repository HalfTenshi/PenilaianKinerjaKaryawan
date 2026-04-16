"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, User, ClipboardList, Menu, X } from "lucide-react";

type KaryawanShellProps = {
  title: string;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    href: "/karyawan/dashboard",
    label: "Dashboard",
    icon: <Home size={18} />,
  },
  {
    href: "/karyawan/profil",
    label: "Profil",
    icon: <User size={18} />,
  },
  {
    href: "/karyawan/penilaian",
    label: "Penilaian",
    icon: <ClipboardList size={18} />,
  },
];

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function KaryawanShell({
  title,
  children,
}: KaryawanShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* Sidebar Desktop */}
        <aside className="hidden w-64 flex-col border-r bg-white md:flex">
          <div className="border-b px-6 py-5">
            <h1 className="text-lg font-bold text-slate-800">Karyawan</h1>
            <p className="text-sm text-slate-500">Penilaian Kinerja</p>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                  isActive(item.href)
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Content Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile Topbar */}
          <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-800">
                  {title}
                </h2>
                <p className="text-xs text-slate-500">Penilaian Kinerja</p>
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="rounded-lg border p-2 text-slate-700"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>

            {mobileMenuOpen && (
              <nav className="space-y-1 border-t px-4 py-3">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                      isActive(item.href)
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            )}
          </header>

          {/* Desktop Header */}
          <header className="hidden border-b bg-white md:block">
            <div className="px-6 py-5">
              <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
              <p className="text-sm text-slate-500">
                Halaman karyawan responsif
              </p>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>

      {/* Bottom Navigation Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white md:hidden">
        <div className="grid grid-cols-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition",
                isActive(item.href) ? "text-slate-900" : "text-slate-500"
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Spacer untuk bottom nav mobile */}
      <div className="h-16 md:hidden" />
    </div>
  );
}