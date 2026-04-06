import {
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  limit,
  QueryConstraint,
} from 'firebase/firestore';
import {
  getPeriodeRef,
  getKriteriaRef,
  getPenilaianRef,
  getAbsensiRef,
  COLLECTIONS,
} from './collections';
import { getFirebaseDb } from './firebase';
import type {
  PeriodePenilaian,
  KriteriaPenilaian,
  PenilaianKinerja,
  Absensi,
  Karyawan,
  StatusKehadiran,
} from '@/types/models';

function assertDb() {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');
  return db;
}

function hapusUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
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
    // format YYYY-MM-DD
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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatTanggalLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clampNilai(value: any) {
  const n = Number(value);
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function getPeriodeMulai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.mulai ??
    periode?.startDate ??
    periode?.tanggalMulai ??
    periode?.awal ??
    null
  );
}

function getPeriodeSelesai(periode: Partial<PeriodePenilaian> | null | undefined) {
  return (
    periode?.selesai ??
    periode?.endDate ??
    periode?.tanggalSelesai ??
    periode?.akhir ??
    null
  );
}

function sortPeriodeDesc(a: PeriodePenilaian, b: PeriodePenilaian) {
  const aDate = toDateSafe(getPeriodeMulai(a)) ?? new Date(0);
  const bDate = toDateSafe(getPeriodeMulai(b)) ?? new Date(0);
  return bDate.getTime() - aDate.getTime();
}

function sortKriteriaAsc(a: KriteriaPenilaian, b: KriteriaPenilaian) {
  return (a.urutan ?? 0) - (b.urutan ?? 0);
}

function sortByUpdatedAtDesc<T extends { updatedAt?: any; createdAt?: any }>(a: T, b: T) {
  const aDate =
    toDateSafe(a.updatedAt) ??
    toDateSafe(a.createdAt) ??
    new Date(0);

  const bDate =
    toDateSafe(b.updatedAt) ??
    toDateSafe(b.createdAt) ??
    new Date(0);

  return bDate.getTime() - aDate.getTime();
}

function hitungNilaiAkhir(
  nilai: Record<string, number>,
  kriteria: KriteriaPenilaian[]
): number {
  let total = 0;

  for (const item of kriteria) {
    const skor = clampNilai(nilai[item.id] ?? 0);
    const bobot = Number(item.bobot ?? 0);

    total += ((skor / 5) * 100) * (bobot / 100);
  }

  return round2(total);
}

function ambilStatusKehadiran(absensi: Partial<Absensi>): StatusKehadiran | null {
  const status = absensi.statusKehadiran ?? absensi.status;

  if (status === 'hadir' || status === 'sakit' || status === 'izin') {
    return status;
  }

  return null;
}

async function getAttendanceSummaryInternal(params: {
  karyawanId: string;
  mulai?: any;
  selesai?: any;
}) {
  const db = assertDb();

  const mulai = toDateSafe(params.mulai);
  const selesai = toDateSafe(params.selesai);

  const snap = await getDocs(
    query(
      getAbsensiRef(),
      where('karyawanId', '==', params.karyawanId),
      limit(2000)
    )
  );

  if (!mulai || !selesai) {
    let hadirHari = 0;
    let sakitHari = 0;
    let izinHari = 0;

    snap.forEach((docSnap) => {
      const data = docSnap.data() as Absensi;
      const status = ambilStatusKehadiran(data);

      if (status === 'hadir') hadirHari += 1;
      if (status === 'sakit') sakitHari += 1;
      if (status === 'izin') izinHari += 1;
    });

    const totalData = hadirHari + sakitHari + izinHari;

    return {
      totalHariKerja: totalData,
      hadirHari,
      sakitHari,
      izinHari,
      alphaHari: 0,
      persentaseAbsensi: totalData > 0 ? round2((hadirHari / totalData) * 100) : 0,
    };
  }

  const start = startOfDay(mulai);
  const end = startOfDay(selesai);

  let totalHariKerja = 0;
  const walker = new Date(start);

  while (walker <= end) {
    // Minggu = 0
    if (walker.getDay() !== 0) {
      totalHariKerja += 1;
    }
    walker.setDate(walker.getDate() + 1);
  }

  let hadirHari = 0;
  let sakitHari = 0;
  let izinHari = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data() as Absensi;
    const tanggal = toDateSafe(data.tanggal);
    if (!tanggal) return;

    const onlyDate = startOfDay(tanggal);
    if (onlyDate < start || onlyDate > end) return;
    if (onlyDate.getDay() === 0) return;

    const status = ambilStatusKehadiran(data);

    if (status === 'hadir') hadirHari += 1;
    if (status === 'sakit') sakitHari += 1;
    if (status === 'izin') izinHari += 1;
  });

  const alphaHari = Math.max(totalHariKerja - (hadirHari + sakitHari + izinHari), 0);

  return {
    totalHariKerja,
    hadirHari,
    sakitHari,
    izinHari,
    alphaHari,
    persentaseAbsensi:
      totalHariKerja > 0 ? round2((hadirHari / totalHariKerja) * 100) : 0,
  };
}

// Periode Penilaian
export async function getPeriodeAktif(): Promise<PeriodePenilaian | null> {
  const snapshot = await getDocs(
    query(getPeriodeRef(), where('status', '==', 'aktif'), limit(10))
  );

  if (snapshot.empty) return null;

  const data = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<PeriodePenilaian, 'id'>),
  }));

  data.sort(sortPeriodeDesc);

  return data[0] ?? null;
}

export async function listKriteriaByPeriode(
  periodeId: string
): Promise<KriteriaPenilaian[]> {
  const snapshot = await getDocs(
    query(getKriteriaRef(), where('periodeId', '==', periodeId))
  );

  const data = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<KriteriaPenilaian, 'id'>),
  }));

  data.sort(sortKriteriaAsc);

  return data;
}

// Absensi
export async function upsertAbsensiHarian(
  karyawanId: string,
  tanggal: Date,
  statusKehadiran: StatusKehadiran,
  _keterangan?: string
) {
  const db = assertDb();

  const tanggalId = formatTanggalLocal(tanggal);
  const docId = `${karyawanId}_${tanggalId}`;
  const docRef = doc(db, COLLECTIONS.ABSENSI, docId);
  const existing = await getDoc(docRef);

  if (existing.exists()) {
    const payload = hapusUndefined({
      karyawanId,
      tanggal: tanggalId,
      statusKehadiran,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(docRef, payload);
    return;
  }

  const absensi: Partial<Absensi> = hapusUndefined({
    id: docId,
    karyawanId,
    tanggal: tanggalId,
    statusKehadiran,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(docRef, absensi);
}

// Penilaian Kinerja
export async function saveDraftPenilaian(
  karyawanId: string,
  periodeId: string,
  nilaiKaryawan: Record<string, number>,
  catatanKaryawan: string
) {
  const db = assertDb();

  const penilaianId = `${karyawanId}_${periodeId}`;
  const docRef = doc(db, COLLECTIONS.PENILAIAN_KINERJA, penilaianId);
  const existing = await getDoc(docRef);

  const safeNilaiKaryawan = sanitizeNilaiMap(nilaiKaryawan);

  if (!existing.exists()) {
    const penilaian: Partial<PenilaianKinerja> = hapusUndefined({
      id: penilaianId,
      periodeId,
      karyawanId,
      status: 'draft',
      nilaiKaryawan: safeNilaiKaryawan,
      catatanKaryawan: catatanKaryawan ?? '',
      nilaiAdmin: {},
      catatanAdmin: '',
      totalNilai: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(docRef, penilaian);
    return;
  }

  const payload = hapusUndefined({
    nilaiKaryawan: safeNilaiKaryawan,
    catatanKaryawan: catatanKaryawan ?? '',
    updatedAt: serverTimestamp(),
  });

  await updateDoc(docRef, payload);
}

export async function submitPenilaian(karyawanId: string, periodeId: string) {
  const db = assertDb();

  const penilaianId = `${karyawanId}_${periodeId}`;
  const docRef = doc(db, COLLECTIONS.PENILAIAN_KINERJA, penilaianId);
  const existing = await getDoc(docRef);

  if (!existing.exists()) {
    throw new Error('Penilaian tidak ditemukan');
  }

  await updateDoc(
    docRef,
    hapusUndefined({
      status: 'dikirim',
      updatedAt: serverTimestamp(),
    })
  );
}

export async function adminListPenilaian(
  filters?: {
    periodeId?: string;
    status?: string;
    search?: string;
  }
): Promise<(PenilaianKinerja & { karyawanNama: string })[]> {
  const db = assertDb();

  /**
   * Anti-composite-index:
   * - hanya query 1 filter Firestore
   * - filter sisanya dilakukan di client
   */
  const constraints: QueryConstraint[] = [];

  if (filters?.periodeId) {
    constraints.push(where('periodeId', '==', filters.periodeId));
  } else if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const snapshot = constraints.length
    ? await getDocs(query(getPenilaianRef(), ...constraints))
    : await getDocs(getPenilaianRef());

  const rawData = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<PenilaianKinerja, 'id'>),
  }));

  const filteredByClient = rawData.filter((item) => {
    if (filters?.periodeId && item.periodeId !== filters.periodeId) return false;
    if (filters?.status && item.status !== filters.status) return false;
    return true;
  });

  const results = await Promise.all(
    filteredByClient.map(async (penilaian) => {
      const karyawanDocRef = doc(db, COLLECTIONS.KARYAWAN, penilaian.karyawanId);
      const karyawanDocSnap = await getDoc(karyawanDocRef);

      const karyawanNama = karyawanDocSnap.exists()
        ? String((karyawanDocSnap.data() as Karyawan).nama ?? 'Unknown')
        : 'Unknown';

      return {
        ...penilaian,
        karyawanNama,
      };
    })
  );

  const search = filters?.search?.trim().toLowerCase();

  const finalResults = results.filter((item) => {
    if (!search) return true;
    return item.karyawanNama.toLowerCase().includes(search);
  });

  finalResults.sort(sortByUpdatedAtDesc);

  return finalResults;
}

export async function adminEvaluatePenilaian(
  penilaianId: string,
  nilaiAdmin: Record<string, number>,
  catatanAdmin: string
) {
  const db = assertDb();

  const docRef = doc(db, COLLECTIONS.PENILAIAN_KINERJA, penilaianId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Penilaian tidak ditemukan');
  }

  const penilaian = {
    id: docSnap.id,
    ...(docSnap.data() as Omit<PenilaianKinerja, 'id'>),
  } as PenilaianKinerja;

  const kriteria = await listKriteriaByPeriode(penilaian.periodeId);
  const safeNilaiAdmin = sanitizeNilaiMap(nilaiAdmin);
  const totalNilai = hitungNilaiAkhir(safeNilaiAdmin, kriteria);

  await updateDoc(
    docRef,
    hapusUndefined({
      nilaiAdmin: safeNilaiAdmin,
      catatanAdmin: catatanAdmin ?? '',
      totalNilai,
      status: 'dinilai',
      updatedAt: serverTimestamp(),
    })
  );
}

// Laporan
export async function laporanRekap(filters?: {
  periode?: string;
  divisi?: string;
  search?: string;
}) {
  const db = assertDb();

  /**
   * Anti-composite-index:
   * - hanya query 1 field di Firestore
   * - filter sisanya di client
   */
  const penilaianSnapshot = filters?.periode
    ? await getDocs(query(getPenilaianRef(), where('periodeId', '==', filters.periode)))
    : await getDocs(getPenilaianRef());

  const penilaianList = penilaianSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<PenilaianKinerja, 'id'>),
  })) as PenilaianKinerja[];

  const results = [];

  for (const penilaian of penilaianList) {
    if (filters?.periode && penilaian.periodeId !== filters.periode) {
      continue;
    }

    const karyawanDocRef = doc(db, COLLECTIONS.KARYAWAN, penilaian.karyawanId);
    const karyawanDocSnap = await getDoc(karyawanDocRef);

    if (!karyawanDocSnap.exists()) continue;

    const karyawan = {
      id: karyawanDocSnap.id,
      ...(karyawanDocSnap.data() as Omit<Karyawan, 'id'>),
    } as Karyawan;

    if (filters?.divisi && karyawan.bagian !== filters.divisi) continue;

    if (
      filters?.search &&
      !karyawan.nama.toLowerCase().includes(filters.search.toLowerCase())
    ) {
      continue;
    }

    let periode: PeriodePenilaian | null = null;
    const periodeDocRef = doc(db, COLLECTIONS.PERIODE_PENILAIAN, penilaian.periodeId);
    const periodeDocSnap = await getDoc(periodeDocRef);

    if (periodeDocSnap.exists()) {
      periode = {
        id: periodeDocSnap.id,
        ...(periodeDocSnap.data() as Omit<PeriodePenilaian, 'id'>),
      };
    }

    const summary = await getAttendanceSummaryInternal({
      karyawanId: penilaian.karyawanId,
      mulai: getPeriodeMulai(periode),
      selesai: getPeriodeSelesai(periode),
    });

    results.push({
      penilaian,
      karyawan,
      periode,
      absensiHadir: summary.hadirHari,
      absensiSakit: summary.sakitHari,
      absensiIzin: summary.izinHari,
      absensiAlpha: summary.alphaHari,
      totalHariKerja: summary.totalHariKerja,
      persentaseAbsensi: summary.persentaseAbsensi,
    });
  }

  results.sort((a, b) => sortByUpdatedAtDesc(a.penilaian, b.penilaian));

  return results;
}