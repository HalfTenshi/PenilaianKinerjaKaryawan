// src/app/karyawan/riwayat/page.tsx
'use client';

import Link from 'next/link';
import { CardSection } from '@/components/CardSection';
import { StatusBadge } from '@/components/StatusBadge';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

type StatusPenilaian = 'draft' | 'dikirim' | 'dinilai';

type PeriodeDoc = {
  namaPeriode?: string;
  nama?: string;
  name?: string;
  status?: 'aktif' | 'ditutup';
  mulai?: any;
  selesai?: any;
  startDate?: any;
  endDate?: any;
  tanggalMulai?: any;
  tanggalSelesai?: any;
  createdAt?: any;
  updatedAt?: any;
};

type PenilaianDoc = {
  periodeId: string;
  karyawanId: string;
  status: StatusPenilaian;
  nilaiKaryawan?: Record<string, number>;
  nilaiAdmin?: Record<string, number>;
  catatanAdmin?: string;
  createdAt?: any;
  updatedAt?: any;
};

type KriteriaDoc = {
  periodeId: string;
  namaKriteria?: string;
  bobot?: number;
  urutan?: number;
  createdAt?: any;
  updatedAt?: any;
};

type PeriodeOption = {
  id: string;
  nama: string;
  status: 'aktif' | 'ditutup';
  _sortMs: number;
};

type HistoryRow = {
  periodeId: string;
  periode: string;
  status: 'Dikirim' | 'Dinilai' | 'Draft';
  nilai: string; // nilai akhir dari nilaiAdmin (0..100) kalau dinilai
};

function mapStatusToBadge(status: StatusPenilaian): HistoryRow['status'] {
  if (status === 'dinilai') return 'Dinilai';
  if (status === 'dikirim') return 'Dikirim';
  return 'Draft';
}

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getSortableTime(v: any): number {
  const d = toDateSafe(v);
  return d ? d.getTime() : 0;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function hitungNilaiAkhir(params: {
  nilaiAdmin: Record<string, number> | undefined;
  kriteria: Array<{ id: string; bobot: number; urutan: number }>;
}): number {
  const { nilaiAdmin, kriteria } = params;
  if (!nilaiAdmin) return 0;
  if (!kriteria.length) return 0;

  let total = 0;
  for (const k of kriteria) {
    const v = typeof nilaiAdmin[k.id] === 'number' ? nilaiAdmin[k.id] : 0; // 0..5
    const bobot = typeof k.bobot === 'number' ? k.bobot : 0;
    total += (v / 5) * 100 * (bobot / 100);
  }
  return round1(total);
}

function mapPeriodeName(p?: PeriodeDoc | null, fallbackId?: string) {
  return p?.namaPeriode || p?.nama || p?.name || fallbackId || '-';
}

function periodeSortMs(p?: PeriodeDoc | null) {
  return (
    getSortableTime(p?.mulai) ||
    getSortableTime(p?.startDate) ||
    getSortableTime(p?.tanggalMulai) ||
    getSortableTime(p?.updatedAt) ||
    getSortableTime(p?.createdAt) ||
    0
  );
}

export default function RiwayatPenilaianPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const karyawanId = user?.karyawanId || uid;

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HistoryRow[]>([]);

  // ✅ filter periode sinkron Firestore
  const [periodeOptions, setPeriodeOptions] = useState<PeriodeOption[]>([]);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string>(''); // '' = semua

  const pageSize = 5;

  useEffect(() => {
    if (!karyawanId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadRiwayat() {
      setLoading(true);

      try {
        // 0) periode options (untuk dropdown), sort client, default aktif
        const periodeSnap = await getDocs(query(collection(db, 'periode_penilaian'), limit(500)));
        const pList: PeriodeOption[] = periodeSnap.docs
          .map((d) => {
            const data = d.data() as PeriodeDoc;
            return {
              id: d.id,
              nama: mapPeriodeName(data, d.id),
              status: (data.status ?? 'ditutup') as 'aktif' | 'ditutup',
              _sortMs: periodeSortMs(data),
            };
          })
          .sort((a, b) => (b._sortMs !== a._sortMs ? b._sortMs - a._sortMs : a.nama.localeCompare(b.nama)));

        if (!mounted) return;

        setPeriodeOptions(pList);

        setSelectedPeriodeId((prev) => {
          if (prev) return prev;
          const aktif = pList.find((x) => x.status === 'aktif');
          return aktif?.id ?? '';
        });

        // 1) penilaian_kinerja milik karyawan (anti-index)
        const penilaianSnap = await getDocs(
          query(collection(db, 'penilaian_kinerja'), where('karyawanId', '==', karyawanId), limit(500))
        );

        const penilaianList: Array<{ id: string; data: PenilaianDoc }> = penilaianSnap.docs.map((d) => ({
          id: d.id,
          data: d.data() as PenilaianDoc,
        }));

        // map periode untuk label
        const periodeMap = new Map<string, PeriodeDoc>();
        periodeSnap.docs.forEach((d) => periodeMap.set(d.id, d.data() as PeriodeDoc));

        // 2) periode dinilai => hitung nilai
        const periodeDinilaiSet = new Set<string>();
        penilaianList.forEach(({ data }) => {
          if (data.status === 'dinilai' && data.periodeId) periodeDinilaiSet.add(data.periodeId);
        });

        // 3) kriteria per periode (anti-index)
        const kriteriaCache = new Map<string, Array<{ id: string; bobot: number; urutan: number }>>();
        for (const periodeId of Array.from(periodeDinilaiSet)) {
          const kriSnap = await getDocs(
            query(collection(db, 'kriteria_penilaian'), where('periodeId', '==', periodeId), limit(500))
          );

          const list = kriSnap.docs
            .map((d) => {
              const data = d.data() as KriteriaDoc;
              return { id: d.id, bobot: Number(data.bobot ?? 0), urutan: Number(data.urutan ?? 0) };
            })
            .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));

          kriteriaCache.set(periodeId, list);
        }

        // 4) rows
        const merged: Array<HistoryRow & { _sortTime: number }> = penilaianList.map(({ data }) => {
          const periode = periodeMap.get(data.periodeId);
          const namaPeriode = mapPeriodeName(periode, data.periodeId);

          let nilaiTampil = '-';
          if (data.status === 'dinilai') {
            const kriteria = kriteriaCache.get(data.periodeId) ?? [];
            nilaiTampil = String(
              hitungNilaiAkhir({
                nilaiAdmin: data.nilaiAdmin ?? {},
                kriteria,
              })
            );
          }

          const sortTime = getSortableTime(data.updatedAt) || getSortableTime(data.createdAt) || 0;

          return {
            periodeId: data.periodeId,
            periode: namaPeriode,
            status: mapStatusToBadge(data.status),
            nilai: nilaiTampil,
            _sortTime: sortTime,
          };
        });

        merged.sort((a, b) => (b._sortTime !== a._sortTime ? b._sortTime - a._sortTime : b.periode.localeCompare(a.periode)));

        if (!mounted) return;
        setRows(merged.map(({ _sortTime, ...rest }) => rest));
        setCurrentPage(1);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setRows([]);
        setPeriodeOptions([]);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadRiwayat();
    return () => {
      mounted = false;
    };
  }, [karyawanId]);

  // ✅ filter periode + search (table)
  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return rows.filter((item) => {
      const okPeriode = selectedPeriodeId ? item.periodeId === selectedPeriodeId : true;
      const okSearch = q ? item.periode.toLowerCase().includes(q) : true;
      return okPeriode && okSearch;
    });
  }, [rows, searchQuery, selectedPeriodeId]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedData = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, safeCurrentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const pageButtons = useMemo(() => {
    const maxButtons = 5;
    const count = Math.min(totalPages, maxButtons);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [totalPages]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Riwayat Penilaian</h1>
      </div>

      {/* Filter Bar */}
      <CardSection>
        <div className="flex gap-4 items-center">
          <select
            value={selectedPeriodeId}
            onChange={(e) => {
              setSelectedPeriodeId(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua periode</option>
            {periodeOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Cari..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </CardSection>

      {/* History Table */}
      <CardSection>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-6 py-3 text-left font-semibold text-gray-700 bg-gray-50">Periode</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700 bg-gray-50">Status</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700 bg-gray-50">Nilai Akhir (Admin)</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700 bg-gray-50">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-6 py-4 text-gray-600" colSpan={4}>
                    Memuat data...
                  </td>
                </tr>
              ) : pagedData.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-gray-600" colSpan={4}>
                    Belum ada riwayat penilaian.
                  </td>
                </tr>
              ) : (
                pagedData.map((item, idx) => (
                  <tr key={`${item.periodeId}_${idx}`} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 font-medium">{item.periode}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-700">{item.nilai}</td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/karyawan/riwayat/${item.periodeId}/detail`}
                        className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                      >
                        Lihat
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage <= 1}
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>

          {pageButtons.map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`w-8 h-8 rounded-lg font-medium transition ${
                safeCurrentPage === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              {page}
            </button>
          ))}

          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage >= totalPages}
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      </CardSection>
    </div>
  );
}