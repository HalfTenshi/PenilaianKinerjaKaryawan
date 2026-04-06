// src/app/karyawan/riwayat/[periodeId]/detail/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';

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
} from '@/lib/firebase/adminPenilaianKinerja';

import { useAuth } from '@/context/AuthContext';

function toNumberSafe(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function format2(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export default function DetailPenilaianKaryawanPage() {
  const params = useParams();
  const { user } = useAuth();

  const uid = user?.uid;
  const karyawanId = user?.karyawanId || uid;

  // handle dua kemungkinan param: [periodeId] atau [periode]
  const periodeId = String((params as any)?.periodeId || (params as any)?.periode || '');

  // doc id final: `${karyawanId}_${periodeId}`
  const penilaianId = karyawanId && periodeId ? `${karyawanId}_${periodeId}` : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [penilaian, setPenilaian] = useState<PenilaianKinerja | null>(null);
  const [karyawan, setKaryawan] = useState<Karyawan | null>(null);
  const [periode, setPeriode] = useState<PeriodePenilaian | null>(null);
  const [kriteria, setKriteria] = useState<KriteriaPenilaian[]>([]);

  // attendance summary
  const [hadirHari, setHadirHari] = useState(0);
  const [hadirPersen, setHadirPersen] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (!penilaianId || !periodeId || !karyawanId) {
          throw new Error('Parameter tidak lengkap.');
        }

        const p = await getPenilaianByDocId(penilaianId);
        if (!p) throw new Error('Data penilaian tidak ditemukan.');

        // ✅ karyawan hanya boleh lihat penilaiannya sendiri
        if (p.karyawanId !== karyawanId) {
          throw new Error('Akses ditolak.');
        }

        const k = await getKaryawanById(p.karyawanId);
        const per = await getPeriodeById(p.periodeId);
        if (!per) throw new Error('Periode penilaian tidak ditemukan.');

        const kri = await getKriteriaByPeriode(p.periodeId);

        if (!mounted) return;

        setPenilaian(p);
        setKaryawan(k);
        setPeriode(per);
        setKriteria(kri);

        // attendance summary
        try {
          const sum = await getAttendanceSummary({
            karyawanId: p.karyawanId,
            mulai: per.mulai,
            selesai: per.selesai,
          });
          if (!mounted) return;
          setHadirHari(sum.hadirHari);
          setHadirPersen(sum.hadirPersen);
        } catch (e: any) {
          console.warn('Attendance query warning:', e?.message);
          if (!mounted) return;
          setHadirHari(0);
          setHadirPersen(0);
        }

        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Gagal memuat detail penilaian.');
        setLoading(false);
      }
    }

    if (uid && karyawanId && periodeId) load();

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
        nilaiKaryawan: typeof nilaiKaryawan === 'number' ? nilaiKaryawan : null,
        nilaiAdmin: typeof nilaiAdmin === 'number' ? nilaiAdmin : null,
      };
    });
  }, [kriteria, penilaian?.nilaiKaryawan, penilaian?.nilaiAdmin]);

  // total nilai karyawan (berbobot)
  const totalNilaiKaryawan = useMemo(() => {
    return hitungNilaiAkhir({ nilai: penilaian?.nilaiKaryawan, kriteria });
  }, [penilaian?.nilaiKaryawan, kriteria]);

  // total nilai admin (berbobot) -> hasil akhir yang ditampilkan ke karyawan
  const totalNilaiAdmin = useMemo(() => {
    return hitungNilaiAkhir({ nilai: penilaian?.nilaiAdmin, kriteria });
  }, [penilaian?.nilaiAdmin, kriteria]);

  const catatanKaryawanText =
    (penilaian as any)?.catatanKaryawan && String((penilaian as any).catatanKaryawan).trim()
      ? String((penilaian as any).catatanKaryawan)
      : 'Tidak ada catatan dari karyawan.';

  const catatanAdminText =
    (penilaian as any)?.catatanAdmin && String((penilaian as any).catatanAdmin).trim()
      ? String((penilaian as any).catatanAdmin)
      : 'Belum ada catatan dari admin.';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-sm">
          Memuat detail penilaian...
        </div>
      </div>
    );
  }

  if (error || !penilaian || !periode) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-sm text-red-600">
          {error ?? 'Data tidak valid.'}
        </div>
        <Link href="/karyawan/riwayat" className="text-blue-600 hover:text-blue-800 font-medium">
          Kembali
        </Link>
      </div>
    );
  }

  const foto = (user as any)?.fotoProfilUrl
    ? String((user as any).fotoProfilUrl)
    : 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Desktop%20-%205-pdNnY1TEg5DVN9QP6i8QE6w2hXd86R.png';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-blue-700 font-medium">
        <Link href="/karyawan/riwayat" className="hover:text-blue-900">
          Riwayat Penilaian
        </Link>
        <ChevronRight size={16} />
        <span>Detail penilaian</span>
      </div>

      {/* Page Title */}
      <div>
        <h1 className="text-4xl font-bold text-blue-900">Detail Penilaian</h1>
      </div>

      {/* Profile Card (style sama evaluasi admin) */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex gap-8">
          {/* Photo */}
          <div className="flex-shrink-0">
            <div className="w-40 h-44 bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
              <Image
                src={foto}
                alt={karyawan?.nama ?? 'Karyawan'}
                width={160}
                height={176}
                className="w-full h-full object-cover"
                loading="eager"
                priority
              />
            </div>
          </div>

          {/* Employee Info */}
          <div className="flex-1 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-blue-900">{karyawan?.nama ?? penilaian.karyawanId}</h2>
              <p className="text-blue-600 font-medium">{karyawan?.jabatan ?? '-'}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center">
                <span className="text-blue-700 font-medium w-32">NIP</span>
                <span className="text-gray-500 mx-2">:</span>
                <span className="text-gray-700">{karyawan?.nip ?? '-'}</span>
              </div>
              <div className="flex items-center">
                <span className="text-blue-700 font-medium w-32">Bagian</span>
                <span className="text-gray-500 mx-2">:</span>
                <span className="text-gray-700">{karyawan?.bagian ?? '-'}</span>
              </div>
              <div className="flex items-center">
                <span className="text-blue-700 font-medium w-32">Periode Penilaian</span>
                <span className="text-gray-500 mx-2">:</span>
                <span className="text-gray-700">{periode.namaPeriode}</span>
              </div>
            </div>
          </div>

          {/* Score Card (hasil akhir admin) */}
          <div className="bg-blue-50 rounded-lg p-6 w-72 flex flex-col gap-6 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-sm text-gray-600">Nilai Akhir</p>
              </div>
            </div>

            <div className="text-4xl font-bold text-blue-900">{format2(toNumberSafe(totalNilaiAdmin))}</div>

            <div className="border-t border-blue-200 pt-4">
              <p className="text-sm text-gray-700 mb-2">Hadir : {hadirHari} Hari</p>
              <p className="text-2xl font-bold text-green-700">{hadirPersen}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Card tambahan (read-only) */}
      <div className="grid grid-cols-2 gap-6">
        {/* Ringkasan Karyawan */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-900">Ringkasan Karyawan</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100">
              Nilai Karyawan
            </span>
          </div>

          <p className="text-sm text-gray-600">Total Nilai (berbobot)</p>
          <p className="text-4xl font-bold text-blue-900 mt-1">{format2(toNumberSafe(totalNilaiKaryawan))}</p>

          <div className="mt-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">Catatan Karyawan</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[120px]">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{catatanKaryawanText}</p>
            </div>
          </div>
        </div>

        {/* Catatan Admin (read-only) */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-900">Catatan Admin</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
              Read-only
            </span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[180px]">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{catatanAdminText}</p>
          </div>
        </div>
      </div>

      {/* Hasil Penilaian Kriteria (read-only) */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="border-b border-gray-300 pb-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-900">Hasil Penilaian Kriteria</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-6 py-3 text-left font-semibold text-blue-900">Kriteria Penilaian</th>
                <th className="px-6 py-3 text-left font-semibold text-blue-900">Bobot</th>
                <th className="px-6 py-3 text-center font-semibold text-blue-900">Nilai Karyawan</th>
                <th className="px-6 py-3 text-center font-semibold text-blue-900">Nilai Admin</th>
              </tr>
            </thead>
            <tbody>
              {criteriaRows.map((item) => (
                <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4 text-blue-700 font-medium">{item.name}</td>
                  <td className="px-6 py-4 text-gray-700">{item.weight}</td>
                  <td className="px-6 py-4 text-center text-gray-700">
                    {item.nilaiKaryawan === null ? '-' : item.nilaiKaryawan}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-700">
                    {item.nilaiAdmin === null ? '-' : item.nilaiAdmin}
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

        {/* Total Nilai Admin */}
        <div className="mt-6 pt-6 bg-blue-50 rounded-lg p-6 flex justify-center">
          <div className="text-center">
            <p className="text-blue-700 font-medium mb-2">Total Nilai Akhir :</p>
            <p className="text-4xl font-bold text-blue-900">{format2(toNumberSafe(totalNilaiAdmin))}</p>
          </div>
        </div>
      </div>

      {/* Back */}
      <div className="flex justify-end">
        <Link
          href="/karyawan/riwayat"
          className="px-8 py-2.5 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 transition"
        >
          Kembali
        </Link>
      </div>
    </div>
  );
}