"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

import { CardSection } from "@/components/CardSection";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle, AlertCircle, ListChecks } from "lucide-react";

type ActivePeriode = {
  id: string;
  namaPeriode?: string;
  status?: "aktif" | "ditutup";
  mulai?: any;
  selesai?: any;
  createdAt?: any;
  updatedAt?: any;
};

type AttendanceStatus = "hadir" | "sakit" | "izin";
type PenilaianStatus = "draft" | "dikirim" | "dinilai";

function getMonthRange(year: number, month1to12: number) {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 1);
  return { start, end };
}

function toDateSafe(v: any): Date | null {
  if (!v) return null;

  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;

  if (typeof v === "string") {
    const [yy, mm, dd] = v.split("-").map((x) => parseInt(x, 10));
    if (!yy || !mm || !dd) {
      const parsed = new Date(v);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return new Date(yy, mm - 1, dd);
  }

  return null;
}

function toMillis(value: any): number {
  return toDateSafe(value)?.getTime() ?? 0;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizePeriode(id: string, raw: any): ActivePeriode {
  return {
    id,
    namaPeriode: raw?.namaPeriode ?? raw?.nama ?? raw?.name,
    status: raw?.status ?? "aktif",
    mulai: raw?.mulai ?? raw?.startDate ?? raw?.tanggalMulai ?? raw?.awal,
    selesai: raw?.selesai ?? raw?.endDate ?? raw?.tanggalSelesai ?? raw?.akhir,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-blue-600">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const karyawanId = user?.karyawanId ?? user?.uid;

  const [loading, setLoading] = useState(true);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [message, setMessage] = useState("");

  const [activePeriod, setActivePeriod] = useState<ActivePeriode | null>(null);
  const [criteriaCount, setCriteriaCount] = useState(0);
  const [filledCount, setFilledCount] = useState(0);
  const [penilaianStatus, setPenilaianStatus] =
    useState<PenilaianStatus>("draft");

  const [attendancePercent, setAttendancePercent] = useState(0);
  const [hadirHari, setHadirHari] = useState(0);
  const [sakitHari, setSakitHari] = useState(0);
  const [izinHari, setIzinHari] = useState(0);
  const [alphaHari, setAlphaHari] = useState(0);

  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus>("hadir");

  const today = useMemo(() => new Date(), []);
  const todayString = useMemo(() => formatDateKey(today), [today]);

  useEffect(() => {
    if (!karyawanId) return;

    async function loadData() {
      setLoading(true);
      setMessage("");

      try {
        const periodeSnap = await getDocs(
          query(
            collection(db, "periode_penilaian"),
            where("status", "==", "aktif")
          )
        );

        const activeList = periodeSnap.docs
          .map((d) => normalizePeriode(d.id, d.data()))
          .sort((a, b) => {
            const aScore =
              toMillis(a.updatedAt) || toMillis(a.createdAt) || toMillis(a.mulai);
            const bScore =
              toMillis(b.updatedAt) || toMillis(b.createdAt) || toMillis(b.mulai);

            return bScore - aScore;
          });

        const periode = activeList[0] ?? null;
        setActivePeriod(periode);

        if (periode?.id) {
          const kriteriaSnap = await getDocs(
            query(
              collection(db, "kriteria_penilaian"),
              where("periodeId", "==", periode.id)
            )
          );
          setCriteriaCount(kriteriaSnap.size);
        } else {
          setCriteriaCount(0);
        }

        if (periode?.id) {
          const penilaianId = `${karyawanId}_${periode.id}`;
          const penilaianRef = doc(db, "penilaian_kinerja", penilaianId);
          const snapPenilaian = await getDoc(penilaianRef);

          if (snapPenilaian.exists()) {
            const data = snapPenilaian.data() as any;

            const nilaiKaryawan = data?.nilaiKaryawan ?? {};
            const filled =
              nilaiKaryawan && typeof nilaiKaryawan === "object"
                ? Object.keys(nilaiKaryawan).length
                : 0;

            setFilledCount(filled);
            setPenilaianStatus(
              data?.status === "dikirim" || data?.status === "dinilai"
                ? data.status
                : "draft"
            );
          } else {
            setFilledCount(0);
            setPenilaianStatus("draft");
          }
        } else {
          setFilledCount(0);
          setPenilaianStatus("draft");
        }

        await refreshAttendanceSummary(karyawanId, periode);
      } catch (error) {
        console.error(error);
        setActivePeriod(null);
        setCriteriaCount(0);
        setFilledCount(0);
        setPenilaianStatus("draft");
        setAttendancePercent(0);
        setHadirHari(0);
        setSakitHari(0);
        setIzinHari(0);
        setAlphaHari(0);
        setMessage("Gagal memuat dashboard karyawan.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [karyawanId, today]);

  async function refreshAttendanceSummary(
    karyawanIdArg: string,
    periode?: ActivePeriode | null
  ) {
    let start: Date;
    let end: Date;

    const pStart = toDateSafe(periode?.mulai);
    const pEnd = toDateSafe(periode?.selesai);

    if (pStart && pEnd) {
      start = startOfDay(pStart);
      end = startOfDay(pEnd);
    } else {
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const r = getMonthRange(year, month);
      start = startOfDay(r.start);

      const endInc = new Date(r.end);
      endInc.setDate(endInc.getDate() - 1);
      end = startOfDay(endInc);
    }

    let totalHariKerja = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getDay() !== 0) totalHariKerja += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    const snap = await getDocs(
      query(collection(db, "absensi"), where("karyawanId", "==", karyawanIdArg))
    );

    const uniqueByDate = new Map<string, AttendanceStatus>();

    snap.forEach((d) => {
      const data = d.data() as any;
      const tanggal = toDateSafe(data?.tanggal ?? data?.date);
      if (!tanggal) return;

      const t = startOfDay(tanggal);

      if (t < start || t > end) return;
      if (t.getDay() === 0) return;

      const dateKey = formatDateKey(t);
      const st = (data?.statusKehadiran ?? data?.status) as
        | AttendanceStatus
        | undefined;

      if (!st) return;

      uniqueByDate.set(dateKey, st);
    });

    let hadir = 0;
    let sakit = 0;
    let izin = 0;

    uniqueByDate.forEach((st) => {
      if (st === "hadir") hadir += 1;
      else if (st === "sakit") sakit += 1;
      else if (st === "izin") izin += 1;
    });

    const alpha = Math.max(totalHariKerja - (hadir + sakit + izin), 0);
    const percent =
      totalHariKerja === 0 ? 0 : Math.round((hadir / totalHariKerja) * 100);

    setAttendancePercent(percent);
    setHadirHari(hadir);
    setSakitHari(sakit);
    setIzinHari(izin);
    setAlphaHari(alpha);
  }

  const handleSubmitAttendance = async () => {
    if (!karyawanId) return;

    setSubmittingAttendance(true);
    setMessage("");

    try {
      const absensiId = `${karyawanId}_${todayString}`;
      const absensiRef = doc(db, "absensi", absensiId);
      const existingSnap = await getDoc(absensiRef);

      await setDoc(
        absensiRef,
        {
          id: absensiId,
          karyawanId,
          tanggal: todayString,
          statusKehadiran: attendanceStatus,
          updatedAt: serverTimestamp(),
          ...(existingSnap.exists() ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      setMessage("Absensi berhasil disimpan.");
      await refreshAttendanceSummary(karyawanId, activePeriod);
    } catch (error) {
      console.error(error);
      setMessage("Gagal menyimpan absensi.");
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const belumDiisi = Math.max(criteriaCount - filledCount, 0);
  const ctaText =
    penilaianStatus === "draft" ? "Lanjutkan penilaian" : "Lihat penilaian";
  const attendanceLabel = activePeriod
    ? "Kehadiran periode aktif (hari kerja)"
    : "Kehadiran bulan ini (hari kerja)";

  return (
    <div className="space-y-6">
      <CardSection title="Periode aktif">
        {activePeriod ? (
          <div className="space-y-4">
            <div>
              <p className="text-xl font-bold text-gray-900 md:text-2xl">
                {activePeriod.namaPeriode ?? "Periode Aktif"}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="text-sm text-gray-600">Status penilaian</p>
                <div>
                  <StatusBadge status={penilaianStatus as any} />
                </div>
              </div>
            </div>

            <div>
              <Link
                href="/karyawan/isi-penilaian"
                className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 sm:w-auto sm:px-6"
              >
                {ctaText}
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Tidak ada periode aktif</p>
        )}
      </CardSection>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CardSection title="Ringkasan Penilaian">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <StatItem
              icon={<ListChecks size={20} />}
              label="Jumlah Kriteria"
              value={loading ? "..." : criteriaCount}
            />

            <StatItem
              icon={<CheckCircle size={20} />}
              label="Sudah diisi"
              value={loading ? "..." : filledCount}
            />

            <StatItem
              icon={<AlertCircle size={20} />}
              label="Belum diisi"
              value={loading ? "..." : belumDiisi}
            />
          </div>
        </CardSection>

        <CardSection title="Absensi">
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-600">Tanggal</p>
              <p className="text-lg font-semibold text-gray-900">
                {todayString}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">
                Status Kehadiran
              </p>

              <div className="space-y-3">
                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <input
                    type="radio"
                    value="hadir"
                    checked={attendanceStatus === "hadir"}
                    onChange={() => setAttendanceStatus("hadir")}
                  />
                  <span>Hadir</span>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <input
                    type="radio"
                    value="sakit"
                    checked={attendanceStatus === "sakit"}
                    onChange={() => setAttendanceStatus("sakit")}
                  />
                  <span>Sakit</span>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <input
                    type="radio"
                    value="izin"
                    checked={attendanceStatus === "izin"}
                    onChange={() => setAttendanceStatus("izin")}
                  />
                  <span>Izin</span>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">
                {attendanceLabel}
              </p>
              <p className="mt-1 text-2xl font-bold text-green-600">
                {loading ? "..." : `${attendancePercent}%`}
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-500 sm:text-sm">
                Hadir: {hadirHari} • Sakit: {sakitHari} • Izin: {izinHari} •
                Alpha (otomatis): {alphaHari}
              </p>
            </div>

            <button
              onClick={handleSubmitAttendance}
              disabled={submittingAttendance || loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {submittingAttendance ? "Menyimpan..." : "Submit"}
            </button>

            {message && <p className="text-sm text-gray-700">{message}</p>}
          </div>
        </CardSection>
      </div>
    </div>
  );
}