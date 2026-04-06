'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PeriodModal } from '@/components/admin/PeriodModal';
import { StatusBadge } from '@/components/admin/StatusBadge';

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

type StatusPenilaian = 'draft' | 'dikirim' | 'dinilai';

type PeriodeAktif = {
  id: string;
  namaPeriode: string;
  status: 'aktif' | 'ditutup';
  mulai?: any;
  selesai?: any;
  createdAt?: any;
  updatedAt?: any;
};

type PenilaianRaw = {
  id: string;
  periodeId: string;
  karyawanId: string;
  status: StatusPenilaian;
  createdAt?: any;
  updatedAt?: any;
};

type PenilaianRow = {
  id: string;
  periodeId: string;
  namaPeriode: string;
  karyawanId: string;
  namaKaryawan: string;
  status: StatusPenilaian;
};

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const onlyDate = value.split('-');
    if (onlyDate.length === 3 && !value.includes('T')) {
      const yy = Number(onlyDate[0]);
      const mm = Number(onlyDate[1]);
      const dd = Number(onlyDate[2]);
      if (Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)) {
        return new Date(yy, mm - 1, dd);
      }
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function toMillis(value: any): number {
  return toDateSafe(value)?.getTime() ?? 0;
}

function formatTanggal(value: any) {
  try {
    const d = toDateSafe(value);
    if (!d) return '-';

    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return '-';
  }
}

function formatRentang(mulai: any, selesai: any) {
  const a = formatTanggal(mulai);
  const b = formatTanggal(selesai);

  if (a === '-' && b === '-') return '-';
  if (a !== '-' && b === '-') return a;
  if (a === '-' && b !== '-') return b;

  return `${a} – ${b}`;
}

function normalizePeriode(id: string, raw: any): PeriodeAktif {
  return {
    id,
    namaPeriode: String(raw?.namaPeriode ?? raw?.nama ?? raw?.name ?? 'Periode Aktif'),
    status: raw?.status === 'ditutup' ? 'ditutup' : 'aktif',
    mulai: raw?.mulai ?? raw?.startDate ?? raw?.tanggalMulai ?? raw?.awal,
    selesai: raw?.selesai ?? raw?.endDate ?? raw?.tanggalSelesai ?? raw?.akhir,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

function normalizePenilaian(id: string, raw: any): PenilaianRaw {
  return {
    id,
    periodeId: String(raw?.periodeId ?? ''),
    karyawanId: String(raw?.karyawanId ?? ''),
    status:
      raw?.status === 'dikirim' || raw?.status === 'dinilai'
        ? raw.status
        : 'draft',
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

export default function AdminDashboardPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [periodeAktif, setPeriodeAktif] = useState<PeriodeAktif | null>(null);
  const [jumlahDinilai, setJumlahDinilai] = useState(0);
  const [jumlahPerluEvaluasi, setJumlahPerluEvaluasi] = useState(0);
  const [latestAssessments, setLatestAssessments] = useState<PenilaianRow[]>([]);

  const [menutupPeriode, setMenutupPeriode] = useState(false);
  const [periodeMsg, setPeriodeMsg] = useState('');

  async function loadDashboard() {
    setLoading(true);
    setPeriodeMsg('');

    try {
      const [periodeSnap, penilaianSnap] = await Promise.all([
        getDocs(
          query(collection(db, 'periode_penilaian'), where('status', '==', 'aktif'))
        ),
        getDocs(collection(db, 'penilaian_kinerja')),
      ]);

      const aktifList = periodeSnap.docs
        .map((d) => normalizePeriode(d.id, d.data()))
        .sort((a, b) => {
          const aScore =
            toMillis(a.updatedAt) || toMillis(a.createdAt) || toMillis(a.mulai);
          const bScore =
            toMillis(b.updatedAt) || toMillis(b.createdAt) || toMillis(b.mulai);
          return bScore - aScore;
        });

      const periode = aktifList[0] ?? null;
      setPeriodeAktif(periode);

      const semuaPenilaian = penilaianSnap.docs
        .map((d) => normalizePenilaian(d.id, d.data()))
        .sort((a, b) => {
          const aScore = toMillis(a.updatedAt) || toMillis(a.createdAt);
          const bScore = toMillis(b.updatedAt) || toMillis(b.createdAt);
          return bScore - aScore;
        });

      const scopedPenilaian = periode
        ? semuaPenilaian.filter((item) => item.periodeId === periode.id)
        : semuaPenilaian;

      setJumlahDinilai(
        scopedPenilaian.filter((item) => item.status === 'dinilai').length
      );
      setJumlahPerluEvaluasi(
        scopedPenilaian.filter((item) => item.status === 'dikirim').length
      );

      const latestBase = scopedPenilaian.slice(0, 5);

      const periodeIds = [
        ...new Set(latestBase.map((x) => x.periodeId).filter(Boolean)),
      ] as string[];
      const karyawanIds = [
        ...new Set(latestBase.map((x) => x.karyawanId).filter(Boolean)),
      ] as string[];

      const [periodePairs, karyawanPairs] = await Promise.all([
        Promise.all(
          periodeIds.map(async (pid) => {
            const s = await getDoc(doc(db, 'periode_penilaian', pid));
            const nama = s.exists()
              ? String(
                  (s.data() as any).namaPeriode ??
                    (s.data() as any).nama ??
                    (s.data() as any).name ??
                    pid
                )
              : pid;

            return [pid, nama] as const;
          })
        ),
        Promise.all(
          karyawanIds.map(async (kid) => {
            const s = await getDoc(doc(db, 'karyawan', kid));
            const nama = s.exists() ? String((s.data() as any).nama ?? '-') : '-';
            return [kid, nama] as const;
          })
        ),
      ]);

      const periodeMap = new Map<string, string>(periodePairs);
      const karyawanMap = new Map<string, string>(karyawanPairs);

      const rows: PenilaianRow[] = latestBase.map((x) => {
        const pid = x.periodeId || '-';
        const kid = x.karyawanId || '-';

        return {
          id: x.id,
          periodeId: pid,
          namaPeriode: periodeMap.get(pid) ?? pid,
          karyawanId: kid,
          namaKaryawan: karyawanMap.get(kid) ?? '-',
          status: x.status,
        };
      });

      setLatestAssessments(rows);
    } catch (error) {
      console.error(error);
      setPeriodeAktif(null);
      setJumlahDinilai(0);
      setJumlahPerluEvaluasi(0);
      setLatestAssessments([]);
      setPeriodeMsg('Gagal memuat dashboard. Coba refresh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleTutupPeriode = async () => {
    setPeriodeMsg('');

    if (!periodeAktif?.id) {
      setPeriodeMsg('Tidak ada periode aktif untuk ditutup.');
      setTimeout(() => setPeriodeMsg(''), 2500);
      return;
    }

    setMenutupPeriode(true);

    try {
      await updateDoc(doc(db, 'periode_penilaian', periodeAktif.id), {
        status: 'ditutup',
        updatedAt: serverTimestamp(),
      });

      setPeriodeMsg('Periode berhasil ditutup.');
      await loadDashboard();
    } catch (error) {
      console.error(error);
      setPeriodeMsg('Gagal menutup periode. Periksa permission Firestore Rules.');
    } finally {
      setMenutupPeriode(false);
      setTimeout(() => setPeriodeMsg(''), 2500);
    }
  };

  const handleModalClose = async () => {
    setIsModalOpen(false);
    await loadDashboard();
  };

  const periodeAktifNama = periodeAktif?.namaPeriode ?? '-';
  const periodeAktifDurasi = useMemo(() => {
    if (!periodeAktif) return '-';
    return formatRentang(periodeAktif.mulai, periodeAktif.selesai);
  }, [periodeAktif]);

  return (
    <div className="ml-80 mt-28 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700"
        >
          Buat dan edit kriteria formulir penilaian
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-gray-900">
            Manajemen Periode
          </h3>

          <div className="mb-6 space-y-4">
            <div>
              <p className="text-sm text-gray-600">Periode Aktif</p>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? 'Memuat...' : periodeAktifNama}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Status</p>
              <StatusBadge status={periodeAktif ? 'aktif' : 'ditutup'} />
            </div>

            <div>
              <p className="text-sm text-gray-600">Durasi</p>
              <p className="font-medium text-gray-900">
                {loading ? '...' : periodeAktifDurasi}
              </p>
            </div>
          </div>

          <button
            onClick={handleTutupPeriode}
            disabled={menutupPeriode || loading}
            className="w-full rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {menutupPeriode ? 'Menutup...' : 'Tutup Periode'}
          </button>

          {periodeMsg && <p className="mt-3 text-sm text-gray-700">{periodeMsg}</p>}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-gray-900">
            Laporan penilaian
          </h3>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Penilaian selesai</p>
              <p className="text-4xl font-bold text-gray-900">
                {loading ? '...' : jumlahDinilai}
              </p>
            </div>

            <Link
              href="/admin/laporan"
              className="inline-block font-medium text-blue-600 hover:text-blue-800"
            >
              Lihat semua &gt;
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-gray-900">
            Evaluasi Penilaian
          </h3>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Perlu di evaluasi</p>
              <p className="text-4xl font-bold text-gray-900">
                {loading ? '...' : jumlahPerluEvaluasi}
              </p>
            </div>

            <Link
              href="/admin/penilaian-kinerja"
              className="inline-block font-medium text-blue-600 hover:text-blue-800"
            >
              Lihat semua &gt;
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-6 text-xl font-semibold text-gray-900">
          Penilaian Kinerja Terbaru
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="px-6 py-3 text-left font-semibold text-gray-900">No</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Periode
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Nama Karyawan
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Status Penilaian
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Aksi
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr className="border-b border-gray-200">
                  <td className="px-6 py-4 text-gray-700" colSpan={5}>
                    Memuat data...
                  </td>
                </tr>
              ) : latestAssessments.length === 0 ? (
                <tr className="border-b border-gray-200">
                  <td className="px-6 py-4 text-gray-700" colSpan={5}>
                    Belum ada data penilaian.
                  </td>
                </tr>
              ) : (
                latestAssessments.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 text-gray-900">{idx + 1}</td>
                    <td className="px-6 py-4 text-gray-900">{item.namaPeriode}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {item.namaKaryawan}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/penilaian-kinerja/${item.id}/evaluasi`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        Evaluasi
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PeriodModal isOpen={isModalOpen} onClose={handleModalClose} />
    </div>
  );
}