import {
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import {
  getPeriodeRef,
  getKriteriaRef,
  getPenilaianRef,
  getAbsensiRef,
  getKaryawanRef,
  COLLECTIONS,
} from './collections';
import { getFirebaseDb } from './firebase';
import {
  PeriodePenilaian,
  KriteriaPenilaian,
  PenilaianKinerja,
  Absensi,
  Karyawan,
} from '@/types/models';

// Periode Penilaian
export async function getPeriodeAktif(): Promise<PeriodePenilaian | null> {
  const q = query(getPeriodeRef(), where('status', '==', 'aktif'));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

export async function listKriteriaByPeriode(periodeId: string): Promise<KriteriaPenilaian[]> {
  const q = query(getKriteriaRef(), where('periodeId', '==', periodeId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

// Absensi
export async function upsertAbsensiHarian(
  karyawanId: string,
  tanggal: Date,
  status: 'hadir' | 'sakit' | 'izin',
  keterangan?: string
) {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  const dateStr = tanggal.toISOString().split('T')[0];
  const docId = `${karyawanId}_${dateStr}`;

  const absensi: Absensi = {
    id: docId,
    karyawanId,
    tanggal,
    status,
    keterangan,
  };

  await setDoc(doc(db, COLLECTIONS.ABSENSI, docId), absensi);
}

// Penilaian Kinerja
export async function saveDraftPenilaian(
  karyawanId: string,
  periodeId: string,
  nilaiKaryawan: Record<string, number>,
  catatanKaryawan: string
) {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  const q = query(
    getPenilaianRef(),
    where('karyawanId', '==', karyawanId),
    where('periodeId', '==', periodeId)
  );

  const snapshot = await getDocs(q);
  const now = new Date();

  if (snapshot.empty) {
    const penilaian: PenilaianKinerja = {
      id: `${karyawanId}_${periodeId}`,
      periodeId,
      karyawanId,
      status: 'draft',
      nilaiKaryawan,
      catatanKaryawan,
      nilaiAdmin: {},
      catatanAdmin: '',
      totalNilai: 0,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(
      doc(db, COLLECTIONS.PENILAIAN_KINERJA, penilaian.id),
      penilaian
    );
  } else {
    const docId = snapshot.docs[0].id;
    await updateDoc(doc(db, COLLECTIONS.PENILAIAN_KINERJA, docId), {
      nilaiKaryawan,
      catatanKaryawan,
      updatedAt: Timestamp.fromDate(now),
    });
  }
}

export async function submitPenilaian(karyawanId: string, periodeId: string) {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  const q = query(
    getPenilaianRef(),
    where('karyawanId', '==', karyawanId),
    where('periodeId', '==', periodeId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('Penilaian not found');

  const docId = snapshot.docs[0].id;
  await updateDoc(doc(db, COLLECTIONS.PENILAIAN_KINERJA, docId), {
    status: 'dikirim',
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

export async function adminListPenilaian(
  filters?: {
    periodeId?: string;
    status?: string;
    search?: string;
  }
): Promise<(PenilaianKinerja & { karyawanNama: string })[]> {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  let constraints: QueryConstraint[] = [];
  if (filters?.periodeId) {
    constraints.push(where('periodeId', '==', filters.periodeId));
  }
  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(getPenilaianRef(), ...constraints);
  const snapshot = await getDocs(q);

  const results = [];
  for (const docSnap of snapshot.docs) {
    const penilaian = docSnap.data();
    const karyawanDocRef = doc(db, COLLECTIONS.KARYAWAN, penilaian.karyawanId);
    const karyawanDocSnap = await getDoc(karyawanDocRef);
    const karyawanNama = karyawanDocSnap.exists()
      ? karyawanDocSnap.data().nama
      : 'Unknown';

    if (!filters?.search || karyawanNama.toLowerCase().includes(filters.search.toLowerCase())) {
      results.push({ ...penilaian, karyawanNama });
    }
  }

  return results;
}

export async function adminEvaluatePenilaian(
  penilaianId: string,
  nilaiAdmin: Record<string, number>,
  catatanAdmin: string
) {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  const docRef = doc(db, COLLECTIONS.PENILAIAN_KINERJA, penilaianId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) throw new Error('Penilaian not found');

  const penilaian = docSnap.data() as PenilaianKinerja;
  const periodeId = penilaian.periodeId;

  const kriteria = await listKriteriaByPeriode(periodeId);
  let totalNilai = 0;

  for (const k of kriteria) {
    const nilai = nilaiAdmin[k.id] || 0;
    totalNilai += nilai * (k.bobot / 100);
  }

  await updateDoc(docRef, {
    nilaiAdmin,
    catatanAdmin,
    totalNilai,
    status: 'dinilai',
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

// Laporan
export async function laporanRekap(filters?: {
  periode?: string;
  divisi?: string;
  search?: string;
}) {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  const penilaianSnapshot = await getDocs(getPenilaianRef());
  const results = [];

  for (const penilaianDoc of penilaianSnapshot.docs) {
    const penilaian = penilaianDoc.data() as PenilaianKinerja;
    const karyawanDocRef = doc(db, COLLECTIONS.KARYAWAN, penilaian.karyawanId);
    const karyawanDocSnap = await getDoc(karyawanDocRef);

    if (!karyawanDocSnap.exists()) continue;

    const karyawan = karyawanDocSnap.data() as Karyawan;

    if (filters?.divisi && karyawan.bagian !== filters.divisi) continue;
    if (filters?.search && !karyawan.nama.toLowerCase().includes(filters.search.toLowerCase()))
      continue;

    const absensiQuery = query(
      getAbsensiRef(),
      where('karyawanId', '==', penilaian.karyawanId)
    );
    const absensiSnapshot = await getDocs(absensiQuery);
    const hadirCount = absensiSnapshot.docs.filter((d) => d.data().status === 'hadir').length;

    results.push({
      penilaian,
      karyawan,
      absensiHadir: hadirCount,
      persentaseAbsensi: (hadirCount / (absensiSnapshot.size || 1)) * 100,
    });
  }

  return results;
}
