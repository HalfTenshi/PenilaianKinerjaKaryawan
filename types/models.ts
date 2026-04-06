export type UserRole = 'admin' | 'karyawan';

export type StatusPeriode = 'aktif' | 'ditutup';
export type StatusPenilaian = 'draft' | 'dikirim' | 'dinilai';
export type StatusKehadiran = 'hadir' | 'sakit' | 'izin';

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
  updatedAt?: any;
}

export interface PeriodePenilaian {
  id: string;
  namaPeriode: string;
  status: StatusPeriode;

  /**
   * Field tanggal bisa bervariasi.
   * Wajib support semua alias ini karena data lama / page lain
   * bisa masih memakai nama field berbeda.
   */
  mulai?: any;
  startDate?: any;
  tanggalMulai?: any;
  awal?: any;

  selesai?: any;
  endDate?: any;
  tanggalSelesai?: any;
  akhir?: any;

  // Firestore Timestamp
  createdAt: any;
  updatedAt?: any;
}

export interface KriteriaPenilaian {
  id: string;
  periodeId: string;
  namaKriteria: string;
  bobot: number;
  urutan: number;

  // optional untuk kompatibilitas data
  createdAt?: any;
  updatedAt?: any;
}

export interface PenilaianKinerja {
  /**
   * doc id final:
   * `${karyawanId}_${periodeId}`
   */
  id: string;
  periodeId: string;
  karyawanId: string;

  status: StatusPenilaian;

  nilaiKaryawan: Record<string, number>;
  nilaiAdmin: Record<string, number>;

  catatanKaryawan?: string;
  catatanAdmin?: string;

  /**
   * Nilai akhir final yang disimpan (optional).
   * Rumus:
   * total = Σ ( (nilai/5) * 100 * (bobot/100) )
   * dibulatkan 2 desimal
   */
  totalNilai?: number;

  createdAt: any;
  updatedAt: any;
}

export interface Absensi {
  /**
   * doc id final:
   * `${karyawanId}_${yyyy-mm-dd}`
   */
  id: string;
  karyawanId: string;
  tanggal: any;

  /**
   * FINAL:
   * alpha TIDAK disimpan.
   * alpha dihitung otomatis:
   * totalHariKerja - (hadir + sakit + izin)
   */
  statusKehadiran: StatusKehadiran;

  createdAt: any;
  updatedAt?: any;

  /**
   * fallback data lama agar pembacaan data existing tetap aman.
   * Jangan dipakai untuk penulisan data baru.
   */
  status?: StatusKehadiran;
}