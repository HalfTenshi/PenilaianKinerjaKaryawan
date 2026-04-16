import { Mail, Briefcase, Building2, BadgeCheck, User } from "lucide-react";

type KaryawanProfileCardProps = {
  nama: string;
  nip?: string;
  email?: string;
  jabatan?: string;
  bagian?: string;
  statusAktif?: boolean;
  fotoProfilUrl?: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export default function KaryawanProfileCard({
  nama,
  nip,
  email,
  jabatan,
  bagian,
  statusAktif = true,
  fotoProfilUrl,
}: KaryawanProfileCardProps) {
  const initials = getInitials(nama || "U");

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-col items-center text-center">
        {fotoProfilUrl ? (
          // Kalau nanti fitur foto diaktifkan lagi, ini sudah siap dipakai
          <img
            src={fotoProfilUrl}
            alt={nama}
            className="h-24 w-24 rounded-full object-cover ring-4 ring-slate-100"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold text-slate-700 ring-4 ring-slate-100">
            {initials || <User size={28} />}
          </div>
        )}

        <h3 className="mt-4 text-lg font-bold text-slate-800 md:text-xl">
          {nama}
        </h3>

        {nip ? <p className="mt-1 text-sm text-slate-500">NIP: {nip}</p> : null}

        <div className="mt-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              statusAktif
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {statusAktif ? "Aktif" : "Nonaktif"}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {email ? (
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
            <div className="mt-0.5 text-slate-600">
              <Mail size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Email</p>
              <p className="break-all text-sm text-slate-800">{email}</p>
            </div>
          </div>
        ) : null}

        {jabatan ? (
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
            <div className="mt-0.5 text-slate-600">
              <Briefcase size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Jabatan</p>
              <p className="text-sm text-slate-800">{jabatan}</p>
            </div>
          </div>
        ) : null}

        {bagian ? (
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
            <div className="mt-0.5 text-slate-600">
              <Building2 size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Bagian</p>
              <p className="text-sm text-slate-800">{bagian}</p>
            </div>
          </div>
        ) : null}

        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
          <div className="mt-0.5 text-slate-600">
            <BadgeCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Status Akun</p>
            <p className="text-sm text-slate-800">
              {statusAktif ? "Karyawan aktif" : "Karyawan nonaktif"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}