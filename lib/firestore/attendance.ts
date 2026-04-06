import { db } from '../firebase';
import {
  doc,
  collection,
  setDoc,
  getDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

export type AttendanceStatus = 'hadir' | 'sakit' | 'izin';

export interface AttendanceDoc {
  id: string;
  karyawanId: string;
  tanggal: string; // YYYY-MM-DD
  statusKehadiran: AttendanceStatus;
  createdAt?: any;
  updatedAt?: any;

  // alias kompatibilitas lama
  date?: string;
  status?: AttendanceStatus;
}

export interface AttendanceSummary {
  totalDays: number; // total hari kerja bulan itu
  presentDays: number;
  sickDays: number;
  permissionDays: number;
  absentDays: number;

  disciplinePercent: number;
  presentPercentage: number;
}

const ATTENDANCE_COLLECTION = 'absensi';

function sanitizeFirestorePayload<T extends Record<string, any>>(
  payload: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function formatDateKey(input: Date | string): string {
  if (typeof input === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Format tanggal harus YYYY-MM-DD atau Date valid');
    }

    return formatDateKey(parsed);
  }

  const yyyy = input.getFullYear();
  const mm = String(input.getMonth() + 1).padStart(2, '0');
  const dd = String(input.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function monthRange(year: number, month: number) {
  const mm = String(month).padStart(2, '0');
  const start = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function countWorkingDaysInMonth(year: number, month: number) {
  const totalDays = new Date(year, month, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const d = new Date(year, month - 1, day);
    if (d.getDay() !== 0) {
      workingDays += 1; // Minggu tidak dihitung
    }
  }

  return workingDays;
}

function normalizeAttendanceDoc(id: string, raw: any): AttendanceDoc {
  const tanggal = String(raw?.tanggal ?? raw?.date ?? '');
  const statusKehadiran = (raw?.statusKehadiran ?? raw?.status ?? 'hadir') as AttendanceStatus;

  return {
    id: String(raw?.id ?? id),
    karyawanId: String(raw?.karyawanId ?? ''),
    tanggal,
    statusKehadiran,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,

    // alias kompatibilitas lama
    date: tanggal,
    status: statusKehadiran,
  };
}

/**
 * Upsert absensi harian
 * Doc ID final: `${karyawanId}_${yyyy-mm-dd}`
 */
export async function upsertDailyAttendance(
  karyawanId: string,
  dateYYYYMMDD: string,
  status: AttendanceStatus
): Promise<void> {
  const tanggal = formatDateKey(dateYYYYMMDD);
  const docId = `${karyawanId}_${tanggal}`;
  const attendanceRef = doc(db, ATTENDANCE_COLLECTION, docId);

  const existingSnap = await getDoc(attendanceRef);

  const payload = sanitizeFirestorePayload({
    id: docId,
    karyawanId,
    tanggal,
    statusKehadiran: status,
    updatedAt: serverTimestamp(),
    ...(existingSnap.exists() ? {} : { createdAt: serverTimestamp() }),
  });

  await setDoc(attendanceRef, payload, { merge: true });
}

/**
 * Ambil ringkasan absensi bulanan
 * Query dibuat anti-index:
 * - hanya where('karyawanId' == ...)
 * - filter tanggal dilakukan di client
 */
export async function getAttendanceSummary(
  karyawanId: string,
  periodMonth: number,
  periodYear: number
): Promise<AttendanceSummary> {
  const { start, end } = monthRange(periodYear, periodMonth);

  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('karyawanId', '==', karyawanId)
  );

  const snap = await getDocs(q);

  const allRecords = snap.docs.map((d) => normalizeAttendanceDoc(d.id, d.data()));

  const monthRecords = allRecords
    .filter((r) => r.tanggal >= start && r.tanggal <= end)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  // deduplikasi by tanggal
  const byDate = new Map<string, AttendanceDoc>();
  monthRecords.forEach((item) => {
    byDate.set(item.tanggal, item);
  });

  const records = [...byDate.values()];
  const totalDays = countWorkingDaysInMonth(periodYear, periodMonth);

  const presentDays = records.filter((r) => r.statusKehadiran === 'hadir').length;
  const sickDays = records.filter((r) => r.statusKehadiran === 'sakit').length;
  const permissionDays = records.filter((r) => r.statusKehadiran === 'izin').length;

  const recordedDays = presentDays + sickDays + permissionDays;
  const absentDays = Math.max(totalDays - recordedDays, 0);

  const disciplinePercent =
    totalDays > 0 ? Number(((recordedDays / totalDays) * 100).toFixed(2)) : 0;

  const presentPercentage =
    totalDays > 0 ? Number(((presentDays / totalDays) * 100).toFixed(2)) : 0;

  return {
    totalDays,
    presentDays,
    sickDays,
    permissionDays,
    absentDays,
    disciplinePercent,
    presentPercentage,
  };
}

/**
 * Ambil seluruh record absensi karyawan dalam satu bulan
 * Query dibuat anti-index:
 * - hanya where('karyawanId' == ...)
 * - filter tanggal dan sorting di client
 */
export async function getEmployeeAttendanceRecords(
  karyawanId: string,
  periodMonth: number,
  periodYear: number
): Promise<AttendanceDoc[]> {
  const { start, end } = monthRange(periodYear, periodMonth);

  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('karyawanId', '==', karyawanId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => normalizeAttendanceDoc(d.id, d.data()))
    .filter((r) => r.tanggal >= start && r.tanggal <= end)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}