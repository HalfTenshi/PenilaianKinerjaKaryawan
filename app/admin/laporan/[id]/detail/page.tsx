'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getPenilaianByDocId,
  getKaryawanById,
  getPeriodeById,
  getKriteriaByPeriode,
  getAttendanceSummary,
  hitungNilaiAkhir,
  type PenilaianKinerja,
  type Karyawan,
  type PeriodePenilaian,
  type KriteriaPenilaian,
} from '@/lib/firebase/adminLaporanService';
import { useAuth } from '@/context/AuthContext';

// ── Tipe chart ──────────────────────────────────────────────────────────────
type ChartPoint = {
  name: string;   // namaPeriode
  nilai: number;  // 0–100
  periodeId: string;
};

// ── Helper ──────────────────────────────────────────────────────────────────

function toNumberSafe(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function format2(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function getTanggalMulai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.mulai ?? periode?.startDate ??
    periode?.tanggalMulai ?? periode?.awal ?? null
  );
}

function getTanggalSelesai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.selesai ?? periode?.endDate ??
    periode?.tanggalSelesai ?? periode?.akhir ?? null
  );
}

function toMs(raw: any): number {
  if (!raw) return 0;
  if (typeof raw?.toDate === 'function') return raw.toDate().getTime();
  if (raw instanceof Date) return raw.getTime();
  return 0;
}

/** Warna bar berdasarkan nilai */
function getBarColor(nilai: number): string {
  if (nilai >= 80) return '#16a34a'; // hijau-600
  if (nilai >= 60) return '#2563eb'; // biru-600
  return '#dc2626';                  // merah-600
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const nilai = payload[0]?.value as number;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <p className="mb-1 text-sm font-semibold text-gray-900">{label}</p>
      <p className="text-sm text-gray-700">
        Nilai Akhir:{' '}
        <span className="font-bold" style={{ color: getBarColor(nilai) }}>
          {format2(nilai)}
        </span>
      </p>
    </div>
  );
}

// ── Custom XAxis Tick (truncate panjang) ─────────────────────────────────────

function CustomXTick({ x, y, payload }: any) {
  const raw = String(payload?.value ?? '');
  const label = raw.length > 13 ? raw.slice(0, 12) + '…' : raw;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="#6b7280" fontSize={11}>
        {label}
      </text>
    </g>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LaporanDetailPage() {
  const params = useParams();
  const penilaianId = String(params?.id ?? '');

  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [penilaian, setPenilaian] = useState<PenilaianKinerja | null>(null);
  const [karyawan, setKaryawan]   = useState<Karyawan | null>(null);
  const [periode, setPeriode]     = useState<PeriodePenilaian | null>(null);
  const [kriteria, setKriteria]   = useState<KriteriaPenilaian[]>([]);

  const [hadirHari, setHadirHari]     = useState(0);
  const [hadirPersen, setHadirPersen] = useState(0);

  // ── BARU: state grafik performa ────────────────────────────────────────────
  const [chartData, setChartData]       = useState<ChartPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

  const rataRataChart = useMemo(() => {
    if (!chartData.length) return 0;
    const sum = chartData.reduce((acc, d) => acc + d.nilai, 0);
    return Math.round((sum / chartData.length) * 100) / 100;
  }, [chartData]);

  const nilaiMax = useMemo(
    () => chartData.length ? Math.max(...chartData.map(d => d.nilai)) : 0,
    [chartData]
  );

  const nilaiMin = useMemo(
    () => chartData.length ? Math.min(...chartData.map(d => d.nilai)) : 0,
    [chartData]
  );
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (!penilaianId) throw new Error('Parameter laporan tidak valid.');
        if (!user)        throw new Error('Silakan login terlebih dahulu.');
        if (user.role !== 'admin') throw new Error('Akses ditolak. Halaman ini hanya untuk admin.');

        const p = await getPenilaianByDocId(penilaianId);
        if (!p) throw new Error('Data penilaian tidak ditemukan.');

        const k   = await getKaryawanById(p.karyawanId);
        const per = await getPeriodeById(p.periodeId);
        if (!per) throw new Error('Periode penilaian tidak ditemukan.');

        const kri = await getKriteriaByPeriode(p.periodeId);

        if (!mounted) return;
        setPenilaian(p);
        setKaryawan(k);
        setPeriode(per);
        setKriteria(kri);

        try {
          const sum = await getAttendanceSummary({
            karyawanId: p.karyawanId,
            mulai: getTanggalMulai(per),
            selesai: getTanggalSelesai(per),
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

        // ── BARU: Load semua penilaian karyawan ini untuk grafik ──────────
        try {
          const allSnap = await getDocs(
            query(
              collection(db, 'penilaian_kinerja'),
              where('karyawanId', '==', p.karyawanId)
            )
          );

          const allDinilai = allSnap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter((item: any) => item.status === 'dinilai');

          const periodeIds = [...new Set<string>(allDinilai.map((item: any) => item.periodeId))];

          const [perList, kriList] = await Promise.all([
            Promise.all(periodeIds.map(id => getPeriodeById(id))),
            Promise.all(periodeIds.map(id => getKriteriaByPeriode(id))),
          ]);

          const pMap = new Map<string, PeriodePenilaian>();
          const kMap = new Map<string, KriteriaPenilaian[]>();
          periodeIds.forEach((id, i) => {
            if (perList[i]) pMap.set(id, perList[i]!);
            kMap.set(id, kriList[i] ?? []);
          });

          const pts: Array<ChartPoint & { _ms: number }> = allDinilai.map((item: any) => {
            const perData = pMap.get(item.periodeId);
            const kriData = kMap.get(item.periodeId) ?? [];

            const rawNilai =
              Number.isFinite(Number(item.totalNilai)) && item.totalNilai != null
                ? Number(item.totalNilai)
                : hitungNilaiAkhir({ nilai: item.nilaiAdmin ?? {}, kriteria: kriData });

            return {
              name: perData?.namaPeriode ?? item.periodeId,
              nilai: Math.round(rawNilai * 100) / 100,
              periodeId: item.periodeId,
              _ms: toMs(getTanggalMulai(perData)),
            };
          });

          pts.sort((a, b) => a._ms - b._ms);

          if (!mounted) return;
          setChartData(pts.map(({ _ms, ...rest }) => rest));
        } catch (e: any) {
          console.warn('Chart data load error:', e?.message);
          if (!mounted) return;
          setChartData([]);
        } finally {
          if (mounted) setLoadingChart(false);
        }
        // ────────────────────────────────────────────────────────────────────

        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Gagal memuat detail laporan.');
        setLoading(false);
        setLoadingChart(false);
      }
    }

    if (authLoading) return;
    load();
    return () => { mounted = false; };
  }, [authLoading, user, penilaianId]);

  const totalNilaiAkhir = useMemo(() => {
    if (!penilaian) return 0;
    if (typeof penilaian.totalNilai === 'number') return toNumberSafe(penilaian.totalNilai);
    return hitungNilaiAkhir({ nilai: penilaian.nilaiAdmin, kriteria });
  }, [penilaian, kriteria]);

  const totalNilaiKaryawan = useMemo(() => {
    if (!penilaian) return 0;
    return hitungNilaiAkhir({ nilai: penilaian.nilaiKaryawan, kriteria });
  }, [penilaian, kriteria]);

  const criteriaRows = useMemo(() => {
    return kriteria.map((kr) => ({
      id: kr.id,
      name: kr.namaKriteria,
      weight: `${kr.bobot}%`,
      nilaiKaryawan: typeof penilaian?.nilaiKaryawan?.[kr.id] === 'number'
        ? penilaian!.nilaiKaryawan![kr.id] : null,
      nilaiAdmin: typeof penilaian?.nilaiAdmin?.[kr.id] === 'number'
        ? penilaian!.nilaiAdmin![kr.id] : null,
    }));
  }, [kriteria, penilaian]);

  const catatanKaryawanText = penilaian?.catatanKaryawan?.trim()
    ? penilaian.catatanKaryawan : 'Tidak ada catatan dari karyawan.';

  const catatanAdminText = penilaian?.catatanAdmin?.trim()
    ? penilaian.catatanAdmin : 'Belum ada catatan dari admin.';

  if (authLoading || loading) {
    return (
      <div className="space-y-6 ml-80 mt-28">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-sm">
          Memuat detail laporan...
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
        <Link href="/admin/laporan" className="text-blue-600 hover:text-blue-800 font-medium">
          Kembali
        </Link>
      </div>
    );
  }

  const jabatanTampil = karyawan?.jabatan?.trim() && karyawan.jabatan.trim() !== '-'
    ? karyawan.jabatan.trim() : '';

  return (
    <div className="space-y-6 ml-80 mt-28">

      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-blue-700 font-medium">
        <Link href="/admin/laporan" className="hover:text-blue-900">Laporan</Link>
        <ChevronRight size={16} />
        <span>Detail</span>
      </div>

      <h1 className="text-4xl font-bold text-blue-900">Detail Laporan Kinerja</h1>

      {/* ── Header karyawan ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex gap-8">
          <div className="flex-shrink-0">
            <div className="w-40 h-44 bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
              <Image
                src="/images/default-profile.png"
                alt={karyawan?.nama ?? 'Karyawan'}
                width={160} height={176}
                className="w-full h-full object-contain"
                loading="eager" priority
              />
            </div>
          </div>

          <div className="flex-1 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-blue-900">{karyawan?.nama ?? penilaian.karyawanId}</h2>
              {jabatanTampil && <p className="text-blue-600 font-medium">{jabatanTampil}</p>}
            </div>
            <div className="space-y-3">
              {[
                { label: 'NIP',               val: karyawan?.nip ?? '-' },
                { label: 'Bagian',            val: karyawan?.bagian ?? '-' },
                { label: 'Periode Penilaian', val: periode.namaPeriode },
                { label: 'Status',            val: penilaian.status },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center">
                  <span className="text-blue-700 font-medium w-40">{label}</span>
                  <span className="text-gray-500 mx-2">:</span>
                  <span className="text-gray-700">{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-6 w-72 flex flex-col gap-6 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-sm text-gray-600">Nilai Akhir</p>
              </div>
            </div>
            <div className="text-4xl font-bold text-blue-900">{format2(totalNilaiAkhir)}</div>
            <div className="border-t border-blue-200 pt-4">
              <p className="text-sm text-gray-700 mb-2">Hadir : {hadirHari} Hari</p>
              <p className="text-2xl font-bold text-green-700">{hadirPersen}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Ringkasan & catatan ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-900">Ringkasan Karyawan</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100">Nilai Karyawan</span>
          </div>
          <p className="text-sm text-gray-600">Total Nilai Karyawan</p>
          <p className="text-4xl font-bold text-blue-900 mt-1">{format2(totalNilaiKaryawan)}</p>
          <div className="mt-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">Catatan Karyawan</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[120px]">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{catatanKaryawanText}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-900">Catatan Admin</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">Read-only</span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[180px]">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{catatanAdminText}</p>
          </div>
        </div>
      </div>

      {/* ── Tabel kriteria ──────────────────────────────────────────────── */}
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
                  <td className="px-6 py-4 text-center text-gray-700">{item.nilaiKaryawan ?? '-'}</td>
                  <td className="px-6 py-4 text-center text-gray-700">{item.nilaiAdmin ?? '-'}</td>
                </tr>
              ))}
              {criteriaRows.length === 0 && (
                <tr><td className="px-6 py-6 text-gray-500" colSpan={4}>Kriteria belum dibuat.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-6 pt-6 bg-blue-50 rounded-lg p-6 flex justify-center">
          <div className="text-center">
            <p className="text-blue-700 font-medium mb-2">Total Nilai Akhir :</p>
            <p className="text-4xl font-bold text-blue-900">{format2(totalNilaiAkhir)}</p>
          </div>
        </div>
      </div>

      {/* ── BARU: Grafik Performa Kinerja ───────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="border-b border-gray-200 pb-4 mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-blue-900">Grafik Performa Kinerja</h3>
            <p className="text-sm text-gray-500 mt-0.5">Riwayat nilai akhir seluruh periode yang sudah dievaluasi</p>
          </div>
          {!loadingChart && chartData.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Rata-rata keseluruhan</p>
              <p className="text-2xl font-bold text-blue-900">{format2(rataRataChart)}</p>
            </div>
          )}
        </div>

        {loadingChart ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500">
            Memuat grafik...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">
            Belum ada data penilaian yang dievaluasi untuk ditampilkan.
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-green-100 bg-green-50 p-4">
                <p className="text-xs text-gray-500 mb-1">Nilai Tertinggi</p>
                <p className="text-2xl font-bold text-green-700">{format2(nilaiMax)}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs text-gray-500 mb-1">Rata-rata</p>
                <p className="text-2xl font-bold text-blue-700">{format2(rataRataChart)}</p>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-4">
                <p className="text-xs text-gray-500 mb-1">Nilai Terendah</p>
                <p className="text-2xl font-bold text-red-700">{format2(nilaiMin)}</p>
              </div>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartData}
                margin={{ top: 24, right: 20, left: 0, bottom: 8 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={<CustomXTick />}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Garis rata-rata */}
                <ReferenceLine
                  y={rataRataChart}
                  stroke="#f59e0b"
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  label={{
                    value: `Rata-rata: ${format2(rataRataChart)}`,
                    position: 'insideTopRight',
                    fill: '#d97706',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Bar dataKey="nilai" radius={[5, 5, 0, 0]} maxBarSize={64}>
                  <LabelList
                    dataKey="nilai"
                    position="top"
                    style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }}
                    formatter={(v: number) => format2(v)}
                  />
                  {chartData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={getBarColor(entry.nilai)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-5 text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded" style={{ background: '#16a34a' }} />
                <span>≥ 80 — Baik</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded" style={{ background: '#2563eb' }} />
                <span>60–79 — Cukup</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded" style={{ background: '#dc2626' }} />
                <span>{'< 60 — Perlu Peningkatan'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-6 border-t-2 border-dashed border-amber-500" />
                <span>Rata-rata</span>
              </div>
            </div>
          </>
        )}
      </div>
      {/* ─────────────────────────────────────────────────────────────────── */}

      <div className="flex justify-end">
        <Link
          href="/admin/laporan"
          className="px-8 py-2.5 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 transition"
        >
          Kembali
        </Link>
      </div>
    </div>
  );
}
