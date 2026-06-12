"use client";

import Link from "next/link";
import { CardSection } from "@/components/CardSection";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from "recharts";

import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, limit } from "firebase/firestore";

// ── Tipe ─────────────────────────────────────────────────────────────────────

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

// ── BARU: tipe data chart ─────────────────────────────────────────────────
type ChartPoint = {
  name: string;
  nilai: number;
  periodeId: string;
};

// ── Helper ───────────────────────────────────────────────────────────────────

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
  if (!nilai || !kriteria.length) return 0;
  let total = 0;
  for (const item of kriteria) {
    const skor  = typeof nilai[item.id] === "number" ? Number(nilai[item.id]) : 0;
    const bobot = typeof item.bobot    === "number" ? Number(item.bobot)      : 0;
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

// ── BARU: helper warna bar ────────────────────────────────────────────────

function getBarColor(nilai: number): string {
  if (nilai >= 80) return "#16a34a";
  if (nilai >= 60) return "#2563eb";
  return "#dc2626";
}

// ── BARU: Custom Tooltip ──────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const nilai = payload[0]?.value as number;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <p className="mb-1 text-sm font-semibold text-gray-900">{label}</p>
      <p className="text-sm text-gray-700">
        Nilai Akhir:{" "}
        <span className="font-bold" style={{ color: getBarColor(nilai) }}>
          {formatNilai(nilai)}
        </span>
      </p>
    </div>
  );
}

// ── BARU: Custom XAxis Tick ───────────────────────────────────────────────

function CustomXTick({ x, y, payload }: any) {
  const raw = String(payload?.value ?? "");
  const label = raw.length > 13 ? raw.slice(0, 12) + "…" : raw;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="#6b7280" fontSize={11}>
        {label}
      </text>
    </g>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RiwayatPenilaianPage() {
  const { user } = useAuth();
  const uid        = user?.uid;
  const karyawanId = user?.karyawanId || uid;

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [rows, setRows]       = useState<HistoryRow[]>([]);

  const [periodeOptions, setPeriodeOptions]     = useState<PeriodeOption[]>([]);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string>("");

  const pageSize = 5;

  useEffect(() => {
    if (!karyawanId) { setLoading(false); return; }
    let mounted = true;

    async function loadRiwayat() {
      setLoading(true);
      try {
        const periodeSnap = await getDocs(query(collection(db, "periode_penilaian"), limit(500)));

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
            b._sortMs !== a._sortMs ? b._sortMs - a._sortMs : a.nama.localeCompare(b.nama)
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
          penilaianSnap.docs.map((d) => ({ id: d.id, data: d.data() as PenilaianDoc }));

        const periodeMap = new Map<string, PeriodeDoc>();
        periodeSnap.docs.forEach((d) => periodeMap.set(d.id, d.data() as PeriodeDoc));

        const periodeDinilaiSet = new Set<string>();
        penilaianList.forEach(({ data }) => {
          if (data.status === "dinilai" && data.periodeId) periodeDinilaiSet.add(data.periodeId);
        });

        const kriteriaCache = new Map<string, Array<{ id: string; bobot: number; urutan: number }>>();
        for (const periodeId of Array.from(periodeDinilaiSet)) {
          const kriSnap = await getDocs(
            query(collection(db, "kriteria_penilaian"), where("periodeId", "==", periodeId), limit(500))
          );
          kriteriaCache.set(
            periodeId,
            kriSnap.docs
              .map((d) => {
                const data = d.data() as KriteriaDoc;
                return { id: d.id, bobot: Number(data.bobot ?? 0), urutan: Number(data.urutan ?? 0) };
              })
              .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))
          );
        }

        const merged: Array<HistoryRow & { _sortTime: number }> = penilaianList.map(({ data }) => {
          const periode     = periodeMap.get(data.periodeId);
          const namaPeriode = mapPeriodeName(periode, data.periodeId);

          let nilaiTampil = "-";
          if (data.status === "dinilai") {
            if (typeof data.totalNilai === "number" && Number.isFinite(data.totalNilai)) {
              nilaiTampil = formatNilai(data.totalNilai);
            } else {
              const kriteria = kriteriaCache.get(data.periodeId) ?? [];
              nilaiTampil = formatNilai(hitungNilaiAkhir({ nilai: data.nilaiAdmin ?? {}, kriteria }));
            }
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

        merged.sort((a, b) =>
          b._sortTime !== a._sortTime ? b._sortTime - a._sortTime : b.periode.localeCompare(a.periode)
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
    return () => { mounted = false; };
  }, [karyawanId]);

  // ── BARU: data chart dari rows yang sudah ada ─────────────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    return rows
      .filter((r) => r.status === "Dinilai" && r.nilai !== "-")
      .map((r) => {
        const opt = periodeOptions.find((p) => p.id === r.periodeId);
        return {
          name: r.periode,
          nilai: parseFloat(r.nilai),
          periodeId: r.periodeId,
          _ms: opt?._sortMs ?? 0,
        };
      })
      .sort((a, b) => a._ms - b._ms)
      .map(({ _ms, ...rest }) => rest);
  }, [rows, periodeOptions]);

  const rataRataChart = useMemo(() => {
    if (!chartData.length) return 0;
    const sum = chartData.reduce((acc, d) => acc + d.nilai, 0);
    return round2(sum / chartData.length);
  }, [chartData]);

  const nilaiMax = useMemo(
    () => (chartData.length ? Math.max(...chartData.map((d) => d.nilai)) : 0),
    [chartData]
  );

  const nilaiMin = useMemo(
    () => (chartData.length ? Math.min(...chartData.map((d) => d.nilai)) : 0),
    [chartData]
  );

  const trendLabel = useMemo(() => {
    if (chartData.length < 2) return null;
    const last  = chartData[chartData.length - 1].nilai;
    const first = chartData[0].nilai;
    const diff  = round2(last - first);
    if (diff > 0)  return { text: `+${formatNilai(diff)} dari periode pertama`, color: "text-green-600" };
    if (diff < 0)  return { text: `${formatNilai(diff)} dari periode pertama`, color: "text-red-600" };
    return { text: "Stabil", color: "text-gray-500" };
  }, [chartData]);
  // ──────────────────────────────────────────────────────────────────────────

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((item) => {
      const okPeriode = selectedPeriodeId ? item.periodeId === selectedPeriodeId : true;
      const okSearch  = q ? item.periode.toLowerCase().includes(q) : true;
      return okPeriode && okSearch;
    });
  }, [rows, searchQuery, selectedPeriodeId]);

  const totalPages      = Math.max(1, Math.ceil(filteredData.length / pageSize));
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
    return Array.from({ length: Math.min(totalPages, maxButtons) }, (_, i) => i + 1);
  }, [totalPages]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Riwayat Penilaian</h1>
      </div>

      {/* ── BARU: Grafik Performa ──────────────────────────────────────── */}
      {!loading && chartData.length > 0 && (
        <CardSection>
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Grafik Performa Kinerja Saya</h2>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Berdasarkan {chartData.length} periode yang sudah dievaluasi
              </p>
            </div>
            {trendLabel && (
              <span className={`text-xs font-medium ${trendLabel.color}`}>{trendLabel.text}</span>
            )}
          </div>

          {/* Stat mini cards */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-green-100 bg-green-50 p-3">
              <p className="text-xs text-gray-500">Tertinggi</p>
              <p className="text-xl font-bold text-green-700">{formatNilai(nilaiMax)}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs text-gray-500">Rata-rata</p>
              <p className="text-xl font-bold text-blue-700">{formatNilai(rataRataChart)}</p>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50 p-3">
              <p className="text-xs text-gray-500">Terendah</p>
              <p className="text-xl font-bold text-red-700">{formatNilai(nilaiMin)}</p>
            </div>
          </div>

          {/* Chart */}
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 22, right: 16, left: 0, bottom: 8 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" vertical={false} />
              <XAxis
                dataKey="name"
                tick={<CustomXTick />}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={rataRataChart}
                stroke="#f59e0b"
                strokeDasharray="5 4"
                strokeWidth={2}
                label={{
                  value: `Rata-rata: ${formatNilai(rataRataChart)}`,
                  position: "insideTopRight",
                  fill: "#d97706",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
              <Bar dataKey="nilai" radius={[5, 5, 0, 0]} maxBarSize={56}>
                <LabelList
                  dataKey="nilai"
                  position="top"
                  style={{ fontSize: 11, fontWeight: 600, fill: "#374151" }}
                  formatter={(v: number) => formatNilai(v)}
                />
                {chartData.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={getBarColor(entry.nilai)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded" style={{ background: "#16a34a" }} />
              <span>≥ 80 Baik</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded" style={{ background: "#2563eb" }} />
              <span>60–79 Cukup</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded" style={{ background: "#dc2626" }} />
              <span>{"< 60 Perlu Peningkatan"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 border-t-2 border-dashed border-amber-400" />
              <span>Rata-rata</span>
            </div>
          </div>
        </CardSection>
      )}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <CardSection>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            value={selectedPeriodeId}
            onChange={(e) => { setSelectedPeriodeId(e.target.value); setCurrentPage(1); }}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:w-auto md:min-w-[220px]"
          >
            <option value="">Semua periode</option>
            {periodeOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.nama}</option>
            ))}
          </select>

          <div className="relative w-full flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Cari..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </CardSection>

      {/* ── Tabel riwayat ───────────────────────────────────────────────── */}
      <CardSection>
        {/* Mobile */}
        <div className="space-y-4 md:hidden">
          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">Memuat data...</div>
          ) : pagedData.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">Belum ada riwayat penilaian.</div>
          ) : (
            pagedData.map((item, idx) => (
              <div key={`${item.periodeId}_${idx}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Periode</p>
                    <p className="mt-1 font-semibold text-gray-900">{item.periode}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</p>
                      <div className="mt-1"><StatusBadge status={item.status} /></div>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Nilai Akhir</p>
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
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">Periode</th>
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">Nilai Akhir</th>
                <th className="bg-gray-50 px-6 py-3 text-left font-semibold text-gray-700">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-6 py-4 text-gray-600" colSpan={4}>Memuat data...</td></tr>
              ) : pagedData.length === 0 ? (
                <tr><td className="px-6 py-4 text-gray-600" colSpan={4}>Belum ada riwayat penilaian.</td></tr>
              ) : (
                pagedData.map((item, idx) => (
                  <tr key={`${item.periodeId}_${idx}`} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{item.periode}</td>
                    <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
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

        {/* Pagination */}
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
                safeCurrentPage === page ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
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
