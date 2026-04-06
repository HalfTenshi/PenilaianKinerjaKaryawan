export type UserRole = 'admin' | 'karyawan';

export interface Pengguna {
  uid: string;
  email: string;
  role: UserRole;

  nama?: string;
  karyawanId?: string;
  statusAktif?: boolean;
  fotoProfilUrl?: string;

  // Firestore Timestamp
  createdAt: any;
  updatedAt?: any;
}

export interface Karyawan {
  id: string;
  nama: string;
  nip: string;
  bagian: string;
  jabatan: string;
  statusAktif: boolean;

  // Firestore Timestamp
  createdAt: any;
}

export interface PeriodePenilaian {
  id: string;
  namaPeriode: string;
  startDate: any;
  endDate: any;
  status: 'aktif' | 'ditutup';
  createdAt: any;
}

export interface KriteriaPenilaian {
  id: string;
  periodeId: string;
  namaKriteria: string;
  bobot: number;
  urutan: number;
}

export interface PenilaianKinerja {
  id: string;
  periodeId: string;
  karyawanId: string;
  status: 'draft' | 'dikirim' | 'dinilai';
  nilaiKaryawan: Record<string, number>;
  catatanKaryawan: string;
  nilaiAdmin: Record<string, number>;
  catatanAdmin: string;
  totalNilai: number;
  createdAt: any;
  updatedAt: any;
}

export interface Absensi {
  id: string;
  karyawanId: string;
  tanggal: any;
  status: 'hadir' | 'sakit' | 'izin' | 'alpha';
  keterangan?: string;
}