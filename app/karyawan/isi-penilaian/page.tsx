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
  mulai?: any;
  selesai?: any;
  status: 'aktif' | 'ditutup';
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

  nilaiKaryawan: Record<string, number>; // key = kriteriaId
  catatanKaryawan: string;

  // ✅ simpan total berbobot biar sinkron
  totalNilaiKaryawan?: number;

  nilaiAdmin?: Record<string, number>;
  catatanAdmin?: string;
  totalNilaiAdmin?: number;

  createdAt?: any;
  updatedAt?: any;
};

function formatTanggalRange(mulai: any, selesai: any) {
  try {
    const s = mulai?.toDate ? mulai.toDate() : mulai instanceof Date ? mulai : null;
    const e = selesai?.toDate ? selesai.toDate() : selesai instanceof Date ? selesai : null;
    if (!s || !e) return '-';

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);

    return `${fmt(s)} - ${fmt(e)}`;
  } catch {
    return '-';
  }
}

/** ✅ hitung total berbobot dari nilai (0..5) & kriteria bobot% */
function hitungTotalBerbobot(params: {
  nilai: Record<string, number>;
  kriteria: Array<{ id: string; data: KriteriaPenilaianDoc }>;
}) {
  const { nilai, kriteria } = params;
  if (!kriteria.length) return 0;

  let total = 0;
  for (const k of kriteria) {
    const v = typeof nilai[k.id] === 'number' ? nilai[k.id] : 0; // 0..5
    const bobot = typeof k.data.bobot === 'number' ? k.data.bobot : 0; // %
    total += (v / 5) * 100 * (bobot / 100);
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

  // ✅ total karyawan realtime untuk ditampilkan (optional)
  const totalNilaiKaryawan = useMemo(() => {
    return hitungTotalBerbobot({ nilai: nilaiKaryawan || {}, kriteria });
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
          query(collection(db, 'periode_penilaian'), where('status', '==', 'aktif'), limit(1))
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

        const pDoc = snapPeriode.docs[0];
        const pData = pDoc.data() as PeriodePenilaianDoc;

        const periode = { id: pDoc.id, data: pData };
        setPeriodeAktif(periode);

        const snapKriteria = await getDocs(
          query(collection(db, 'kriteria_penilaian'), where('periodeId', '==', pDoc.id))
        );

        const kriteriaList = snapKriteria.docs
          .map((d) => ({
            id: d.id,
            data: d.data() as KriteriaPenilaianDoc,
          }))
          .sort((a, b) => (a.data.urutan ?? 0) - (b.data.urutan ?? 0));

        setKriteria(kriteriaList);

        const idPenilaian = `${karyawanId}_${pDoc.id}`;
        const refPenilaian = doc(db, 'penilaian_kinerja', idPenilaian);
        const snapPenilaian = await getDoc(refPenilaian);

        if (snapPenilaian.exists()) {
          const data = snapPenilaian.data() as PenilaianKinerjaDoc;
          setNilaiKaryawan(data.nilaiKaryawan || {});
          setCatatanKaryawan(data.catatanKaryawan || '');
          setStatusPenilaian(data.status || 'draft');
        } else {
          setNilaiKaryawan({});
          setCatatanKaryawan('');
          setStatusPenilaian('draft');
        }

        setLoading(false);
      } catch (e: any) {
        console.error(e);
        const msg =
          e?.code
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
    setNilaiKaryawan((prev) => ({ ...prev, [kriteriaId]: rating }));
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

      const total = hitungTotalBerbobot({ nilai: nilaiKaryawan || {}, kriteria });

      const payload: Partial<PenilaianKinerjaDoc> = {
        periodeId: periodeAktif.id,
        karyawanId,
        status: 'draft',
        nilaiKaryawan: nilaiKaryawan || {},
        catatanKaryawan: catatanKaryawan || '',
        totalNilaiKaryawan: total, // ✅ simpan
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(ref, payload, { merge: true });

      alert('Draft berhasil disimpan.');
      setStatusPenilaian('draft');
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.code
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
    const terisi = Object.keys(nilaiKaryawan || {}).length;

    if (totalKriteria > 0 && terisi < totalKriteria) {
      alert(`Masih ada kriteria yang belum diisi. Terisi ${terisi}/${totalKriteria}.`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const ref = doc(db, 'penilaian_kinerja', penilaianId);
      const existing = await getDoc(ref);

      const total = hitungTotalBerbobot({ nilai: nilaiKaryawan || {}, kriteria });

      const payload: Partial<PenilaianKinerjaDoc> = {
        periodeId: periodeAktif.id,
        karyawanId,
        status: 'dikirim',
        nilaiKaryawan: nilaiKaryawan || {},
        catatanKaryawan: catatanKaryawan || '',
        totalNilaiKaryawan: total, // ✅ simpan
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(ref, payload, { merge: true });

      alert('Penilaian berhasil dikirim.');
      setStatusPenilaian('dikirim');
      router.push('/karyawan/riwayat');
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.code
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

  const periodeRange = periodeAktif
    ? formatTanggalRange(periodeAktif.data.mulai, periodeAktif.data.selesai)
    : '-';

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

      {/* ✅ optional tampil total karyawan realtime */}
      <CardSection>
        <p className="text-sm text-gray-600">Total Nilai Karyawan (berbobot)</p>
        <p className="text-2xl font-bold text-blue-700">{totalNilaiKaryawan}</p>
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