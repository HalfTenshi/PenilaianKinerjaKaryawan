// src/lib/utils/attendanceWorkdays.ts

export type AttendanceStatus = 'hadir' | 'sakit' | 'izin' | 'alpha';

/**
 * Ubah value tanggal Firestore ke Date.
 * Support: Timestamp (toDate), Date, string 'YYYY-MM-DD'
 */
export function toDateSafe(v: any): Date | null {
  if (!v) return null;

  // Firestore Timestamp
  if (typeof v?.toDate === 'function') return v.toDate();

  // JS Date
  if (v instanceof Date) return v;

  // string YYYY-MM-DD
  if (typeof v === 'string') {
    const parts = v.split('-');
    if (parts.length === 3) {
      const yy = Number(parts[0]);
      const mm = Number(parts[1]);
      const dd = Number(parts[2]);
      if (Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)) {
        return new Date(yy, mm - 1, dd);
      }
    }
  }

  return null;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  // 0 = Minggu → libur
  return day === 0;
}

/**
 * Hitung jumlah hari kerja (Mon-Fri) di range start..end inclusive.
 * Opsional: holidays = array string 'YYYY-MM-DD' yang dianggap libur (exclude dari hari kerja).
 */
export function countWorkdaysInclusive(params: {
  start: Date;
  end: Date;
  holidays?: string[];
}): number {
  const startD = startOfDay(params.start);
  const endD = startOfDay(params.end);

  if (endD < startD) return 0;

  const holidaySet = new Set((params.holidays ?? []).map(String));

  let count = 0;
  const cur = new Date(startD);

  while (cur <= endD) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;

    if (!isWeekend(cur) && !holidaySet.has(key)) {
      count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return count;
}