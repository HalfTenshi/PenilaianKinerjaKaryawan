'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

interface Criterion {
  id: string; // id lokal UI
  name: string;
  weight: number;
}

interface PeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PeriodeAktif = {
  id: string;
  namaPeriode: string;
  status: 'aktif' | 'ditutup';
  mulai?: any;
  selesai?: any;
  createdAt?: any;
  updatedAt?: any;
};

const DEFAULT_CRITERIA: Criterion[] = [
  { id: '1', name: 'Disiplin kerja', weight: 20 },
  { id: '2', name: 'Kualitas pekerjaan', weight: 30 },
  { id: '3', name: 'Keselamatan kerja (K3)', weight: 20 },
  { id: '4', name: 'Kerja sama tim', weight: 15 },
  { id: '5', name: 'Ketepatan waktu', weight: 15 },
];

function toDateInputValue(value: any): string {
  try {
    const d =
      value?.toDate?.() instanceof Date
        ? value.toDate()
        : value instanceof Date
        ? value
        : null;

    if (!d) return '';

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

function fromDateInputValue(value: string): Date | null {
  if (!value) return null;

  const [yyyy, mm, dd] = value.split('-').map(Number);
  if (!yyyy || !mm || !dd) return null;

  const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getSortableTime(value: any): number {
  try {
    const d =
      value?.toDate?.() instanceof Date
        ? value.toDate()
        : value instanceof Date
        ? value
        : null;

    return d ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

export function PeriodModal({ isOpen, onClose }: PeriodModalProps) {
  const [formName, setFormName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [periodeAktif, setPeriodeAktif] = useState<PeriodeAktif | null>(null);

  const totalWeight = useMemo(
    () => criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0),
    [criteria]
  );

  const handleDeleteCriteria = (id: string) => {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  const handleUpdateCriteria = (
    id: string,
    field: 'name' | 'weight',
    value: string | number
  ) => {
    setCriteria((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              [field]:
                field === 'weight'
                  ? Math.max(0, Number(value) || 0)
                  : String(value),
            }
          : c
      )
    );
  };

  const handleAddCriteria = () => {
    setCriteria((prev) => {
      const nextId = (
        Math.max(0, ...prev.map((c) => Number(c.id) || 0)) + 1
      ).toString();

      return [...prev, { id: nextId, name: '', weight: 0 }];
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    async function loadAktif() {
      setMsg('');
      setLoading(true);

      try {
        const snapPeriode = await getDocs(
          query(collection(db, 'periode_penilaian'), where('status', '==', 'aktif'))
        );

        if (snapPeriode.empty) {
          setPeriodeAktif(null);
          setFormName('');
          setStartDate('');
          setEndDate('');
          setCriteria(DEFAULT_CRITERIA);
          return;
        }

        const periodeList: PeriodeAktif[] = snapPeriode.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            namaPeriode:
              data.namaPeriode ?? data.nama ?? data.name ?? 'Periode Aktif',
            status: data.status ?? 'aktif',
            mulai:
              data.mulai ??
              data.startDate ??
              data.tanggalMulai ??
              data.awal,
            selesai:
              data.selesai ??
              data.endDate ??
              data.tanggalSelesai ??
              data.akhir,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        periodeList.sort((a, b) => {
          const aScore =
            getSortableTime(a.updatedAt) ||
            getSortableTime(a.createdAt) ||
            getSortableTime(a.mulai);
          const bScore =
            getSortableTime(b.updatedAt) ||
            getSortableTime(b.createdAt) ||
            getSortableTime(b.mulai);

          return bScore - aScore;
        });

        const active = periodeList[0];
        setPeriodeAktif(active);

        setFormName(active.namaPeriode || '');
        setStartDate(toDateInputValue(active.mulai));
        setEndDate(toDateInputValue(active.selesai));

        const snapKriteria = await getDocs(
          query(
            collection(db, 'kriteria_penilaian'),
            where('periodeId', '==', active.id)
          )
        );

        if (snapKriteria.empty) {
          setCriteria(DEFAULT_CRITERIA);
          return;
        }

        const list = snapKriteria.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => {
            const ua = Number(a.urutan ?? 0);
            const ub = Number(b.urutan ?? 0);
            if (ua !== ub) return ua - ub;

            return String(a.namaKriteria ?? '').localeCompare(
              String(b.namaKriteria ?? '')
            );
          })
          .map((item, idx) => ({
            id: String(idx + 1),
            name: String(item.namaKriteria ?? '').trim(),
            weight: Number(item.bobot ?? 0),
          }));

        setCriteria(list.length > 0 ? list : DEFAULT_CRITERIA);
      } catch (error) {
        console.error('Gagal memuat periode aktif:', error);
        setMsg('Gagal memuat periode/kriteria. Coba lagi.');
      } finally {
        setLoading(false);
      }
    }

    loadAktif();
  }, [isOpen]);

  const handlePublish = async () => {
    setMsg('');

    const namaPeriode = formName.trim();
    const mulai = fromDateInputValue(startDate);
    const selesai = fromDateInputValue(endDate);

    if (!namaPeriode) {
      setMsg('Nama form penilaian wajib diisi.');
      return;
    }

    if (!mulai || !selesai) {
      setMsg('Tanggal mulai dan tanggal selesai wajib diisi.');
      return;
    }

    if (mulai.getTime() > selesai.getTime()) {
      setMsg('Tanggal mulai tidak boleh melebihi tanggal selesai.');
      return;
    }

    const cleaned = criteria
      .map((c) => ({
        id: c.id,
        name: String(c.name ?? '').trim(),
        weight: Number(c.weight ?? 0),
      }))
      .filter((c) => c.name.length > 0);

    if (cleaned.length === 0) {
      setMsg('Minimal harus ada 1 kriteria.');
      return;
    }

    const hasInvalidWeight = cleaned.some(
      (c) => !Number.isFinite(c.weight) || c.weight < 0 || c.weight > 100
    );

    if (hasInvalidWeight) {
      setMsg('Bobot tiap kriteria harus berupa angka 0–100.');
      return;
    }

    const duplicateNames = new Set<string>();
    for (const item of cleaned) {
      const key = item.name.toLowerCase();
      if (duplicateNames.has(key)) {
        setMsg('Nama kriteria tidak boleh duplikat.');
        return;
      }
      duplicateNames.add(key);
    }

    const cleanedTotal = cleaned.reduce((sum, c) => sum + c.weight, 0);
    if (cleanedTotal !== 100) {
      setMsg('Total bobot harus tepat 100%.');
      return;
    }

    setLoading(true);

    try {
      const batch = writeBatch(db);

      // Tutup semua periode aktif yang ada
      const aktifSnap = await getDocs(
        query(collection(db, 'periode_penilaian'), where('status', '==', 'aktif'))
      );

      aktifSnap.docs.forEach((d) => {
        batch.update(doc(db, 'periode_penilaian', d.id), {
          status: 'ditutup',
          updatedAt: serverTimestamp(),
        });
      });

      // Buat periode baru DI DALAM batch
      const periodeRef = doc(collection(db, 'periode_penilaian'));
      batch.set(periodeRef, {
        namaPeriode,
        status: 'aktif',
        mulai,
        selesai,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Tulis kriteria baru untuk periode baru
      // NOTE: kriteria periode lama TIDAK dihapus agar histori aman
      cleaned.forEach((item, idx) => {
        const kriteriaRef = doc(collection(db, 'kriteria_penilaian'));
        batch.set(kriteriaRef, {
          periodeId: periodeRef.id,
          namaKriteria: item.name,
          bobot: item.weight,
          urutan: idx + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      setMsg(
        'Berhasil publish periode & kriteria. Histori periode lama tetap aman.'
      );

      onClose();
    } catch (error) {
      console.error('Gagal publish periode:', error);
      setMsg('Gagal publish. Periksa rules Firestore dan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-screen w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-lg">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-6">
          <h2 className="text-2xl font-bold text-blue-900">
            Buat Periode & Kriteria Penilaian
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-semibold">Perilaku publish yang aman:</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Periode aktif lama akan ditutup.</li>
              <li>Periode baru akan dibuat sebagai periode aktif.</li>
              <li>Kriteria periode lama tidak dihapus agar histori tetap aman.</li>
            </ul>
            {periodeAktif && (
              <p className="mt-3">
                Periode aktif saat ini: <strong>{periodeAktif.namaPeriode}</strong>
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Periode Penilaian
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Nama Form Penilaian
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
                  placeholder="Contoh: Januari 2026"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Kriteria Penilaian & Bobot
            </h3>

            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                Total bobot kriteria harus tepat 100%
              </p>
              <p className="mt-1 text-sm text-red-600">
                Total saat ini: {totalWeight}%
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-300">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-300 bg-gray-100">
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Kriteria
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Bobot (%)
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((criterion) => (
                    <tr
                      key={criterion.id}
                      className="border-b border-gray-300 hover:bg-gray-50"
                    >
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={criterion.name}
                          onChange={(e) =>
                            handleUpdateCriteria(criterion.id, 'name', e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
                          placeholder="Masukkan kriteria..."
                          disabled={loading}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={criterion.weight}
                          onChange={(e) =>
                            handleUpdateCriteria(
                              criterion.id,
                              'weight',
                              e.target.value
                            )
                          }
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
                          min="0"
                          max="100"
                          placeholder="0"
                          disabled={loading}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDeleteCriteria(criterion.id)}
                          className="text-red-600 transition hover:text-red-800"
                          title="Hapus"
                          disabled={loading}
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleAddCriteria}
              className="mt-4 rounded-lg bg-blue-900 px-4 py-2 font-medium text-white transition hover:bg-blue-800"
              disabled={loading}
            >
              Tambah Kriteria
            </button>
          </div>

          {msg && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              {msg}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-gray-200 bg-gray-50 p-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 transition hover:bg-gray-100"
            disabled={loading}
          >
            Batal
          </button>
          <button
            onClick={handlePublish}
            className="flex-1 rounded-lg bg-blue-900 px-4 py-2 font-semibold text-white transition hover:bg-blue-800"
            disabled={loading}
          >
            {loading ? 'Menyimpan...' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}