import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/firebase';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type {
  PeriodePenilaian,
  KriteriaPenilaian,
  Karyawan,
  PenilaianKinerja,
  Absensi,
  StatusPenilaian,
  StatusKehadiran,
} from '@/types/models';

export type { PeriodePenilaian, KriteriaPenilaian, Karyawan, PenilaianKinerja };

export type StatusPeriode = 'aktif' | 'ditutup';
export type AttendanceStatus = StatusKehadiran;

function assertDb() {
  const db = getFirebaseDb();
  if (!db) {
    throw new Error('Firebase belum diinisialisasi (db null).');
  }
  return db;
}

function toDateSafe(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSunday(d: Date) {
  return d.getDay() === 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNumberOrZero(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampNilai(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 5) return 5;
  return n;
}

function sanitizeNilaiMap(nilai?: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  if (!nilai || typeof nilai !== 'object') return result;

  for (const [key, value] of Object.entries(nilai)) {
    result[key] = clampNilai(value);
  }

  return result;
}

function hapusUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function getTanggalMulai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.mulai ??
    periode?.startDate ??
    periode?.tanggalMulai ??
    periode?.awal ??
    null
  );
}

function getTanggalSelesai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.selesai ??
    periode?.endDate ??
    periode?.tanggalSelesai ??
    periode?.akhir ??
    null
  );
}

function getStatusKehadiran(data: Partial<Absensi>): AttendanceStatus | null {
  const status = data.statusKehadiran ?? data.status;
  if (status === 'hadir' || status === 'sakit' || status === 'izin') {
    return status;
  }
  return null;
}

function sortPeriodeDesc(a: PeriodePenilaian, b: PeriodePenilaian) {
  const aDate = toDateSafe(getTanggalMulai(a)) ?? new Date(0);
  const bDate = toDateSafe(getTanggalMulai(b)) ?? new Date(0);
  return bDate.getTime() - aDate.getTime();
}

function sortKriteriaAsc(a: KriteriaPenilaian, b: KriteriaPenilaian) {
  return toNumberOrZero(a.urutan) - toNumberOrZero(b.urutan);
}

/** Ambil semua periode (sort client, tanpa orderBy Firestore) */
export async function getAllPeriode(): Promise<PeriodePenilaian[]> {
  const db = assertDb();
  const snap = await getDocs(collection(db, COLLECTIONS.PERIODE_PENILAIAN));

  const items = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PeriodePenilaian, 'id'>),
  }));

  items.sort(sortPeriodeDesc);
  return items;
}

/** Ambil periode aktif */
export async function getPeriodeAktif(): Promise<PeriodePenilaian | null> {
  const db = assertDb();

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.PERIODE_PENILAIAN),
      where('status', '==', 'aktif'),
      limit(10)
    )
  );

  if (snap.empty) return null;

  const items = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PeriodePenilaian, 'id'>),
  }));

  items.sort(sortPeriodeDesc);

  return items[0] ?? null;
}

/**
 * Ambil list penilaian
 * Anti-composite-index:
 * - kalau ada periodeId, query pakai periodeId saja
 * - kalau tidak ada periodeId tapi ada status, query pakai status saja
 * - filter sisanya di client
 */
export async function getPenilaianList(params: {
  periodeId?: string;
  status?: 'semua' | StatusPenilaian;
}): Promise<PenilaianKinerja[]> {
  const db = assertDb();
  const colRef = collection(db, COLLECTIONS.PENILAIAN_KINERJA);

  let snap;
  if (params.periodeId) {
    snap = await getDocs(query(colRef, where('periodeId', '==', params.periodeId)));
  } else if (params.status && params.status !== 'semua') {
    snap = await getDocs(query(colRef, where('status', '==', params.status)));
  } else {
    snap = await getDocs(colRef);
  }

  const items = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PenilaianKinerja, 'id'>),
  }));

  return items.filter((item) => {
    if (params.periodeId && item.periodeId !== params.periodeId) return false;
    if (params.status && params.status !== 'semua' && item.status !== params.status) {
      return false;
    }
    return true;
  });
}

export async function getKaryawanById(karyawanId: string): Promise<Karyawan | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.KARYAWAN, karyawanId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<Karyawan, 'id'>),
  };
}

export async function getPeriodeById(periodeId: string): Promise<PeriodePenilaian | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PERIODE_PENILAIAN, periodeId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<PeriodePenilaian, 'id'>),
  };
}

/**
 * Ambil kriteria berdasarkan periode
 * Anti-index:
 * - query hanya where('periodeId')
 * - sorting urutan dilakukan di client
 */
export async function getKriteriaByPeriode(
  periodeId: string
): Promise<KriteriaPenilaian[]> {
  const db = assertDb();

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.KRITERIA_PENILAIAN),
      where('periodeId', '==', periodeId)
    )
  );

  const items = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<KriteriaPenilaian, 'id'>),
  }));

  items.sort(sortKriteriaAsc);
  return items;
}

export async function getPenilaianByDocId(
  docId: string
): Promise<PenilaianKinerja | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PENILAIAN_KINERJA, docId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<PenilaianKinerja, 'id'>),
  };
}

/**
 * Rumus final wajib:
 * total = Σ ( (nilai/5) * 100 * (bobot/100) )
 * return 2 desimal
 */
export function hitungNilaiAkhir(params: {
  nilai: Record<string, number> | undefined;
  kriteria: KriteriaPenilaian[];
}): number {
  const nilai = sanitizeNilaiMap(params.nilai);
  const kriteria = params.kriteria ?? [];

  if (!kriteria.length) return 0;

  let total = 0;

  for (const item of kriteria) {
    const skor = clampNilai(nilai[item.id] ?? 0);
    const bobot = toNumberOrZero(item.bobot);

    total += ((skor / 5) * 100) * (bobot / 100);
  }

  return round2(total);
}

/**
 * Summary absensi final:
 * - Hari kerja: Senin–Sabtu
 * - Minggu tidak dihitung
 * - Alpha tidak disimpan, dihitung otomatis
 * - Query Firestore anti-index: where('karyawanId') lalu filter tanggal di client
 */
export async function getAttendanceSummary(params: {
  karyawanId: string;
  mulai: any;
  selesai: any;
}): Promise<{
  totalHari: number;
  hadirHari: number;
  sakitHari: number;
  izinHari: number;
  alphaHari: number;
  hadirPersen: number;
  sakitIzinPersen: number;
}> {
  const db = assertDb();

  const start = toDateSafe(params.mulai);
  const end = toDateSafe(params.selesai);

  if (!start || !end) {
    return {
      totalHari: 0,
      hadirHari: 0,
      sakitHari: 0,
      izinHari: 0,
      alphaHari: 0,
      hadirPersen: 0,
      sakitIzinPersen: 0,
    };
  }

  const startD = startOfDay(start);
  const endD = startOfDay(end);

  let totalHariKerja = 0;
  const cur = new Date(startD);

  while (cur <= endD) {
    if (!isSunday(cur)) {
      totalHariKerja += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.ABSENSI),
      where('karyawanId', '==', params.karyawanId),
      limit(2000)
    )
  );

  let hadirHari = 0;
  let sakitHari = 0;
  let izinHari = 0;

  snap.forEach((d) => {
    const data = d.data() as Absensi;
    const tgl = toDateSafe(data.tanggal);
    if (!tgl) return;

    const tanggalOnly = startOfDay(tgl);

    if (tanggalOnly < startD || tanggalOnly > endD) return;
    if (isSunday(tanggalOnly)) return;

    const st = getStatusKehadiran(data);

    if (st === 'hadir') hadirHari += 1;
    else if (st === 'sakit') sakitHari += 1;
    else if (st === 'izin') izinHari += 1;
  });

  const alphaHari = Math.max(
    totalHariKerja - (hadirHari + sakitHari + izinHari),
    0
  );

  const hadirPersen = totalHariKerja
    ? Math.round((hadirHari / totalHariKerja) * 100)
    : 0;

  const sakitIzinPersen = totalHariKerja
    ? Math.round(((sakitHari + izinHari) / totalHariKerja) * 100)
    : 0;

  return {
    totalHari: totalHariKerja,
    hadirHari,
    sakitHari,
    izinHari,
    alphaHari,
    hadirPersen,
    sakitIzinPersen,
  };
}

/**
 * Submit evaluasi admin
 * FINAL:
 * - simpan nilaiAdmin
 * - simpan catatanAdmin
 * - simpan totalNilai
 * - status = 'dinilai'
 * - jangan kirim undefined ke Firestore
 *
 * Catatan:
 * totalNilai dihitung otomatis dari nilaiAdmin + bobot kriteria.
 * Kalau caller masih mengirim totalNilai / totalNilaiAdmin, tetap aman
 * karena file ini akan memakai nilai yang valid dan menyimpan ke field final: totalNilai
 */
export async function submitEvaluasiAdmin(params: {
  penilaianId: string;
  nilaiAdmin: Record<string, number>;
  catatanAdmin: string;
  totalNilai?: number;
  totalNilaiAdmin?: number;
}) {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PENILAIAN_KINERJA, params.penilaianId);

  const penilaianSnap = await getDoc(ref);
  if (!penilaianSnap.exists()) {
    throw new Error('Data penilaian tidak ditemukan.');
  }

  const penilaian = {
    id: penilaianSnap.id,
    ...(penilaianSnap.data() as Omit<PenilaianKinerja, 'id'>),
  } as PenilaianKinerja;

  const kriteria = await getKriteriaByPeriode(penilaian.periodeId);
  const safeNilaiAdmin = sanitizeNilaiMap(params.nilaiAdmin);

  const totalDariRumus = hitungNilaiAkhir({
    nilai: safeNilaiAdmin,
    kriteria,
  });

  const fallbackTotal = toNumberOrZero(params.totalNilai ?? params.totalNilaiAdmin);
  const totalNilai = round2(totalDariRumus || fallbackTotal);

  const payload = hapusUndefined({
    nilaiAdmin: safeNilaiAdmin,
    catatanAdmin: params.catatanAdmin ?? '',
    totalNilai,
    status: 'dinilai' as StatusPenilaian,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(ref, payload);
}