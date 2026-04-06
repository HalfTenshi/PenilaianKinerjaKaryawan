'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { CardSection } from '@/components/CardSection';

type PeriodePenilaianDoc = {
  namaPeriode: string;
  status: 'aktif' | 'ditutup';

  mulai?: any;
  startDate?: any;
  tanggalMulai?: any;
  awal?: any;

  selesai?: any;
  endDate?: any;
  tanggalSelesai?: any;
  akhir?: any;
};

type KriteriaPenilaianDoc = {
  periodeId: string;
  namaKriteria: string;
  bobot: number;
  urutan: number;
};

type PenilaianKinerjaDoc = {
  periodeId: string;
  karyawanId: string;
  status: 'draft' | 'dikirim' | 'dinilai';

  nilaiKaryawan: Record<string, number>;
  catatanKaryawan?: string;

  nilaiAdmin?: Record<string, number>;
  catatanAdmin?: string;

  totalNilai?: number;

  createdAt?: any;
  updatedAt?: any;
};

function toDateSafe(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function getTanggalMulai(periode?: PeriodePenilaianDoc | null) {
  return (
    periode?.mulai ??
    periode?.startDate ??
    periode?.tanggalMulai ??
    periode?.awal ??
    null
  );
}

function getTanggalSelesai(periode?: PeriodePenilaianDoc | null) {
  return (
    periode?.selesai ??
    periode?.endDate ??
    periode?.tanggalSelesai ??
    periode?.akhir ??
    null
  );
}

function formatTanggalRange(periode?: PeriodePenilaianDoc | null) {
  try {
    const s = toDateSafe(getTanggalMulai(periode));
    const e = toDateSafe(getTanggalSelesai(periode));

    if (!s || !e) return '-';

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(d);

    return `${fmt(s)} - ${fmt(e)}`;
  } catch {
    return '-';
  }
}

function clampNilai(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 5) return 5;
  return n;
}

function sanitizeNilaiMap(nilai?: Record<string, number>) {
  const result: Record<string, number> = {};

  if (!nilai || typeof nilai !== 'object') return result;

  for (const [key, value] of Object.entries(nilai)) {
    result[key] = clampNilai(value);
  }

  return result;
}

/** total = Σ ( (nilai/5) * 100 * (bobot/100) ) */
function hitungTotalBerbobot(params: {
  nilai: Record<string, number>;
  kriteria: Array<{ id: string; data: KriteriaPenilaianDoc }>;
}) {
  const { nilai, kriteria } = params;
  if (!kriteria.length) return 0;

  let total = 0;
  for (const item of kriteria) {
    const skor = clampNilai(nilai[item.id] ?? 0);
    const bobot = Number(item.data.bobot ?? 0);
    total += ((skor / 5) * 100) * (bobot / 100);
  }

  return Math.round(total * 100) / 100;
}

export default function IsiPenilaianPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const karyawanId = user?.karyawanId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  const [periodeAktif, setPeriodeAktif] = useState<{ id: string; data: PeriodePenilaianDoc } | null>(
    null
  );
  const [kriteria, setKriteria] = useState<Array<{ id: string; data: KriteriaPenilaianDoc }>>([]);

  const [nilaiKaryawan, setNilaiKaryawan] = useState<Record<string, number>>({});
  const [catatanKaryawan, setCatatanKaryawan] = useState('');
  const [statusPenilaian, setStatusPenilaian] = useState<'draft' | 'dikirim' | 'dinilai'>('draft');

  const penilaianId = useMemo(() => {
    if (!karyawanId || !periodeAktif?.id) return null;
    return `${karyawanId}_${periodeAktif.id}`;
  }, [karyawanId, periodeAktif?.id]);

  const totalNilaiSementara = useMemo(() => {
    return hitungTotalBerbobot({
      nilai: sanitizeNilaiMap(nilaiKaryawan),
      kriteria,
    });
  }, [nilaiKaryawan, kriteria]);

  useEffect(() => {
    if (authLoading) return;

    if (!karyawanId) {
      setLoading(false);
      return;
    }

    async function loadAll() {
      setLoading(true);
      setError('');

      try {
        const snapPeriode = await getDocs(
          query(collection(db, 'periode_penilaian'), where('status', '==', 'aktif'), limit(10))
        );

        if (snapPeriode.empty) {
          setPeriodeAktif(null);
          setKriteria([]);
          setNilaiKaryawan({});
          setCatatanKaryawan('');
          setStatusPenilaian('draft');
          setLoading(false);
          return;
        }

        const periodeList = snapPeriode.docs
          .map((d) => ({
            id: d.id,
            data: d.data() as PeriodePenilaianDoc,
          }))
          .sort((a, b) => {
            const aDate = toDateSafe(getTanggalMulai(a.data)) ?? new Date(0);
            const bDate = toDateSafe(getTanggalMulai(b.data)) ?? new Date(0);
            return bDate.getTime() - aDate.getTime();
          });

        const periode = periodeList[0] ?? null;

        if (!periode) {
          setPeriodeAktif(null);
          setKriteria([]);
          setNilaiKaryawan({});
          setCatatanKaryawan('');
          setStatusPenilaian('draft');
          setLoading(false);
          return;
        }

        setPeriodeAktif(periode);

        const snapKriteria = await getDocs(
          query(collection(db, 'kriteria_penilaian'), where('periodeId', '==', periode.id))
        );

        const kriteriaList = snapKriteria.docs
          .map((d) => ({
            id: d.id,
            data: d.data() as KriteriaPenilaianDoc,
          }))
          .sort((a, b) => (a.data.urutan ?? 0) - (b.data.urutan ?? 0));

        setKriteria(kriteriaList);

        const refPenilaian = doc(db, 'penilaian_kinerja', `${karyawanId}_${periode.id}`);
        const snapPenilaian = await getDoc(refPenilaian);

        if (snapPenilaian.exists()) {
          const data = snapPenilaian.data() as PenilaianKinerjaDoc;
          setNilaiKaryawan(sanitizeNilaiMap(data.nilaiKaryawan ?? {}));
          setCatatanKaryawan(data.catatanKaryawan ?? '');
          setStatusPenilaian(data.status ?? 'draft');
        } else {
          setNilaiKaryawan({});
          setCatatanKaryawan('');
          setStatusPenilaian('draft');
        }

        setLoading(false);
      } catch (e: any) {
        console.error(e);
        const msg = e?.code
          ? `Gagal memuat data penilaian (${e.code}). ${e?.message ?? ''}`
          : 'Gagal memuat data penilaian. Coba refresh halaman.';
        setError(msg);
        setLoading(false);
      }
    }

    loadAll();
  }, [authLoading, karyawanId]);

  const handleRatingChange = (kriteriaId: string, rating: number) => {
    if (statusPenilaian !== 'draft') return;

    const safeRating = Math.max(1, Math.min(5, rating));
    setNilaiKaryawan((prev) => ({
      ...prev,
      [kriteriaId]: safeRating,
    }));
  };

  const handleSimpanDraft = async () => {
    if (!karyawanId) return;
    if (!periodeAktif?.id) return alert('Tidak ada periode aktif.');
    if (!penilaianId) return;

    setSaving(true);
    setError('');

    try {
      const ref = doc(db, 'penilaian_kinerja', penilaianId);
      const existing = await getDoc(ref);

      const payload: any = {
        id: penilaianId,
        periodeId: periodeAktif.id,
        karyawanId,
        status: 'draft',
        nilaiKaryawan: sanitizeNilaiMap(nilaiKaryawan),
        catatanKaryawan: catatanKaryawan ?? '',
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(ref, payload, { merge: true });

      alert('Draft berhasil disimpan.');
      setStatusPenilaian('draft');
    } catch (e: any) {
      console.error(e);
      const msg = e?.code
        ? `Gagal menyimpan draft (${e.code}). ${e?.message ?? ''}`
        : 'Gagal menyimpan draft. Periksa koneksi atau rules Firestore.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleKirimPenilaian = async () => {
    if (!karyawanId) return;
    if (!periodeAktif?.id) return alert('Tidak ada periode aktif.');
    if (!penilaianId) return;

    const totalKriteria = kriteria.length;
    const terisi = Object.keys(sanitizeNilaiMap(nilaiKaryawan)).length;

    if (totalKriteria > 0 && terisi < totalKriteria) {
      alert(`Masih ada kriteria yang belum diisi. Terisi ${terisi}/${totalKriteria}.`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const ref = doc(db, 'penilaian_kinerja', penilaianId);
      const existing = await getDoc(ref);

      const payload: any = {
        id: penilaianId,
        periodeId: periodeAktif.id,
        karyawanId,
        status: 'dikirim',
        nilaiKaryawan: sanitizeNilaiMap(nilaiKaryawan),
        catatanKaryawan: catatanKaryawan ?? '',
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(ref, payload, { merge: true });

      alert('Penilaian berhasil dikirim.');
      setStatusPenilaian('dikirim');
      router.push('/karyawan/riwayat');
    } catch (e: any) {
      console.error(e);
      const msg = e?.code
        ? `Gagal mengirim penilaian (${e.code}). ${e?.message ?? ''}`
        : 'Gagal mengirim penilaian. Periksa koneksi atau rules Firestore.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Isi Penilaian</h1>
        <CardSection>
          <p className="text-gray-600">Memuat data...</p>
        </CardSection>
      </div>
    );
  }

  if (!karyawanId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Isi Penilaian</h1>
        <CardSection>
          <p className="text-gray-700">Silakan login terlebih dahulu.</p>
        </CardSection>
      </div>
    );
  }

  const periodeRange = periodeAktif ? formatTanggalRange(periodeAktif.data) : '-';
  const isReadOnly = statusPenilaian !== 'draft';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Isi Penilaian</h1>
      </div>

      {error && (
        <CardSection>
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        </CardSection>
      )}

      <CardSection title="Periode aktif">
        {periodeAktif ? (
          <div className="space-y-1">
            <p className="text-lg font-semibold text-gray-900">{periodeAktif.data.namaPeriode}</p>
            <p className="text-sm text-gray-600">{periodeRange}</p>
            {isReadOnly && (
              <p className="text-sm text-gray-600">
                Status penilaian: <span className="font-semibold">{statusPenilaian}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Tidak ada periode aktif</p>
        )}
      </CardSection>

      <CardSection>
        <p className="text-gray-700">Silahkan isi nilai penilaian kerja anda pada periode ini :</p>
      </CardSection>

      <CardSection>
        <p className="text-sm text-gray-600">Total Nilai Sementara</p>
        <p className="text-2xl font-bold text-blue-700">{totalNilaiSementara.toFixed(2)}</p>
        <p className="text-xs text-gray-500 mt-1">
          Nilai ini hanya untuk preview perhitungan dari input karyawan, tidak disimpan sebagai field cache lama.
        </p>
      </CardSection>

      <CardSection title="Kriteria Penilaian">
        {kriteria.length === 0 ? (
          <p className="text-gray-500">Kriteria belum diatur untuk periode ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 bg-gray-50">
                    Kriteria Penilaian
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 bg-gray-50">Bobot</th>
                  <th colSpan={5} className="px-4 py-3 text-center font-semibold text-gray-700 bg-gray-50">
                    Nilai Karyawan
                  </th>
                </tr>
                <tr className="border-b border-gray-200">
                  <th></th>
                  <th></th>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <th key={num} className="px-3 py-2 text-center font-semibold text-gray-600 text-sm">
                      {num}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {kriteria.map((item) => (
                  <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-4 text-gray-900 font-medium">{item.data.namaKriteria}</td>
                    <td className="px-4 py-4 text-gray-700">{item.data.bobot}%</td>

                    {[1, 2, 3, 4, 5].map((rating) => (
                      <td key={rating} className="px-3 py-4 text-center">
                        <label className="flex justify-center">
                          <input
                            type="radio"
                            name={`rating-${item.id}`}
                            value={rating}
                            checked={nilaiKaryawan[item.id] === rating}
                            onChange={() => handleRatingChange(item.id, rating)}
                            className="w-4 h-4 cursor-pointer"
                            disabled={isReadOnly}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardSection>

      <CardSection>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            (Opsional) Masukkan catatan di sini
          </label>
          <textarea
            value={catatanKaryawan}
            onChange={(e) => setCatatanKaryawan(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={5}
            placeholder="Masukkan catatan Anda di sini..."
            disabled={isReadOnly}
          />
        </div>
      </CardSection>

      <div className="flex justify-end gap-3">
        <button
          onClick={handleSimpanDraft}
          disabled={saving || !periodeAktif || isReadOnly}
          className="px-8 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan Draft'}
        </button>

        <button
          onClick={handleKirimPenilaian}
          disabled={saving || !periodeAktif || isReadOnly || kriteria.length === 0}
          className="px-8 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-60"
        >
          {saving ? 'Memproses...' : 'Kirim Penilaian'}
        </button>
      </div>
    </div>
  );
}