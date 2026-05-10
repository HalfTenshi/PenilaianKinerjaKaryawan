"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";

import {
  getPenilaianByDocId,
  getKaryawanById,
  getPeriodeById,
  getKriteriaByPeriode,
  getAttendanceSummary,
  hitungNilaiAkhir,
  type KriteriaPenilaian,
  type PenilaianKinerja,
  type Karyawan,
  type PeriodePenilaian,
} from "@/lib/firebase/adminPenilaianKinerja";

import { useAuth } from "@/context/AuthContext";

function toNumberSafe(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function format2(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function getTanggalMulai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.mulai ??
    periode?.startDate ??
    periode?.tanggalMulai ??
    periode?.awal ??
    null
  );
}

function getTanggalSelesai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.selesai ??
    periode?.endDate ??
    periode?.tanggalSelesai ??
    periode?.akhir ??
    null
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_16px_minmax(0,1fr)] sm:gap-2">
      <span className="font-medium text-blue-700">{label}</span>
      <span className="hidden text-gray-500 sm:block">:</span>
      <div className="min-w-0 text-gray-700">{value}</div>
    </div>
  );
}

export default function DetailPenilaianKaryawanPage() {
  const params = useParams();
  const { user } = useAuth();

  const uid = user?.uid;
  const karyawanId = user?.karyawanId || uid;

  const periodeId = String((params as any)?.periodeId || (params as any)?.periode || "");
  const penilaianId = karyawanId && periodeId ? `${karyawanId}_${periodeId}` : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [penilaian, setPenilaian] = useState<PenilaianKinerja | null>(null);
  const [karyawan, setKaryawan] = useState<Karyawan | null>(null);
  const [periode, setPeriode] = useState<PeriodePenilaian | null>(null);
  const [kriteria, setKriteria] = useState<KriteriaPenilaian[]>([]);

  const [hadirHari, setHadirHari] = useState(0);
  const [hadirPersen, setHadirPersen] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (!penilaianId || !periodeId || !karyawanId) {
          throw new Error("Parameter tidak lengkap.");
        }

        const p = await getPenilaianByDocId(penilaianId);
        if (!p) {
          throw new Error("Data penilaian tidak ditemukan.");
        }

        if (p.karyawanId !== karyawanId) {
          throw new Error("Akses ditolak.");
        }

        const k = await getKaryawanById(p.karyawanId);
        const per = await getPeriodeById(p.periodeId);
        if (!per) {
          throw new Error("Periode penilaian tidak ditemukan.");
        }

        const kri = await getKriteriaByPeriode(p.periodeId);

        if (!mounted) return;

        setPenilaian(p);
        setKaryawan(k);
        setPeriode(per);
        setKriteria(kri);

        try {
          const sum = await getAttendanceSummary({
            karyawanId: p.karyawanId,
            mulai: getTanggalMulai(per),
            selesai: getTanggalSelesai(per),
          });

          if (!mounted) return;
          setHadirHari(sum.hadirHari);
          setHadirPersen(sum.hadirPersen);
        } catch (e: any) {
          console.warn("Attendance query warning:", e?.message);
          if (!mounted) return;
          setHadirHari(0);
          setHadirPersen(0);
        }

        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Gagal memuat detail penilaian.");
        setLoading(false);
      }
    }

    if (uid && karyawanId && periodeId) {
      load();
    }

    return () => {
      mounted = false;
    };
  }, [uid, karyawanId, periodeId, penilaianId]);

  const criteriaRows = useMemo(() => {
    return kriteria.map((kr) => {
      const nilaiKaryawan = penilaian?.nilaiKaryawan?.[kr.id];
      const nilaiAdmin = penilaian?.nilaiAdmin?.[kr.id];

      return {
        id: kr.id,
        name: kr.namaKriteria,
        weight: `${kr.bobot}%`,
        nilaiKaryawan: typeof nilaiKaryawan === "number" ? nilaiKaryawan : null,
        nilaiAdmin: typeof nilaiAdmin === "number" ? nilaiAdmin : null,
      };
    });
  }, [kriteria, penilaian?.nilaiKaryawan, penilaian?.nilaiAdmin]);

  const totalNilaiKaryawan = useMemo(() => {
    return hitungNilaiAkhir({
      nilai: penilaian?.nilaiKaryawan,
      kriteria,
    });
  }, [penilaian?.nilaiKaryawan, kriteria]);

  const totalNilaiAkhir = useMemo(() => {
    if (typeof (penilaian as any)?.totalNilai === "number") {
      return toNumberSafe((penilaian as any).totalNilai);
    }

    return hitungNilaiAkhir({
      nilai: penilaian?.nilaiAdmin,
      kriteria,
    });
  }, [penilaian, kriteria]);

  const catatanKaryawanText =
    penilaian?.catatanKaryawan && String(penilaian.catatanKaryawan).trim()
      ? String(penilaian.catatanKaryawan)
      : "Tidak ada catatan dari karyawan.";

  const catatanAdminText =
    penilaian?.catatanAdmin && String(penilaian.catatanAdmin).trim()
      ? String(penilaian.catatanAdmin)
      : "Belum ada catatan dari admin.";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
          Memuat detail penilaian...
        </div>
      </div>
    );
  }

  if (error || !penilaian || !periode) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-red-600 shadow-sm">
          {error ?? "Data tidak valid."}
        </div>
        <Link
          href="/karyawan/riwayat"
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          Kembali
        </Link>
      </div>
    );
  }

  const foto = (user as any)?.fotoProfilUrl || "/images/default-profile.png";
  const jabatanTampil =
    karyawan?.jabatan && String(karyawan.jabatan).trim() !== "-"
      ? String(karyawan.jabatan).trim()
      : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-blue-700">
        <Link href="/karyawan/riwayat" className="hover:text-blue-900">
          Riwayat Penilaian
        </Link>
        <ChevronRight size={16} />
        <span>Detail penilaian</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-blue-900 md:text-4xl">
          Detail Penilaian
        </h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6 xl:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
          <div className="mx-auto w-full max-w-[180px] shrink-0 xl:mx-0">
            <div className="overflow-hidden rounded-lg border border-gray-300 bg-gray-200">
              <Image
                src={foto}
                alt={karyawan?.nama ?? "Karyawan"}
                width={180}
                height={198}
                className="h-auto w-full object-contain"
                priority
              />
            </div>
          </div>

          <div className="flex-1 space-y-5">
            <div className="text-center xl:text-left">
              <h2 className="text-2xl font-bold text-blue-900">
                {karyawan?.nama ?? penilaian.karyawanId}
              </h2>
              {jabatanTampil !== "" && (
                <p className="font-medium text-blue-600">{jabatanTampil}</p>
              )}
            </div>

            <div className="space-y-3">
              <InfoRow label="NIP" value={karyawan?.nip ?? "-"} />
              <InfoRow label="Bagian" value={karyawan?.bagian ?? "-"} />
              <InfoRow label="Periode Penilaian" value={periode.namaPeriode} />
              <InfoRow label="Status" value={penilaian.status} />
            </div>
          </div>

          <div className="w-full rounded-lg border border-blue-100 bg-blue-50 p-5 xl:w-72">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-sm text-gray-600">Nilai Akhir</p>
              </div>
            </div>

            <div className="mt-4 text-3xl font-bold text-blue-900 md:text-4xl">
              {format2(totalNilaiAkhir)}
            </div>

            <div className="mt-4 border-t border-blue-200 pt-4">
              <p className="mb-2 text-sm text-gray-700">Hadir : {hadirHari} Hari</p>
              <p className="text-2xl font-bold text-green-700">{hadirPersen}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-blue-900">
              Ringkasan Karyawan
            </h3>
            <span className="inline-flex w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs text-blue-800">
              Nilai Karyawan
            </span>
          </div>

          <p className="text-sm text-gray-600">Total Nilai Karyawan</p>
          <p className="mt-1 text-3xl font-bold text-blue-900 md:text-4xl">
            {format2(totalNilaiKaryawan)}
          </p>

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-blue-900">
              Catatan Karyawan
            </p>
            <div className="min-h-[120px] rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {catatanKaryawanText}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-blue-900">Catatan Admin</h3>
            <span className="inline-flex w-fit rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">
              Read-only
            </span>
          </div>

          <div className="min-h-[180px] rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {catatanAdminText}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-6 border-b border-gray-300 pb-4">
          <h3 className="text-lg font-semibold text-blue-900">
            Hasil Penilaian Kriteria
          </h3>
        </div>

        {/* Mobile */}
        <div className="space-y-4 md:hidden">
          {criteriaRows.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-500">
              Kriteria untuk periode ini belum dibuat.
            </div>
          ) : (
            criteriaRows.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-blue-900">{item.name}</h4>
                    <p className="text-sm text-gray-600">Bobot: {item.weight}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Nilai Karyawan
                      </p>
                      <p className="mt-1 text-gray-700">
                        {item.nilaiKaryawan === null ? "-" : item.nilaiKaryawan}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Nilai Admin
                      </p>
                      <p className="mt-1 text-gray-700">
                        {item.nilaiAdmin === null ? "-" : item.nilaiAdmin}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-6 py-3 text-left font-semibold text-blue-900">
                  Kriteria Penilaian
                </th>
                <th className="px-6 py-3 text-left font-semibold text-blue-900">
                  Bobot
                </th>
                <th className="px-6 py-3 text-center font-semibold text-blue-900">
                  Nilai Karyawan
                </th>
                <th className="px-6 py-3 text-center font-semibold text-blue-900">
                  Nilai Admin
                </th>
              </tr>
            </thead>
            <tbody>
              {criteriaRows.map((item) => (
                <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-blue-700">{item.name}</td>
                  <td className="px-6 py-4 text-gray-700">{item.weight}</td>
                  <td className="px-6 py-4 text-center text-gray-700">
                    {item.nilaiKaryawan === null ? "-" : item.nilaiKaryawan}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-700">
                    {item.nilaiAdmin === null ? "-" : item.nilaiAdmin}
                  </td>
                </tr>
              ))}

              {criteriaRows.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-gray-500" colSpan={4}>
                    Kriteria untuk periode ini belum dibuat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-lg bg-blue-50 p-5 md:p-6">
          <div className="text-center">
            <p className="mb-2 font-medium text-blue-700">Total Nilai Akhir :</p>
            <p className="text-3xl font-bold text-blue-900 md:text-4xl">
              {format2(totalNilaiAkhir)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-stretch sm:justify-end">
        <Link
          href="/karyawan/riwayat"
          className="inline-flex w-full items-center justify-center rounded bg-blue-700 px-8 py-3 font-semibold text-white transition hover:bg-blue-800 sm:w-auto"
        >
          Kembali
        </Link>
      </div>
    </div>
  );
}