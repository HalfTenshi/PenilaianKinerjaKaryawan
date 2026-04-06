'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  documentId,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { Search } from 'lucide-react';

import { db } from '@/lib/firebase';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Pagination } from '@/components/admin/Pagination';

type StatusPenilaian = 'draft' | 'dikirim' | 'dinilai';

type PeriodeDoc = {
  namaPeriode: string;
  status: 'aktif' | 'ditutup';
  mulai?: any;
  selesai?: any;
  createdAt?: any;
  updatedAt?: any;
};

type PenilaianKinerjaDoc = {
  karyawanId: string;
  periodeId: string;
  status: StatusPenilaian;
  nilaiKaryawan?: Record<string, number>;
  nilaiAdmin?: Record<string, number>;
  totalNilaiKaryawan?: number;
  totalNilaiAdmin?: number;
  totalNilai?: number;
  catatanAdmin?: string;
  createdAt?: any;
  updatedAt?: any;
};

type KaryawanDoc = {
  id?: string;
  nama?: string;
  nip?: string;
  bagian?: string;
  jabatan?: string;
  statusAktif?: boolean;
};

type KriteriaDoc = {
  id: string;
  periodeId: string;
  namaKriteria?: string;
  bobot?: number;
  urutan?: number;
};

type Row = {
  no: number;
  id: string;
  karyawanId: string;
  periodeId: string;
  nama: string;
  divisi: string;
  status: StatusPenilaian;
  nilaiAwal: number | null;
  nilaiAkhir: number | null;
};

function toMsMaybe(ts: any): number {
  if (ts?.toDate) return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

function normalizeNilaiMap(
  nilai?: Record<string, number>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(nilai ?? {}).map(([key, value]) => [key, clampScore(value)])
  );
}

async function fetchKaryawanMap(karyawanIds: string[]) {
  const unique = Array.from(new Set(karyawanIds)).filter(Boolean);
  const map = new Map<string, KaryawanDoc>();

  if (unique.length === 0) return map;

  const chunkSize = 10;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);

    const snap = await getDocs(
      query(collection(db, 'karyawan'), where(documentId(), 'in', chunk))
    );

    snap.docs.forEach((d) => {
      map.set(d.id, d.data() as KaryawanDoc);
    });
  }

  return map;
}

/**
 * Ambil kriteria per periode
 * Anti-index:
 * - where('periodeId' == ...) saja
 * - sort di client
 */
async function fetchKriteriaByPeriode(
  periodeId: string
): Promise<KriteriaDoc[]> {
  const snap = await getDocs(
    query(
      collection(db, 'kriteria_penilaian'),
      where('periodeId', '==', periodeId),
      limit(500)
    )
  );

  const list: KriteriaDoc[] = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      periodeId: String(data.periodeId ?? ''),
      namaKriteria: data.namaKriteria ?? data.nama ?? data.name,
      bobot: Number(data.bobot ?? 0),
      urutan: Number(data.urutan ?? 0),
    };
  });

  list.sort((a, b) => {
    if ((a.urutan ?? 0) !== (b.urutan ?? 0)) {
      return (a.urutan ?? 0) - (b.urutan ?? 0);
    }
    return String(a.namaKriteria ?? '').localeCompare(String(b.namaKriteria ?? ''));
  });

  return list;
}

/**
 * Nilai final berbobot:
 * total = sum((nilai/5) * bobot)
 */
function hitungNilaiAkhirBerbobot(params: {
  nilai: Record<string, number> | undefined;
  kriteria: KriteriaDoc[];
}): number | null {
  const { nilai, kriteria } = params;
  if (!nilai) return null;
  if (!kriteria.length) return null;

  const safeNilai = normalizeNilaiMap(nilai);

  let total = 0;
  for (const k of kriteria) {
    const v = safeNilai[k.id] ?? 0;
    const bobot = Number(k.bobot ?? 0);
    total += (v / 5) * bobot;
  }

  return Math.round(total * 100) / 100;
}

function pickLatestActivePeriode(
  list: Array<{ id: string; data: PeriodeDoc }>
): string {
  const active = list
    .filter((item) => item.data.status === 'aktif')
    .sort((a, b) => {
      const aMs =
        toMsMaybe(a.data.updatedAt) ||
        toMsMaybe(a.data.createdAt) ||
        toMsMaybe(a.data.mulai);
      const bMs =
        toMsMaybe(b.data.updatedAt) ||
        toMsMaybe(b.data.createdAt) ||
        toMsMaybe(b.data.mulai);

      return bMs - aMs;
    });

  return active[0]?.id ?? '';
}

function sortPeriodeList(list: Array<{ id: string; data: PeriodeDoc }>) {
  return [...list].sort((a, b) => {
    const aMs =
      toMsMaybe(a.data.mulai) ||
      toMsMaybe(a.data.updatedAt) ||
      toMsMaybe(a.data.createdAt);
    const bMs =
      toMsMaybe(b.data.mulai) ||
      toMsMaybe(b.data.updatedAt) ||
      toMsMaybe(b.data.createdAt);

    return bMs - aMs;
  });
}

export default function PenilaianKinerjaPage() {
  const [currentPage, setCurrentPage] = useState(1);

  const [periodeList, setPeriodeList] = useState<Array<{ id: string; data: PeriodeDoc }>>([]);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    async function loadPeriode() {
      try {
        const snap = await getDocs(
          query(collection(db, 'periode_penilaian'), limit(200))
        );

        const list = sortPeriodeList(
          snap.docs.map((d) => ({ id: d.id, data: d.data() as PeriodeDoc }))
        );

        setPeriodeList(list);
        setSelectedPeriodeId((prev) => prev || pickLatestActivePeriode(list));
      } catch (e) {
        console.error(e);
      }
    }

    loadPeriode();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadPenilaian() {
      setLoading(true);
      setError('');

      try {
        let snap;
        if (selectedPeriodeId) {
          snap = await getDocs(
            query(
              collection(db, 'penilaian_kinerja'),
              where('periodeId', '==', selectedPeriodeId),
              limit(2000)
            )
          );
        } else {
          snap = await getDocs(
            query(collection(db, 'penilaian_kinerja'), limit(2000))
          );
        }

        const penilaian = snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as PenilaianKinerjaDoc,
        }));

        const karyawanIds = penilaian.map((p) => p.data.karyawanId);
        const karyawanMap = await fetchKaryawanMap(karyawanIds);

        const kriteriaCache = new Map<string, KriteriaDoc[]>();
        const mapped: Array<Row & { _updatedMs: number }> = [];

        for (let idx = 0; idx < penilaian.length; idx += 1) {
          const p = penilaian[idx];
          const data = p.data;

          const karyawan = karyawanMap.get(data.karyawanId);
          const nama = karyawan?.nama ?? data.karyawanId ?? '-';
          const divisi = karyawan?.bagian ?? '-';

          let kriteria = kriteriaCache.get(data.periodeId);
          if (!kriteria) {
            kriteria = await fetchKriteriaByPeriode(data.periodeId);
            kriteriaCache.set(data.periodeId, kriteria);
          }

          const nilaiAwal =
            data.totalNilaiKaryawan !== undefined && data.totalNilaiKaryawan !== null
              ? Number(data.totalNilaiKaryawan)
              : hitungNilaiAkhirBerbobot({
                  nilai: data.nilaiKaryawan,
                  kriteria,
                });

          const nilaiAkhir =
            data.status === 'dinilai'
              ? data.totalNilaiAdmin !== undefined && data.totalNilaiAdmin !== null
                ? Number(data.totalNilaiAdmin)
                : data.totalNilai !== undefined && data.totalNilai !== null
                ? Number(data.totalNilai)
                : hitungNilaiAkhirBerbobot({
                    nilai: data.nilaiAdmin,
                    kriteria,
                  })
              : null;

          const _updatedMs = Math.max(
            toMsMaybe(data.updatedAt),
            toMsMaybe(data.createdAt)
          );

          mapped.push({
            no: idx + 1,
            id: p.id,
            karyawanId: data.karyawanId,
            periodeId: data.periodeId,
            nama,
            divisi,
            status:
              data.status === 'dikirim' || data.status === 'dinilai'
                ? data.status
                : 'draft',
            nilaiAwal:
              nilaiAwal !== null ? Math.round(Number(nilaiAwal) * 100) / 100 : null,
            nilaiAkhir:
              nilaiAkhir !== null ? Math.round(Number(nilaiAkhir) * 100) / 100 : null,
            _updatedMs,
          });
        }

        mapped.sort((a, b) => b._updatedMs - a._updatedMs);

        const finalRows: Row[] = mapped.map((r, i) => ({
          no: i + 1,
          id: r.id,
          karyawanId: r.karyawanId,
          periodeId: r.periodeId,
          nama: r.nama,
          divisi: r.divisi,
          status: r.status,
          nilaiAwal: r.nilaiAwal,
          nilaiAkhir: r.nilaiAkhir,
        }));

        if (!mounted) return;
        setRows(finalRows);
      } catch (e: any) {
        console.error(e);
        if (!mounted) return;

        setRows([]);
        if (String(e?.code || '').includes('failed-precondition')) {
          setError(
            'Query membutuhkan composite index. File ini sudah diubah anti-index, jadi cek file lain yang masih memakai kombinasi where + orderBy atau where ganda.'
          );
        } else {
          setError('Gagal memuat data penilaian.');
        }
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadPenilaian();
    setCurrentPage(1);

    return () => {
      mounted = false;
    };
  }, [selectedPeriodeId]);

  const handleApplySearch = () => {
    setAppliedSearch(searchDraft.trim());
    setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();

    return rows.filter((r) => {
      const okStatus = selectedStatus
        ? r.status === (selectedStatus as StatusPenilaian)
        : true;
      const okSearch = q ? r.nama.toLowerCase().includes(q) : true;

      return okStatus && okSearch;
    });
  }, [rows, selectedStatus, appliedSearch]);

  const itemsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filtered.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="ml-80 mt-28 space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Penilaian kinerja</h1>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Semua periode
          </label>
          <select
            value={selectedPeriodeId}
            onChange={(e) => setSelectedPeriodeId(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="">Semua periode</option>
            {periodeList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.data.namaPeriode}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Semua status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="">Semua status</option>
            <option value="draft">Draft</option>
            <option value="dikirim">Dikirim</option>
            <option value="dinilai">Dinilai</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Cari karyawan...
          </label>

          <div className="flex w-full items-center gap-3">
            <input
              type="text"
              placeholder="Cari nama karyawan..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplySearch();
              }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
            />

            <button
              type="button"
              onClick={handleApplySearch}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-900 px-5 py-2 font-medium text-white transition hover:bg-blue-950"
            >
              <Search size={18} />
              Cari
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50">
                <th className="px-6 py-3 text-left font-semibold text-gray-900">No</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Nama Karyawan
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Divisi
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Status
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Nilai Awal
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Nilai Akhir
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">
                  Aksi
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="px-6 py-4 text-gray-700" colSpan={7}>
                    Memuat data...
                  </td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-gray-700" colSpan={7}>
                    Belum ada data penilaian.
                  </td>
                </tr>
              ) : (
                currentData.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 text-gray-900">{item.no}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {item.nama}
                    </td>
                    <td className="px-6 py-4 text-gray-900">{item.divisi}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {item.nilaiAwal === null ? '-' : item.nilaiAwal}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {item.nilaiAkhir === null ? '-' : item.nilaiAkhir}
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

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}