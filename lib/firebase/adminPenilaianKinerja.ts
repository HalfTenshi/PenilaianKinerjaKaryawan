// src/lib/firebase/adminPenilaianKinerja.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/firebase';
import { COLLECTIONS } from '@/lib/firebase/collections';

export type StatusPeriode = 'aktif' | 'ditutup';
export type StatusPenilaian = 'draft' | 'dikirim' | 'dinilai';

export type PeriodePenilaian = {
  id: string;
  namaPeriode: string;
  status: StatusPeriode;
  mulai: any; // Timestamp | Date | string
  selesai: any;
  createdAt?: any;
  updatedAt?: any;
};

export type KriteriaPenilaian = {
  id: string;
  periodeId: string;
  namaKriteria: string;
  bobot: number;
  urutan: number;
  createdAt?: any;
  updatedAt?: any;
};

export type Karyawan = {
  id: string;
  nama: string;
  nip: string;
  bagian: string;
  jabatan: string;
  statusAktif: boolean;
  createdAt?: any;
};

export type PenilaianKinerja = {
  id: string; // docId = `${karyawanId}_${periodeId}`
  karyawanId: string;
  periodeId: string;

  nilaiKaryawan: Record<string, number>;
  catatanKaryawan?: string;

  nilaiAdmin: Record<string, number>;
  catatanAdmin: string;

  // ✅ optional cached totals (biar list/laporan sinkron & cepat)
  totalNilaiKaryawan?: number;
  totalNilaiAdmin?: number;

  status: StatusPenilaian;
  createdAt?: any;
  updatedAt?: any;
};

// ✅ Absensi FINAL (sesuai dashboard karyawan)
export type AttendanceStatus = 'hadir' | 'sakit' | 'izin';

export type Attendance = {
  id: string; // `${karyawanId}_${yyyy-mm-dd}`
  karyawanId: string;
  tanggal: any; // string 'YYYY-MM-DD' | Timestamp | Date
  statusKehadiran?: AttendanceStatus;
  status?: AttendanceStatus; // fallback data lama
  catatan?: string;
  createdAt?: any;
  updatedAt?: any;
};

function assertDb() {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase belum diinisialisasi (db null).');
  return db;
}

/**
 * Ubah value tanggal Firestore ke Date.
 * Support: Timestamp (toDate), Date, string 'YYYY-MM-DD', ISO string
 */
function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;

  if (typeof v === 'string') {
    // 'YYYY-MM-DD'
    const parts = v.split('-');
    if (parts.length === 3 && !v.includes('T')) {
      const yy = Number(parts[0]);
      const mm = Number(parts[1]);
      const dd = Number(parts[2]);
      if (Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)) {
        return new Date(yy, mm - 1, dd);
      }
    }

    // ISO
    if (v.includes('T')) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
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

function toNumberOrZero(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Ambil semua periode */
export async function getAllPeriode(): Promise<PeriodePenilaian[]> {
  const db = assertDb();
  const q = query(collection(db, COLLECTIONS.PERIODE_PENILAIAN), orderBy('mulai', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** Ambil periode aktif */
export async function getPeriodeAktif(): Promise<PeriodePenilaian | null> {
  const db = assertDb();
  const q = query(
    collection(db, COLLECTIONS.PERIODE_PENILAIAN),
    where('status', '==', 'aktif'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as any) };
}

/** Ambil penilaian list */
export async function getPenilaianList(params: {
  periodeId?: string;
  status?: 'semua' | StatusPenilaian;
}): Promise<PenilaianKinerja[]> {
  const db = assertDb();

  const colRef = collection(db, COLLECTIONS.PENILAIAN_KINERJA);
  const wheres: any[] = [];

  if (params.periodeId) wheres.push(where('periodeId', '==', params.periodeId));
  if (params.status && params.status !== 'semua') wheres.push(where('status', '==', params.status));

  const q = wheres.length ? query(colRef, ...wheres) : query(colRef);
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function getKaryawanById(karyawanId: string): Promise<Karyawan | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.KARYAWAN, karyawanId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
}

export async function getPeriodeById(periodeId: string): Promise<PeriodePenilaian | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PERIODE_PENILAIAN, periodeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
}

/**
 * Ambil kriteria by periode
 * NOTE: where + orderBy bisa butuh index; kalau mau anti-index, hapus orderBy lalu sort client.
 */
export async function getKriteriaByPeriode(periodeId: string): Promise<KriteriaPenilaian[]> {
  const db = assertDb();
  const q = query(
    collection(db, COLLECTIONS.KRITERIA_PENILAIAN),
    where('periodeId', '==', periodeId),
    orderBy('urutan', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function getPenilaianByDocId(docId: string): Promise<PenilaianKinerja | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PENILAIAN_KINERJA, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
}

/**
 * Nilai akhir berbobot (0..5) → skala 0..100
 * total = sum((nilai/5)*100*(bobot/100))
 */
export function hitungNilaiAkhir(params: {
  nilai: Record<string, number> | undefined;
  kriteria: KriteriaPenilaian[];
}): number {
  const { nilai, kriteria } = params;
  if (!nilai) return 0;
  if (!kriteria.length) return 0;

  let total = 0;
  for (const k of kriteria) {
    const v = typeof nilai[k.id] === 'number' ? nilai[k.id] : 0; // 0..5
    const bobot = typeof k.bobot === 'number' ? k.bobot : 0;
    total += (v / 5) * 100 * (bobot / 100);
  }
  return round2(total);
}

/**
 * Attendance summary sinkron aturan final:
 * - Hari kerja: Senin–Sabtu
 * - Minggu libur
 * - Alpha otomatis
 * - Query anti-index: where('karyawanId'), range difilter client
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

  // total hari kerja (Senin–Sabtu)
  let totalHariKerja = 0;
  const cur = new Date(startD);
  while (cur <= endD) {
    if (!isSunday(cur)) totalHariKerja += 1;
    cur.setDate(cur.getDate() + 1);
  }

  // query absensi by karyawanId (anti-index)
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
    const data = d.data() as any as Attendance;

    const tgl = toDateSafe(data.tanggal);
    if (!tgl) return;

    const t = startOfDay(tgl);
    if (t < startD || t > endD) return;

    if (isSunday(t)) return;

    const st = (data.statusKehadiran ?? data.status) as AttendanceStatus | undefined;

    if (st === 'hadir') hadirHari += 1;
    else if (st === 'sakit') sakitHari += 1;
    else if (st === 'izin') izinHari += 1;
  });

  const alphaHari = Math.max(totalHariKerja - (hadirHari + sakitHari + izinHari), 0);

  const hadirPersen = totalHariKerja ? Math.round((hadirHari / totalHariKerja) * 100) : 0;
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
 * ✅ SUBMIT evaluasi admin (FIX undefined)
 * - simpan nilaiAdmin + catatanAdmin
 * - simpan totalNilaiAdmin (cached)
 * - optional: simpan totalNilaiKaryawan juga (cached) agar LIST/LAPORAN sinkron
 */
export async function submitEvaluasiAdmin(params: {
  penilaianId: string;
  nilaiAdmin: Record<string, number>;
  catatanAdmin: string;
  totalNilaiAdmin?: number; // ✅ optional biar fleksibel
  totalNilaiKaryawan?: number; // ✅ optional
}) {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PENILAIAN_KINERJA, params.penilaianId);

  // ✅ Firestore tidak boleh undefined
  const safeTotalAdmin = round2(toNumberOrZero(params.totalNilaiAdmin));
  const safeTotalKaryawan =
    params.totalNilaiKaryawan === undefined ? undefined : round2(toNumberOrZero(params.totalNilaiKaryawan));

  const payload: any = {
    nilaiAdmin: params.nilaiAdmin ?? {},
    catatanAdmin: params.catatanAdmin ?? '',
    totalNilaiAdmin: safeTotalAdmin,
    status: 'dinilai',
    updatedAt: serverTimestamp(),
  };

  // hanya set kalau dikirim, biar gak overwrite sembarangan
  if (safeTotalKaryawan !== undefined) payload.totalNilaiKaryawan = safeTotalKaryawan;

  const batch = writeBatch(db);
  batch.update(ref, payload);
  await batch.commit();
}