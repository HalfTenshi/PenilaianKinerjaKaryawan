'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  getPenilaianByDocId,
  getKaryawanById,
  getPeriodeById,
  getKriteriaByPeriode,
  getAttendanceSummary,
  hitungNilaiAkhir,
  submitEvaluasiAdmin,
  type KriteriaPenilaian,
  type PenilaianKinerja,
  type Karyawan,
  type PeriodePenilaian,
} from '@/lib/firebase/adminPenilaianKinerja';

function toNumberSafe(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function EvaluasiPage() {
  const params = useParams();
  const router = useRouter();
  const penilaianId = String(params?.id ?? '');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [penilaian, setPenilaian] = useState<PenilaianKinerja | null>(null);
  const [karyawan, setKaryawan] = useState<Karyawan | null>(null);
  const [periode, setPeriode] = useState<PeriodePenilaian | null>(null);
  const [kriteria, setKriteria] = useState<KriteriaPenilaian[]>([]);

  // form state (admin)
  const [nilaiAdmin, setNilaiAdmin] = useState<Record<string, number>>({});
  const [catatan, setCatatan] = useState('');

  // attendance summary
  const [hadirHari, setHadirHari] = useState(0);
  const [hadirPersen, setHadirPersen] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const p = await getPenilaianByDocId(penilaianId);
        if (!p) throw new Error('Data penilaian tidak ditemukan.');

        const k = await getKaryawanById(p.karyawanId);
        const per = await getPeriodeById(p.periodeId);
        if (!per) throw new Error('Periode penilaian tidak ditemukan.');

        const kri = await getKriteriaByPeriode(p.periodeId);

        if (!mounted) return;

        setPenilaian(p);
        setKaryawan(k);
        setPeriode(per);
        setKriteria(kri);

        // init form
        setNilaiAdmin(p.nilaiAdmin ?? {});
        setCatatan(p.catatanAdmin ?? '');

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
        setError(e?.message ?? 'Gagal memuat data evaluasi.');
        setLoading(false);
      }
    }

    if (penilaianId) load();

    return () => {
      mounted = false;
    };
  }, [penilaianId]);

  const criteriaRows = useMemo(() => {
    return kriteria.map((kr) => {
      const nilaiKaryawan = penilaian?.nilaiKaryawan?.[kr.id];
      const nilaiAdminExisting = nilaiAdmin?.[kr.id];

      return {
        id: kr.id,
        name: kr.namaKriteria,
        weight: `${kr.bobot}%`,
        nilaiKaryawan: typeof nilaiKaryawan === 'number' ? nilaiKaryawan : null,
        nilaiAdmin: typeof nilaiAdminExisting === 'number' ? nilaiAdminExisting : 0,
      };
    });
  }, [kriteria, nilaiAdmin, penilaian?.nilaiKaryawan]);

  // ✅ total nilai karyawan (berbobot) realtime
  const totalNilaiKaryawan = useMemo(() => {
    return hitungNilaiAkhir({ nilai: penilaian?.nilaiKaryawan, kriteria });
  }, [penilaian?.nilaiKaryawan, kriteria]);

  // ✅ total nilai admin (berbobot) realtime
  const totalNilaiAdmin = useMemo(() => {
    return hitungNilaiAkhir({ nilai: nilaiAdmin, kriteria });
  }, [nilaiAdmin, kriteria]);

  const handleUpdateNilaiAdmin = (kriteriaId: string, value: string) => {
    const n = toNumberSafe(value);
    const clamped = Math.max(0, Math.min(5, n));
    setNilaiAdmin((prev) => ({ ...prev, [kriteriaId]: clamped }));
  };

  const handleSubmit = async () => {
    if (!penilaian) return;

    setIsSubmitting(true);
    try {
      await submitEvaluasiAdmin({
        penilaianId,
        nilaiAdmin,
        catatanAdmin: catatan,
        totalNilaiAdmin: toNumberSafe(totalNilaiAdmin), // ✅ aman (bukan undefined)
        totalNilaiKaryawan: toNumberSafe(totalNilaiKaryawan), // ✅ opsional cache biar sinkron
      });

      alert('Evaluasi berhasil disimpan!');
      router.push('/admin/penilaian-kinerja');
    } catch (error: any) {
      alert(error?.message ?? 'Gagal menyimpan evaluasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 ml-80 mt-28">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-sm">
          Memuat data evaluasi...
        </div>
      </div>
    );
  }

  if (error || !penilaian || !periode) {
    return (
      <div className="space-y-6 ml-80 mt-28">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-sm text-red-600">
          {error ?? 'Data tidak valid.'}
        </div>
        <Link href="/admin/penilaian-kinerja" className="text-blue-600 hover:text-blue-800 font-medium">
          Kembali
        </Link>
      </div>
    );
  }

  const catatanKaryawanText =
    (penilaian as any)?.catatanKaryawan && String((penilaian as any).catatanKaryawan).trim()
      ? String((penilaian as any).catatanKaryawan)
      : 'Tidak ada catatan dari karyawan.';

  return (
    <div className="space-y-6 ml-80 mt-28">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-blue-700 font-medium">
        <Link href="/admin/penilaian-kinerja" className="hover:text-blue-900">
          Penilaian Kinerja
        </Link>
        <ChevronRight size={16} />
        <span>Evaluasi</span>
      </div>

      {/* Page Title */}
      <div>
        <h1 className="text-4xl font-bold text-blue-900">Evaluasi Penilaian Kerja</h1>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex gap-8">
          {/* Photo */}
          <div className="flex-shrink-0">
            <div className="w-40 h-44 bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Desktop%20-%205-pdNnY1TEg5DVN9QP6i8QE6w2hXd86R.png"
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

          {/* Score Card Admin */}
          <div className="bg-blue-50 rounded-lg p-6 w-72 flex flex-col gap-6 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-sm text-gray-600">Nilai Akhir (Admin)</p>
              </div>
            </div>
            <div className="text-4xl font-bold text-blue-900">{totalNilaiAdmin}</div>

            <div className="border-t border-blue-200 pt-4">
              <p className="text-sm text-gray-700 mb-2">Hadir : {hadirHari} Hari</p>
              <p className="text-2xl font-bold text-green-700">{hadirPersen}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Card tambahan nyambung style */}
      <div className="grid grid-cols-2 gap-6">
        {/* Total nilai karyawan */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-900">Ringkasan Karyawan</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100">
              Nilai Karyawan
            </span>
          </div>

          <p className="text-sm text-gray-600">Total Nilai (berbobot)</p>
          <p className="text-4xl font-bold text-blue-900 mt-1">{totalNilaiKaryawan}</p>
          <p className="text-xs text-gray-500 mt-2">
            Diambil dari <b>nilaiKaryawan</b> per-kriteria (0..5) × bobot (%).
          </p>
        </div>

        {/* Catatan karyawan */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-900">Catatan Karyawan</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
              Read-only
            </span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[120px]">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{catatanKaryawanText}</p>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Field yang dibaca: <b>catatanKaryawan</b> pada dokumen <b>penilaian_kinerja</b>.
          </p>
        </div>
      </div>

      {/* Hasil Penilaian Kriteria */}
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

                  <td className="px-6 py-4 text-center">
                    <input
                      type="number"
                      value={String(item.nilaiAdmin)}
                      onChange={(e) => handleUpdateNilaiAdmin(item.id, e.target.value)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 text-center"
                      min="0"
                      max="5"
                      step="0.5"
                    />
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

        {/* Catatan Admin */}
        <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
          <h4 className="font-semibold text-blue-900">Catatan Admin</h4>
          <textarea
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 min-h-[120px]"
            placeholder="Tambahkan catatan evaluasi..."
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
          />
        </div>

        {/* Total Nilai Admin */}
        <div className="mt-6 pt-6 bg-blue-50 rounded-lg p-6 flex justify-center">
          <div className="text-center">
            <p className="text-blue-700 font-medium mb-2">Total Nilai Admin :</p>
            <p className="text-4xl font-bold text-blue-900">{totalNilaiAdmin}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Link
          href="/admin/penilaian-kinerja"
          className="px-8 py-2.5 border border-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-100 transition"
        >
          Batal
        </Link>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-8 py-2.5 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Menyimpan...' : 'Submit Evaluasi'}
        </button>
      </div>
    </div>
  );
}