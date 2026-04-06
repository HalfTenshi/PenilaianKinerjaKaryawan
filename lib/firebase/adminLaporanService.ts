import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/firebase';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  countWorkdaysInclusive,
  toDateSafe as toDateSafeUtil,
  startOfDay as startOfDayUtil,
  isWeekend,
} from '@/lib/utils/attendanceWorkdays';

export type StatusPenilaian = 'draft' | 'dikirim' | 'dinilai';
export type StatusPeriode = 'aktif' | 'ditutup';
export type AttendanceStatus = 'hadir' | 'sakit' | 'izin';

export type PeriodePenilaian = {
  id: string;
  namaPeriode: string;
  status: StatusPeriode;

  mulai?: any;
  startDate?: any;
  tanggalMulai?: any;
  awal?: any;

  selesai?: any;
  endDate?: any;
  tanggalSelesai?: any;
  akhir?: any;

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
  updatedAt?: any;
};

export type PenilaianKinerja = {
  id: string;
  karyawanId: string;
  periodeId: string;

  nilaiKaryawan: Record<string, number>;
  catatanKaryawan?: string;

  nilaiAdmin: Record<string, number>;
  catatanAdmin?: string;

  totalNilai?: number;

  status: StatusPenilaian;
  createdAt?: any;
  updatedAt?: any;
};

export type Attendance = {
  id: string;
  karyawanId: string;
  tanggal: any;
  statusKehadiran?: AttendanceStatus;
  status?: AttendanceStatus;
  catatan?: string;
  createdAt?: any;
  updatedAt?: any;
};

function assertDb() {
  const db = getFirebaseDb();
  if (!db) {
    throw new Error('Firebase belum diinisialisasi (db null).');
  }
  return db;
}

function toDateSafe(v: any): Date | null {
  return toDateSafeUtil(v);
}

function startOfDay(d: Date): Date {
  return startOfDayUtil(d);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toMsAny(v: any): number {
  const d = toDateSafe(v);
  return d ? d.getTime() : 0;
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 5) return 5;
  return n;
}

function normalizeNilaiMap(raw?: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};

  if (!raw || typeof raw !== 'object') return result;

  for (const [key, value] of Object.entries(raw)) {
    result[key] = clampScore(value);
  }

  return result;
}

function getTanggalMulaiRaw(data: any) {
  return (
    data?.mulai ??
    data?.startDate ??
    data?.tanggalMulai ??
    data?.tanggalAwal ??
    data?.awal ??
    null
  );
}

function getTanggalSelesaiRaw(data: any) {
  return (
    data?.selesai ??
    data?.endDate ??
    data?.tanggalSelesai ??
    data?.tanggalAkhir ??
    data?.akhir ??
    null
  );
}

function mapPeriodeDoc(id: string, data: any): PeriodePenilaian {
  const mulai = getTanggalMulaiRaw(data);
  const selesai = getTanggalSelesaiRaw(data);

  return {
    id,
    namaPeriode: String(data?.namaPeriode ?? data?.nama ?? data?.name ?? '-'),
    status: data?.status === 'aktif' ? 'aktif' : 'ditutup',

    mulai,
    startDate: data?.startDate,
    tanggalMulai: data?.tanggalMulai,
    awal: data?.awal,

    selesai,
    endDate: data?.endDate,
    tanggalSelesai: data?.tanggalSelesai,
    akhir: data?.akhir,

    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

function mapKriteriaDoc(id: string, data: any): KriteriaPenilaian {
  return {
    id,
    periodeId: String(data?.periodeId ?? ''),
    namaKriteria: String(data?.namaKriteria ?? data?.nama ?? data?.name ?? '-'),
    bobot: Number(data?.bobot ?? 0),
    urutan: Number(data?.urutan ?? 0),
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

function mapKaryawanDoc(id: string, data: any): Karyawan {
  return {
    id,
    nama: String(data?.nama ?? '-'),
    nip: String(data?.nip ?? '-'),
    bagian: String(data?.bagian ?? '-'),
    jabatan: String(data?.jabatan ?? '-'),
    statusAktif: Boolean(data?.statusAktif ?? true),
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

function mapPenilaianDoc(id: string, data: any): PenilaianKinerja {
  const totalNilaiFinal =
    data?.totalNilai !== undefined && data?.totalNilai !== null
      ? Number(data.totalNilai)
      : data?.totalNilaiAdmin !== undefined && data?.totalNilaiAdmin !== null
      ? Number(data.totalNilaiAdmin)
      : undefined;

  return {
    id: String(data?.id ?? id),
    karyawanId: String(data?.karyawanId ?? ''),
    periodeId: String(data?.periodeId ?? ''),
    nilaiKaryawan: normalizeNilaiMap(data?.nilaiKaryawan),
    catatanKaryawan: String(data?.catatanKaryawan ?? ''),
    nilaiAdmin: normalizeNilaiMap(data?.nilaiAdmin),
    catatanAdmin: String(data?.catatanAdmin ?? ''),
    totalNilai: Number.isFinite(totalNilaiFinal) ? totalNilaiFinal : undefined,
    status:
      data?.status === 'dikirim' || data?.status === 'dinilai'
        ? data.status
        : 'draft',
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

/**
 * Ambil semua periode
 * Anti-index:
 * - tanpa orderBy server
 * - sort di client
 */
export async function getAllPeriode(): Promise<PeriodePenilaian[]> {
  const db = assertDb();

  const snap = await getDocs(
    query(collection(db, COLLECTIONS.PERIODE_PENILAIAN), limit(500))
  );

  const list = snap.docs.map((d) => mapPeriodeDoc(d.id, d.data()));

  list.sort((a, b) => {
    const aMs = toMsAny(a.mulai) || toMsAny(a.updatedAt) || toMsAny(a.createdAt);
    const bMs = toMsAny(b.mulai) || toMsAny(b.updatedAt) || toMsAny(b.createdAt);
    return bMs - aMs;
  });

  return list;
}

/**
 * Ambil periode aktif
 * Anti-index:
 * - hanya where status == aktif
 * - jika lebih dari satu, pilih terbaru di client
 */
export async function getPeriodeAktif(): Promise<PeriodePenilaian | null> {
  const db = assertDb();

  const snap = await getDocs(
    query(collection(db, COLLECTIONS.PERIODE_PENILAIAN), where('status', '==', 'aktif'))
  );

  if (snap.empty) return null;

  const list = snap.docs.map((d) => mapPeriodeDoc(d.id, d.data()));

  list.sort((a, b) => {
    const aMs = toMsAny(a.updatedAt) || toMsAny(a.createdAt) || toMsAny(a.mulai);
    const bMs = toMsAny(b.updatedAt) || toMsAny(b.createdAt) || toMsAny(b.mulai);
    return bMs - aMs;
  });

  return list[0] ?? null;
}

export async function getPeriodeById(
  periodeId: string
): Promise<PeriodePenilaian | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PERIODE_PENILAIAN, periodeId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return mapPeriodeDoc(snap.id, snap.data());
}

export async function getKaryawanById(
  karyawanId: string
): Promise<Karyawan | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.KARYAWAN, karyawanId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return mapKaryawanDoc(snap.id, snap.data());
}

/**
 * Ambil semua karyawan aktif
 * Anti-index: 1 where saja
 */
export async function getKaryawanAktif(): Promise<Karyawan[]> {
  const db = assertDb();

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.KARYAWAN),
      where('statusAktif', '==', true),
      limit(2000)
    )
  );

  return snap.docs
    .map((d) => mapKaryawanDoc(d.id, d.data()))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Ambil semua penilaian pada periode tertentu, tanpa filter status
 * Dipakai untuk hitung "sudah isi / belum isi"
 */
export async function getPenilaianByPeriodeAllStatus(
  periodeId: string
): Promise<PenilaianKinerja[]> {
  const db = assertDb();

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.PENILAIAN_KINERJA),
      where('periodeId', '==', periodeId),
      limit(2000)
    )
  );

  return snap.docs
    .map((d) => mapPenilaianDoc(d.id, d.data()))
    .sort((a, b) => {
      const aMs = toMsAny(a.updatedAt) || toMsAny(a.createdAt);
      const bMs = toMsAny(b.updatedAt) || toMsAny(b.createdAt);
      return bMs - aMs;
    });
}

/**
 * Ambil kriteria by periode
 * Anti-index:
 * - where('periodeId' == ...) saja
 * - sort di client
 */
export async function getKriteriaByPeriode(
  periodeId: string
): Promise<KriteriaPenilaian[]> {
  const db = assertDb();

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.KRITERIA_PENILAIAN),
      where('periodeId', '==', periodeId),
      limit(500)
    )
  );

  const list = snap.docs.map((d) => mapKriteriaDoc(d.id, d.data()));

  list.sort((a, b) => {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return a.namaKriteria.localeCompare(b.namaKriteria);
  });

  return list;
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
  const { nilai, kriteria } = params;
  if (!nilai) return 0;
  if (!kriteria.length) return 0;

  let total = 0;

  for (const k of kriteria) {
    const skor = clampScore(nilai[k.id]);
    const bobot = Number(k.bobot ?? 0);
    total += ((skor / 5) * 100) * (bobot / 100);
  }

  return round2(total);
}

/**
 * Laporan final:
 * - kalau ada periodeId => query 1 where periodeId, filter status di client
 * - kalau tidak ada periodeId => query 1 where status == dinilai
 *
 * Ini menghindari kombinasi where(status)+where(periodeId)
 */
export async function getPenilaianUntukLaporan(params: {
  periodeId?: string;
}): Promise<PenilaianKinerja[]> {
  const db = assertDb();

  let snap;
  if (params.periodeId) {
    snap = await getDocs(
      query(
        collection(db, COLLECTIONS.PENILAIAN_KINERJA),
        where('periodeId', '==', params.periodeId),
        limit(2000)
      )
    );
  } else {
    snap = await getDocs(
      query(
        collection(db, COLLECTIONS.PENILAIAN_KINERJA),
        where('status', '==', 'dinilai'),
        limit(2000)
      )
    );
  }

  let list = snap.docs.map((d) => mapPenilaianDoc(d.id, d.data()));

  if (params.periodeId) {
    list = list.filter(
      (item) => item.periodeId === params.periodeId && item.status === 'dinilai'
    );
  } else {
    list = list.filter((item) => item.status === 'dinilai');
  }

  list.sort((a, b) => {
    const aMs = toMsAny(a.updatedAt) || toMsAny(a.createdAt);
    const bMs = toMsAny(b.updatedAt) || toMsAny(b.createdAt);
    return bMs - aMs;
  });

  return list;
}

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
  const totalHariKerja = countWorkdaysInclusive({ start: startD, end: endD });

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.ABSENSI),
      where('karyawanId', '==', params.karyawanId),
      limit(2000)
    )
  );

  const uniqueByTanggal = new Map<string, AttendanceStatus>();

  snap.forEach((docu) => {
    const data = docu.data() as Attendance;

    const tgl = toDateSafe(data.tanggal);
    if (!tgl) return;

    const t = startOfDay(tgl);
    if (t < startD || t > endD) return;
    if (isWeekend(t)) return;

    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
      t.getDate()
    ).padStart(2, '0')}`;

    const st = data.statusKehadiran ?? data.status;

    if (st !== 'hadir' && st !== 'sakit' && st !== 'izin') {
      return;
    }

    uniqueByTanggal.set(key, st);
  });

  let hadirHari = 0;
  let sakitHari = 0;
  let izinHari = 0;

  uniqueByTanggal.forEach((st) => {
    if (st === 'hadir') hadirHari += 1;
    else if (st === 'sakit') sakitHari += 1;
    else if (st === 'izin') izinHari += 1;
  });

  const alphaHari = Math.max(totalHariKerja - (hadirHari + sakitHari + izinHari), 0);
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

export async function getPenilaianByDocId(
  docId: string
): Promise<PenilaianKinerja | null> {
  const db = assertDb();
  const ref = doc(db, COLLECTIONS.PENILAIAN_KINERJA, docId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return mapPenilaianDoc(snap.id, snap.data());
}