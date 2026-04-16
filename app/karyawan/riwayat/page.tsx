"use client";

import Link from "next/link";
import { CardSection } from "@/components/CardSection";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, limit } from "firebase/firestore";

type StatusPenilaian = "draft" | "dikirim" | "dinilai";

type PeriodeDoc = {
  namaPeriode?: string;
  nama?: string;
  name?: string;
  status?: "aktif" | "ditutup";

  mulai?: any;
  selesai?: any;

  startDate?: any;
  endDate?: any;

  tanggalMulai?: any;
  tanggalSelesai?: any;

  awal?: any;
  akhir?: any;

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
  totalNilai?: number;

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
  status: "aktif" | "ditutup";
  _sortMs: number;
};

type HistoryRow = {
  periodeId: string;
  periode: string;
  status: "Dikirim" | "Dinilai" | "Draft";
  nilai: string;
};

function mapStatusToBadge(status: StatusPenilaian): HistoryRow["status"] {
  if (status === "dinilai") return "Dinilai";
  if (status === "dikirim") return "Dikirim";
  return "Draft";
}

function toDateSafe(v: any): Date | null {
  if (!v) return null;

  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;

  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-").map(Number);
      return new Date(y, m - 1, d);
    }

    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function getSortableTime(v: any): number {
  const d = toDateSafe(v);
  return d ? d.getTime() : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatNilai(n: number) {
  return round2(n).toFixed(2);
}

function hitungNilaiAkhir(params: {
  nilai: Record<string, number> | undefined;
  kriteria: Array<{ id: string; bobot: number; urutan: number }>;
}): number {
  const { nilai, kriteria } = params;
  if (!nilai) return 0;
  if (!kriteria.length) return 0;

  let total = 0;
  for (const item of kriteria) {
    const skor = typeof nilai[item.id] === "number" ? Number(nilai[item.id]) : 0;
    const bobot = typeof item.bobot === "number" ? Number(item.bobot) : 0;
    total += ((skor / 5) * 100) * (bobot / 100);
  }

  return round2(total);
}

function mapPeriodeName(p?: PeriodeDoc | null, fallbackId?: string) {
  return p?.namaPeriode || p?.nama || p?.name || fallbackId || "-";
}

function periodeSortMs(p?: PeriodeDoc | null) {
  return (
    getSortableTime(p?.mulai) ||
    getSortableTime(p?.startDate) ||
    getSortableTime(p?.tanggalMulai) ||
    getSortableTime(p?.awal) ||
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
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HistoryRow[]>([]);

  const [periodeOptions, setPeriodeOptions] = useState<PeriodeOption[]>([]);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string>("");

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
        const periodeSnap = await getDocs(
          query(collection(db, "periode_penilaian"), limit(500))
        );

        const pList: PeriodeOption[] = periodeSnap.docs
          .map((d) => {
            const data = d.data() as PeriodeDoc;
            return {
              id: d.id,
              nama: mapPeriodeName(data, d.id),
              status: (data.status ?? "ditutup") as "aktif" | "ditutup",
              _sortMs: periodeSortMs(data),
            };
          })
          .sort((a, b) =>
            b._sortMs !== a._sortMs
              ? b._sortMs - a._sortMs
              : a.nama.localeCompare(b.nama)
          );

        if (!mounted) return;

        setPeriodeOptions(pList);

        setSelectedPeriodeId((prev) => {
          if (prev) return prev;
          const aktif = pList.find((x) => x.status === "aktif");
          return aktif?.id ?? "";
        });

        const penilaianSnap = await getDocs(
          query(
            collection(db, "penilaian_kinerja"),
            where("karyawanId", "==", karyawanId),
            limit(500)
          )
        );

        const penilaianList: Array<{ id: string; data: PenilaianDoc }> =
          penilaianSnap.docs.map((d) => ({
            id: d.id,
            data: d.data() as PenilaianDoc,
          }));

        const periodeMap = new Map<string, PeriodeDoc>();
        periodeSnap.docs.forEach((d) => periodeMap.set(d.id, d.data() as PeriodeDoc));

        const periodeDinilaiSet = new Set<string>();
        penilaianList.forEach(({ data }) => {
          if (data.status === "dinilai" && data.periodeId) {
            periodeDinilaiSet.add(data.periodeId);
          }
        });

        const kriteriaCache = new Map<
          string,
          Array<{ id: string; bobot: number; urutan: number }>
        >();

        for (const periodeId of Array.from(periodeDinilaiSet)) {
          const kriSnap = await getDocs(
            query(
              collection(db, "kriteria_penilaian"),
              where("periodeId", "==", periodeId),
              limit(500)
            )
          );

          const list = kriSnap.docs
            .map((d) => {
              const data = d.data() as KriteriaDoc;
              return {
                id: d.id,
                bobot: Number(data.bobot ?? 0),
                urutan: Number(data.urutan ?? 0),
              };
            })
            .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));

          kriteriaCache.set(periodeId, list);
        }

        const merged: Array<HistoryRow & { _sortTime: number }> = penilaianList.map(
          ({ data }) => {
            const periode = periodeMap.get(data.periodeId);
            const namaPeriode = mapPeriodeName(periode, data.periodeId);

            let nilaiTampil = "-";

            if (data.status === "dinilai") {
              if (typeof data.totalNilai === "number" && Number.isFinite(data.totalNilai)) {
                nilaiTampil = formatNilai(data.totalNilai);
              } else {
                const kriteria = kriteriaCache.get(data.periodeId) ?? [];
                nilaiTampil = formatNilai(
                  hitungNilaiAkhir({
                    nilai: data.nilaiAdmin ?? {},
                    kriteria,
                  })
                );
              }
            }

            const sortTime =
              getSortableTime(data.updatedAt) || getSortableTime(data.createdAt) || 0;

            return {
              periodeId: data.periodeId,
              periode: namaPeriode,
              status: mapStatusToBadge(data.status),
              nilai: nilaiTampil,
              _sortTime: sortTime,
            };
          }
        );

        merged.sort((a, b) =>
          b._sortTime !== a._sortTime
            ? b._sortTime - a._sortTime
            : b.periode.localeCompare(a.periode)
        );

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
  }, [currentPage, totalPages]);

  const pageButtons = useMemo(() => {
    const maxButtons = 5;
    const count = Math.min(totalPages, maxButtons);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [totalPages]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Riwayat Penilaian
        </h1>
      </div>

      <CardSection>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            value={selectedPeriodeId}
            onChange={(e) => {
              setSelectedPeriodeId(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:w-auto md:min-w-[220px]"
          >
            <option value="">Semua periode</option>
            {periodeOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>

          <div className="relative w-full flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Cari..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </CardSection>

      <CardSection>
        {/* Mobile */}
        <div className="space-y-4 md:hidden">
          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Memuat data...
            </div>
          ) : pagedData.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Belum ada riwayat penilaian.
            </div>
          ) : (
            pagedData.map((item, idx) => (
              <div
                key={`${item.periodeId}_${idx}`}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Periode
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">{item.periode}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Status
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={item.status} />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Nilai Akhir
                      </p>
                      <p className="mt-1 text-gray-700">{item.nilai}</p>
                    </div>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/karyawan/riwayat/${item.periodeId}/detail`}
                      className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      Lihat
                    </Link>
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
              <tr className="border-b border-gray-200">
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">
                  Periode
                </th>
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">
                  Status
                </th>
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">
                  Nilai Akhir
                </th>
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">
                  Aksi
                </th>
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
                  <tr
                    key={`${item.periodeId}_${idx}`}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">{item.periode}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-700">{item.nilai}</td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/karyawan/riwayat/${item.periodeId}/detail`}
                        className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
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

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            className="rounded-lg p-2 transition hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage <= 1}
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>

          {pageButtons.map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`h-9 min-w-[36px] rounded-lg px-2 font-medium transition ${
                safeCurrentPage === page
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            className="rounded-lg p-2 transition hover:bg-gray-100 disabled:opacity-50"
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