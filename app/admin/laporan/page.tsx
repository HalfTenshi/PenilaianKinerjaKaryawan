'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Printer } from 'lucide-react';
import {
  getAllPeriode,
  getPeriodeById,
  getPenilaianUntukLaporan,
  getKaryawanById,
  getKriteriaByPeriode,
  getAttendanceSummary,
  hitungNilaiAkhir,
  getKaryawanAktif,
  getPenilaianByPeriodeAllStatus,
  type PeriodePenilaian,
  type Karyawan,
} from '@/lib/firebase/adminLaporanService';

type ReportRow = {
  penilaianId: string;
  nama: string;
  divisi: string;
  hadir: number;
  sakit: number;
  nilaiAkhir: number;
  periodeId: string;
  karyawanId: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function LaporanPage() {
  const [currentPage, setCurrentPage] = useState(1);

  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [periodeOptions, setPeriodeOptions] = useState<PeriodePenilaian[]>([]);
  const [selectedPeriode, setSelectedPeriode] = useState<string>('');
  const [selectedDivisi, setSelectedDivisi] = useState<string>('');

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [divisiOptions, setDivisiOptions] = useState<string[]>([]);

  const [totalAktifCount, setTotalAktifCount] = useState(0);
  const [sudahIsiCount, setSudahIsiCount] = useState(0);
  const [belumIsiCount, setBelumIsiCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadPeriode() {
      try {
        const periode = await getAllPeriode();
        if (!mounted) return;

        setPeriodeOptions(periode);
        setSelectedPeriode((prev) => {
          if (prev) return prev;
          const aktif = periode.find((p) => p.status === 'aktif');
          return aktif?.id ?? '';
        });
      } catch (e) {
        console.error(e);
      }
    }

    loadPeriode();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const periodeObj = selectedPeriode
          ? await getPeriodeById(selectedPeriode)
          : null;

        const [penilaianList, allAktif] = await Promise.all([
          getPenilaianUntukLaporan({
            periodeId: selectedPeriode || undefined,
          }),
          getKaryawanAktif(),
        ]);

        const allDivisi = Array.from(
          new Set(
            allAktif
              .map((k) => String(k.bagian ?? '').trim())
              .filter((value) => value.length > 0)
          )
        ).sort();

        if (mounted) {
          setDivisiOptions(allDivisi);
        }

        const aktifFiltered = selectedDivisi
          ? allAktif.filter((k) => (k.bagian ?? '-') === selectedDivisi)
          : allAktif;

        let sudahIsi = 0;
        let belumIsi = 0;

        if (selectedPeriode) {
          const penilaianAllStatus = await getPenilaianByPeriodeAllStatus(
            selectedPeriode
          );

          const setSudahIsi = new Set<string>();
          for (const p of penilaianAllStatus as any[]) {
            if (p?.karyawanId) setSudahIsi.add(p.karyawanId);
          }

          sudahIsi = aktifFiltered.filter((k) => setSudahIsi.has(k.id)).length;
          belumIsi = Math.max(aktifFiltered.length - sudahIsi, 0);
        }

        if (mounted) {
          setTotalAktifCount(aktifFiltered.length);
          setSudahIsiCount(sudahIsi);
          setBelumIsiCount(belumIsi);
        }

        const karyawanCache = new Map<string, Karyawan | null>();
        const kriteriaCache = new Map<
          string,
          Awaited<ReturnType<typeof getKriteriaByPeriode>>
        >();
        const periodeCache = new Map<string, PeriodePenilaian | null>();

        const result = await Promise.all(
          (penilaianList as any[]).map(async (p) => {
            let karyawan = karyawanCache.get(p.karyawanId);
            if (karyawan === undefined) {
              karyawan = await getKaryawanById(p.karyawanId);
              karyawanCache.set(p.karyawanId, karyawan);
            }

            const divisi = karyawan?.bagian ?? '-';
            if (selectedDivisi && divisi !== selectedDivisi) {
              return null;
            }

            let per: PeriodePenilaian | null = periodeObj;
            if (!per) {
              if (!periodeCache.has(p.periodeId)) {
                const fetched = await getPeriodeById(p.periodeId);
                periodeCache.set(p.periodeId, fetched);
              }
              per = periodeCache.get(p.periodeId) ?? null;
            }

            let kriteria = kriteriaCache.get(p.periodeId);
            if (!kriteria) {
              kriteria = await getKriteriaByPeriode(p.periodeId);
              kriteriaCache.set(p.periodeId, kriteria);
            }

            const nilaiAkhir = hitungNilaiAkhir({
              nilai: p.nilaiAdmin,
              kriteria,
            });

            let hadirPersen = 0;
            let sakitIzinPersen = 0;

            if (per) {
              try {
                const sum = await getAttendanceSummary({
                  karyawanId: p.karyawanId,
                  mulai: per.mulai,
                  selesai: per.selesai,
                });

                hadirPersen = sum.hadirPersen;
                sakitIzinPersen = sum.sakitIzinPersen;
              } catch (e: any) {
                console.warn('Attendance query warning:', e?.message);
              }
            }

            return {
              penilaianId:
                p.id ?? p.penilaianId ?? `${p.karyawanId}_${p.periodeId}`,
              nama: karyawan?.nama ?? p.karyawanId,
              divisi,
              hadir: hadirPersen,
              sakit: sakitIzinPersen,
              nilaiAkhir,
              periodeId: p.periodeId,
              karyawanId: p.karyawanId,
            } as ReportRow;
          })
        );

        if (!mounted) return;

        const cleanedRows = result
          .filter(Boolean)
          .sort((a, b) => a!.nama.localeCompare(b!.nama)) as ReportRow[];

        setRows(cleanedRows);
        setCurrentPage(1);
        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Gagal memuat laporan.');
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [selectedPeriode, selectedDivisi]);

  const handleApplySearch = () => {
    setSearchTerm(searchDraft);
    setCurrentPage(1);
  };

  const rataRataPerforma = useMemo(() => {
    if (!rows.length) return '0.0';
    const avg =
      rows.reduce((sum, item) => sum + (Number(item.nilaiAkhir) || 0), 0) /
      rows.length;
    return avg.toFixed(1);
  }, [rows]);

  const filteredData = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return rows;

    return rows.filter((item) => item.nama.toLowerCase().includes(q));
  }, [rows, searchTerm]);

  const itemsPerPage = 5;
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const labelPeriodeCard = useMemo(() => {
    if (!selectedPeriode) return 'Semua Periode';
    return (
      periodeOptions.find((p) => p.id === selectedPeriode)?.namaPeriode ??
      'Periode terpilih'
    );
  }, [selectedPeriode, periodeOptions]);

  const handlePrintPDF = (item: ReportRow) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');

    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup lalu coba lagi.');
      return;
    }

    const printedAt = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

    const html = `
      <!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <title>Laporan ${escapeHtml(item.nama)}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #111827;
              padding: 32px;
              line-height: 1.5;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 20px;
            }
            .meta {
              margin-bottom: 24px;
            }
            .meta-row {
              margin-bottom: 8px;
            }
            .label {
              display: inline-block;
              min-width: 140px;
              font-weight: 700;
            }
            .box {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              padding: 20px;
              margin-top: 16px;
            }
            .score {
              font-size: 32px;
              font-weight: 700;
              margin-top: 8px;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <h1>Laporan Kinerja Karyawan</h1>

          <div class="meta">
            <div class="meta-row"><span class="label">Nama</span> ${escapeHtml(item.nama)}</div>
            <div class="meta-row"><span class="label">Divisi</span> ${escapeHtml(item.divisi)}</div>
            <div class="meta-row"><span class="label">Hadir</span> ${item.hadir}%</div>
            <div class="meta-row"><span class="label">Sakit/Izin</span> ${item.sakit}%</div>
            <div class="meta-row"><span class="label">Tanggal Cetak</span> ${escapeHtml(printedAt)}</div>
          </div>

          <div class="box">
            <div>Nilai Akhir</div>
            <div class="score">${item.nilaiAkhir}</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  return (
    <div className="ml-80 mt-28 space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">
          Laporan Kinerja Karyawan
        </h1>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Semua Periode
          </label>
          <select
            value={selectedPeriode || ''}
            onChange={(e) => {
              setSelectedPeriode(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="">Semua Periode</option>
            {periodeOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.namaPeriode}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Semua Divisi
          </label>
          <select
            value={selectedDivisi || ''}
            onChange={(e) => {
              setSelectedDivisi(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="">Semua Divisi</option>
            {divisiOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
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
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-900 px-5 py-2 font-medium text-white transition hover:bg-blue-800"
            >
              <Search size={18} />
              Cari
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
          Memuat laporan...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-red-600 shadow-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Total karyawan aktif
            </h3>

            <div className="space-y-2">
              <p className="text-sm text-gray-600">{labelPeriodeCard}</p>
              <p className="text-4xl font-bold text-gray-900">{totalAktifCount}</p>

              <div className="mt-3 flex flex-wrap gap-3">
                <span className="rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs text-green-800">
                  Sudah isi: {selectedPeriode ? sudahIsiCount : '-'}
                </span>
                <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs text-red-800">
                  Belum isi: {selectedPeriode ? belumIsiCount : '-'}
                </span>
              </div>

              {!selectedPeriode && (
                <p className="mt-2 text-xs text-gray-500">
                  Pilih periode untuk melihat status isi.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Nilai rata-rata performa karyawan
            </h3>

            <div>
              <p className="text-sm text-gray-600">{labelPeriodeCard}</p>
              <p className="text-4xl font-bold text-gray-900">
                {rataRataPerforma}
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-300 bg-gray-50">
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">
                    No
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">
                    Nama
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">
                    Divisi
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">
                    Hadir (%)
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">
                    Sakit/izin (%)
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
                {currentData.map((item, idx) => (
                  <tr
                    key={item.penilaianId}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 text-gray-900">
                      {startIndex + idx + 1}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {item.nama}
                    </td>
                    <td className="px-6 py-4 text-gray-900">{item.divisi}</td>
                    <td className="px-6 py-4 text-gray-900">{item.hadir}%</td>
                    <td className="px-6 py-4 text-gray-900">{item.sakit}%</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {item.nilaiAkhir}
                    </td>
                    <td className="flex gap-3 px-6 py-4">
                      <Link
                        href={`/admin/laporan/${item.penilaianId}/detail`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        Detail
                      </Link>
                      <button
                        onClick={() => handlePrintPDF(item)}
                        className="flex items-center gap-1 font-medium text-green-600 hover:text-green-800"
                      >
                        <Printer size={16} />
                        Cetak
                      </button>
                    </td>
                  </tr>
                ))}

                {currentData.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-gray-500" colSpan={7}>
                      Tidak ada data laporan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sebelumnya
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`rounded-lg px-3 py-2 transition ${
                currentPage === page
                  ? 'bg-blue-900 text-white'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Berikutnya
          </button>
        </div>
      )}
    </div>
  );
}