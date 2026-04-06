import { collection, CollectionReference } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import type {
  Pengguna,
  Karyawan,
  PeriodePenilaian,
  KriteriaPenilaian,
  PenilaianKinerja,
  Absensi,
} from '@/types/models';

export const COLLECTIONS = {
  PENGGUNA: 'pengguna',
  KARYAWAN: 'karyawan',
  PERIODE_PENILAIAN: 'periode_penilaian',
  KRITERIA_PENILAIAN: 'kriteria_penilaian',
  PENILAIAN_KINERJA: 'penilaian_kinerja',
  ABSENSI: 'absensi',
} as const;

// helper internal
function getDb() {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase belum terinisialisasi');
  return db;
}

// helper generic (opsional, tapi enak buat file lain)
export function getCollectionRef<T>(namaKoleksi: string) {
  return collection(getDb(), namaKoleksi) as CollectionReference<T>;
}

export function getPenggunaRef(): CollectionReference<Pengguna> {
  return getCollectionRef<Pengguna>(COLLECTIONS.PENGGUNA);
}

export function getKaryawanRef(): CollectionReference<Karyawan> {
  return getCollectionRef<Karyawan>(COLLECTIONS.KARYAWAN);
}

export function getPeriodeRef(): CollectionReference<PeriodePenilaian> {
  return getCollectionRef<PeriodePenilaian>(COLLECTIONS.PERIODE_PENILAIAN);
}

export function getKriteriaRef(): CollectionReference<KriteriaPenilaian> {
  return getCollectionRef<KriteriaPenilaian>(COLLECTIONS.KRITERIA_PENILAIAN);
}

export function getPenilaianRef(): CollectionReference<PenilaianKinerja> {
  return getCollectionRef<PenilaianKinerja>(COLLECTIONS.PENILAIAN_KINERJA);
}

export function getAbsensiRef(): CollectionReference<Absensi> {
  return getCollectionRef<Absensi>(COLLECTIONS.ABSENSI);
}