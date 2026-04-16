"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { CardSection } from "@/components/CardSection";

type PeriodePenilaianDoc = {
  namaPeriode: string;
  status: "aktif" | "ditutup";

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
  status: "draft" | "dikirim" | "dinilai";

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

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
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

    if (!s || !e) return "-";

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(d);

    return `${fmt(s)} - ${fmt(e)}`;
  } catch {
    return "-";
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

  if (!nilai || typeof nilai !== "object") return result;

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

function ratingBoxClass(active: boolean, disabled: boolean) {
  if (disabled) {
    return active
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-gray-300 bg-gray-100 text-gray-500";
  }

  return active
    ? "border-blue-600 bg-blue-600 text-white"
    : "border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50";
}

export default function IsiPenilaianPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const karyawanId = user?.karyawanId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const [periodeAktif, setPeriodeAktif] = useState<{
    id: string;
    data: PeriodePenilaianDoc;
  } | null>(null);
  const [kriteria, setKriteria] = useState<
    Array<{ id: string; data: KriteriaPenilaianDoc }>
  >([]);

  const [nilaiKaryawan, setNilaiKaryawan] = useState<Record<string, number>>({});
  const [catatanKaryawan, setCatatanKaryawan] = useState("");
  const [statusPenilaian, setStatusPenilaian] = useState<
    "draft" | "dikirim" | "dinilai"
  >("draft");

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
      setError("");

      try {
        const snapPeriode = await getDocs(
          query(
            collection(db, "periode_penilaian"),
            where("status", "==", "aktif"),
            limit(10)
          )
        );

        if (snapPeriode.empty) {
          setPeriodeAktif(null);
          setKriteria([]);
          setNilaiKaryawan({});
          setCatatanKaryawan("");
          setStatusPenilaian("draft");
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
          setCatatanKaryawan("");
          setStatusPenilaian("draft");
          setLoading(false);
          return;
        }

        setPeriodeAktif(periode);

        const snapKriteria = await getDocs(
          query(
            collection(db, "kriteria_penilaian"),
            where("periodeId", "==", periode.id)
          )
        );

        const kriteriaList = snapKriteria.docs
          .map((d) => ({
            id: d.id,
            data: d.data() as KriteriaPenilaianDoc,
          }))
          .sort((a, b) => (a.data.urutan ?? 0) - (b.data.urutan ?? 0));

        setKriteria(kriteriaList);

        const refPenilaian = doc(db, "penilaian_kinerja", `${karyawanId}_${periode.id}`);
        const snapPenilaian = await getDoc(refPenilaian);

        if (snapPenilaian.exists()) {
          const data = snapPenilaian.data() as PenilaianKinerjaDoc;
          setNilaiKaryawan(sanitizeNilaiMap(data.nilaiKaryawan ?? {}));
          setCatatanKaryawan(data.catatanKaryawan ?? "");
          setStatusPenilaian(data.status ?? "draft");
        } else {
          setNilaiKaryawan({});
          setCatatanKaryawan("");
          setStatusPenilaian("draft");
        }

        setLoading(false);
      } catch (e: any) {
        console.error(e);
        const msg = e?.code
          ? `Gagal memuat data penilaian (${e.code}). ${e?.message ?? ""}`
          : "Gagal memuat data penilaian. Coba refresh halaman.";
        setError(msg);
        setLoading(false);
      }
    }

    loadAll();
  }, [authLoading, karyawanId]);

  const handleRatingChange = (kriteriaId: string, rating: number) => {
    if (statusPenilaian !== "draft") return;

    const safeRating = Math.max(1, Math.min(5, rating));
    setNilaiKaryawan((prev) => ({
      ...prev,
      [kriteriaId]: safeRating,
    }));
  };

  const handleSimpanDraft = async () => {
    if (!karyawanId) return;
    if (!periodeAktif?.id) return alert("Tidak ada periode aktif.");
    if (!penilaianId) return;

    setSaving(true);
    setError("");

    try {
      const ref = doc(db, "penilaian_kinerja", penilaianId);
      const existing = await getDoc(ref);

      const payload: any = {
        id: penilaianId,
        periodeId: periodeAktif.id,
        karyawanId,
        status: "draft",
        nilaiKaryawan: sanitizeNilaiMap(nilaiKaryawan),
        catatanKaryawan: catatanKaryawan ?? "",
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(ref, payload, { merge: true });

      alert("Draft berhasil disimpan.");
      setStatusPenilaian("draft");
    } catch (e: any) {
      console.error(e);
      const msg = e?.code
        ? `Gagal menyimpan draft (${e.code}). ${e?.message ?? ""}`
        : "Gagal menyimpan draft. Periksa koneksi atau rules Firestore.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleKirimPenilaian = async () => {
    if (!karyawanId) return;
    if (!periodeAktif?.id) return alert("Tidak ada periode aktif.");
    if (!penilaianId) return;

    const totalKriteria = kriteria.length;
    const terisi = Object.keys(sanitizeNilaiMap(nilaiKaryawan)).length;

    if (totalKriteria > 0 && terisi < totalKriteria) {
      alert(`Masih ada kriteria yang belum diisi. Terisi ${terisi}/${totalKriteria}.`);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const ref = doc(db, "penilaian_kinerja", penilaianId);
      const existing = await getDoc(ref);

      const payload: any = {
        id: penilaianId,
        periodeId: periodeAktif.id,
        karyawanId,
        status: "dikirim",
        nilaiKaryawan: sanitizeNilaiMap(nilaiKaryawan),
        catatanKaryawan: catatanKaryawan ?? "",
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(ref, payload, { merge: true });

      alert("Penilaian berhasil dikirim.");
      setStatusPenilaian("dikirim");
      router.push("/karyawan/riwayat");
    } catch (e: any) {
      console.error(e);
      const msg = e?.code
        ? `Gagal mengirim penilaian (${e.code}). ${e?.message ?? ""}`
        : "Gagal mengirim penilaian. Periksa koneksi atau rules Firestore.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Isi Penilaian
        </h1>
        <CardSection>
          <p className="text-sm text-gray-600 md:text-base">Memuat data...</p>
        </CardSection>
      </div>
    );
  }

  if (!karyawanId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Isi Penilaian
        </h1>
        <CardSection>
          <p className="text-gray-700">Silakan login terlebih dahulu.</p>
        </CardSection>
      </div>
    );
  }

  const periodeRange = periodeAktif ? formatTanggalRange(periodeAktif.data) : "-";
  const isReadOnly = statusPenilaian !== "draft";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          Isi Penilaian
        </h1>
      </div>

      {error && (
        <CardSection>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        </CardSection>
      )}

      <CardSection title="Periode aktif">
        {periodeAktif ? (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900 md:text-xl">
              {periodeAktif.data.namaPeriode}
            </p>
            <p className="text-sm text-gray-600">{periodeRange}</p>
            {isReadOnly && (
              <p className="text-sm text-gray-600">
                Status penilaian:{" "}
                <span className="font-semibold">{statusPenilaian}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Tidak ada periode aktif</p>
        )}
      </CardSection>

      <CardSection>
        <p className="text-sm text-gray-700 md:text-base">
          Silahkan isi nilai penilaian kerja anda pada periode ini :
        </p>
      </CardSection>

      <CardSection>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-gray-600">Total Nilai Sementara</p>
          <p className="text-2xl font-bold text-blue-700 md:text-3xl">
            {totalNilaiSementara.toFixed(2)}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Nilai ini hanya untuk preview perhitungan dari input karyawan, tidak
            disimpan sebagai field cache lama.
          </p>
        </div>
      </CardSection>

      <CardSection title="Kriteria Penilaian">
        {kriteria.length === 0 ? (
          <p className="text-gray-500">Kriteria belum diatur untuk periode ini.</p>
        ) : (
          <>
            {/* Mobile */}
            <div className="space-y-4 md:hidden">
              {kriteria.map((item, index) => {
                const selected = nilaiKaryawan[item.id];

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="mb-4 space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Kriteria {index + 1}
                      </p>
                      <h3 className="text-base font-semibold text-gray-900">
                        {item.data.namaKriteria}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Bobot: {item.data.bobot}%
                      </p>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((rating) => {
                        const active = selected === rating;

                        return (
                          <label
                            key={rating}
                            className={`flex cursor-pointer items-center justify-center rounded-lg border px-0 py-3 text-sm font-semibold transition ${ratingBoxClass(
                              active,
                              isReadOnly
                            )} ${isReadOnly ? "cursor-not-allowed" : ""}`}
                          >
                            <input
                              type="radio"
                              name={`rating-mobile-${item.id}`}
                              value={rating}
                              checked={active}
                              onChange={() => handleRatingChange(item.id, rating)}
                              className="sr-only"
                              disabled={isReadOnly}
                            />
                            {rating}
                          </label>
                        );
                      })}
                    </div>

                    <p className="mt-3 text-xs text-gray-500">
                      Nilai dipilih: {selected ?? "-"}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700">
                      Kriteria Penilaian
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700">
                      Bobot
                    </th>
                    <th
                      colSpan={5}
                      className="bg-gray-50 px-4 py-3 text-center font-semibold text-gray-700"
                    >
                      Nilai Karyawan
                    </th>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <th></th>
                    <th></th>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <th
                        key={num}
                        className="px-3 py-2 text-center text-sm font-semibold text-gray-600"
                      >
                        {num}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {kriteria.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-4 py-4 font-medium text-gray-900">
                        {item.data.namaKriteria}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {item.data.bobot}%
                      </td>

                      {[1, 2, 3, 4, 5].map((rating) => (
                        <td key={rating} className="px-3 py-4 text-center">
                          <label className="flex justify-center">
                            <input
                              type="radio"
                              name={`rating-${item.id}`}
                              value={rating}
                              checked={nilaiKaryawan[item.id] === rating}
                              onChange={() => handleRatingChange(item.id, rating)}
                              className="h-4 w-4 cursor-pointer"
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
          </>
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
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={5}
            placeholder="Masukkan catatan Anda di sini..."
            disabled={isReadOnly}
          />
        </div>
      </CardSection>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          onClick={handleSimpanDraft}
          disabled={saving || !periodeAktif || isReadOnly}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Menyimpan..." : "Simpan Draft"}
        </button>

        <button
          onClick={handleKirimPenilaian}
          disabled={saving || !periodeAktif || isReadOnly || kriteria.length === 0}
          className="w-full rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-700 disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Memproses..." : "Kirim Penilaian"}
        </button>
      </div>
    </div>
  );
}