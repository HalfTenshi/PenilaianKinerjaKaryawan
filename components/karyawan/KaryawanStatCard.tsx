import { ReactNode } from "react";

type KaryawanStatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
};

export default function KaryawanStatCard({
  title,
  value,
  subtitle,
  icon,
}: KaryawanStatCardProps) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-800 md:text-3xl">
            {value}
          </h3>
          {subtitle ? (
            <p className="mt-2 text-xs text-slate-500 md:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>

        {icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}