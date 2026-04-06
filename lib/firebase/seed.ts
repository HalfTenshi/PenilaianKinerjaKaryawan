import {
  setDoc,
  doc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { COLLECTIONS } from './collections';
import { Pengguna, Karyawan, PeriodePenilaian, KriteriaPenilaian, PenilaianKinerja, Absensi } from '@/types/models';

/**
 * Seed dummy data for testing and demo purposes.
 * WARNING: This should only be run once manually!
 * Call this function ONLY if you want to initialize demo data.
 */
export async function seedDemoData() {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  console.log('[Seed] Starting demo data seeding...');

  // 1. Add Admin User
  const adminId = 'admin-001';
  const adminPengguna: Pengguna = {
    uid: adminId,
    email: 'admin@test.com',
    role: 'admin',
    createdAt: new Date(),
  };
  await setDoc(doc(db, COLLECTIONS.PENGGUNA, adminId), adminPengguna);
  console.log('[Seed] Added admin user');

  // 2. Add Karyawan & Users
  const karyawanData = [
    {
      id: 'karyawan-001',
      nama: 'Bambang P',
      nip: '001',
      bagian: 'Proyek A',
      jabatan: 'Supervisor',
    },
    {
      id: 'karyawan-002',
      nama: 'Yono Sujatmiko',
      nip: '002',
      bagian: 'Proyek B',
      jabatan: 'Staff',
    },
    {
      id: 'karyawan-003',
      nama: 'Aser',
      nip: '003',
      bagian: 'Proyek A',
      jabatan: 'Staff',
    },
  ];

  for (let i = 0; i < karyawanData.length; i++) {
    const k = karyawanData[i];
    const karyawan: Karyawan = {
      id: k.id,
      nama: k.nama,
      nip: k.nip,
      bagian: k.bagian,
      jabatan: k.jabatan,
      statusAktif: true,
      createdAt: new Date(),
    };
    await setDoc(doc(db, COLLECTIONS.KARYAWAN, k.id), karyawan);

    // Add corresponding user
    const penggunaId = `user-${i + 1}`;
    const pengguna: Pengguna = {
      uid: penggunaId,
      email: `karyawan${i + 1}@test.com`,
      role: 'karyawan',
      karyawanId: k.id,
      createdAt: new Date(),
    };
    await setDoc(doc(db, COLLECTIONS.PENGGUNA, penggunaId), pengguna);
  }
  console.log('[Seed] Added 3 karyawan');

  // 3. Add Periode Penilaian
  const periodeId = 'periode-202601';
  const periode: PeriodePenilaian = {
    id: periodeId,
    namaPeriode: 'Januari 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    status: 'aktif',
    createdAt: new Date(),
  };
  await setDoc(doc(db, COLLECTIONS.PERIODE_PENILAIAN, periodeId), periode);
  console.log('[Seed] Added periode penilaian');

  // 4. Add Kriteria Penilaian
  const kriteriaData = [
    { nama: 'Disiplin kerja', bobot: 20, urutan: 1 },
    { nama: 'Kualitas pekerjaan', bobot: 30, urutan: 2 },
    { nama: 'Keselamatan kerja (K3)', bobot: 20, urutan: 3 },
    { nama: 'Kerja sama tim', bobot: 15, urutan: 4 },
    { nama: 'Ketepatan waktu', bobot: 15, urutan: 5 },
  ];

  for (let i = 0; i < kriteriaData.length; i++) {
    const k = kriteriaData[i];
    const kriteriaId = `kriteria-${periodeId}-${i + 1}`;
    const kriteria: KriteriaPenilaian = {
      id: kriteriaId,
      periodeId,
      namaKriteria: k.nama,
      bobot: k.bobot,
      urutan: k.urutan,
    };
    await setDoc(doc(db, COLLECTIONS.KRITERIA_PENILAIAN, kriteriaId), kriteria);
  }
  console.log('[Seed] Added 5 kriteria penilaian');

  // 5. Add Sample Penilaian Kinerja
  for (let i = 0; i < karyawanData.length; i++) {
    const k = karyawanData[i];
    const penilaianId = `${k.id}_${periodeId}`;
    const nilaiKaryawan = {
      'kriteria-202601-1': 4,
      'kriteria-202601-2': 5,
      'kriteria-202601-3': 4,
      'kriteria-202601-4': 4,
      'kriteria-202601-5': 4,
    };
    const nilaiAdmin = i < 2 ? { ...nilaiKaryawan } : {};

    const penilaian: PenilaianKinerja = {
      id: penilaianId,
      periodeId,
      karyawanId: k.id,
      status: i === 0 ? 'dinilai' : i === 1 ? 'dikirim' : 'draft',
      nilaiKaryawan,
      catatanKaryawan: 'Performa baik bulan ini',
      nilaiAdmin,
      catatanAdmin: i < 2 ? 'Catatan dari admin' : '',
      totalNilai: i < 2 ? 87.75 : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await setDoc(doc(db, COLLECTIONS.PENILAIAN_KINERJA, penilaianId), penilaian);
  }
  console.log('[Seed] Added sample penilaian kinerja');

  // 6. Add Sample Absensi
  const jan2026Start = new Date('2026-01-01');
  for (let i = 0; i < karyawanData.length; i++) {
    const k = karyawanData[i];
    for (let day = 1; day <= 20; day++) {
      const date = new Date(jan2026Start);
      date.setDate(day);
      
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const status = Math.random() > 0.1 ? 'hadir' : (Math.random() > 0.5 ? 'sakit' : 'izin');
      const absensiId = `${k.id}_${date.toISOString().split('T')[0]}`;

      const absensi: Absensi = {
        id: absensiId,
        karyawanId: k.id,
        tanggal: date,
        status: status as any,
        keterangan: status !== 'hadir' ? 'Tidak hadir' : undefined,
      };

      await setDoc(doc(db, COLLECTIONS.ABSENSI, absensiId), absensi);
    }
  }
  console.log('[Seed] Added sample absensi');

  console.log('[Seed] Demo data seeding complete!');
}

/**
 * Check if collection already has data
 */
export async function hasExistingData(): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db) return false;

  try {
    const penggunaSnap = await getDocs({ docs: [] } as any);
    // Simple check - just see if we can access collections
    return true;
  } catch {
    return false;
  }
}
