export type UserRole = 'admin' | 'karyawan';

export type StatusPeriode = 'aktif' | 'ditutup';
export type StatusPenilaian = 'draft' | 'dikirim' | 'dinilai';
export type StatusKehadiran = 'hadir' | 'sakit' | 'izin';

// ─── BARU ────────────────────────────────────────────────────────────────────
/** Kategori tingkat bias dari gap analysis self-assessment */
export type GapFlag = 'normal' | 'waspada' | 'bias-tinggi';

/** Hasil analisis diskrepansi antara nilaiKaryawan dan nilaiAdmin */
export interface GapAnalysis {
  /** Selisih (nilaiKaryawan − nilaiAdmin) per kriteriaId */
  perKriteria: Record<string, number>;
  /** Rata-rata nilai absolut gap dari semua kriteria yang terisi */
  rataRataGap: number;
  /**
   * Flag global berdasarkan rataRataGap:
   * - ≤ 1   → 'normal'
   * - 1–2   → 'waspada'
   * - > 2   → 'bias-tinggi'
   */
  flagGlobal: GapFlag;
}
// ─────────────────────────────────────────────────────────────────────────────

export interface Pengguna {
  uid: string;
  email: string;
  role: UserRole;

  nama?: string;
  karyawanId?: string;
  statusAktif?: boolean;
  fotoProfilUrl?: string;

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

  createdAt: any;
  updatedAt?: any;
}

export interface KriteriaPenilaian {
  id: string;
  periodeId: string;
  namaKriteria: string;
  bobot: number;
  urutan: number;

  // ─── BARU ──────────────────────────────────────────────────────────────────
  /**
   * Deskripsi perilaku untuk setiap skor (BARS — Behaviorally Anchored Rating Scales).
   * Admin mengisi 5 deskripsi konkret saat membuat kriteria.
   * Karyawan melihat deskripsi ini saat memilih skor self-assessment.
   */
  deskripsiSkor?: {
    '1'?: string;
    '2'?: string;
    '3'?: string;
    '4'?: string;
    '5'?: string;
  };
  // ───────────────────────────────────────────────────────────────────────────

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

  // ─── BARU ──────────────────────────────────────────────────────────────────
  /**
   * Hasil analisis gap antara nilaiKaryawan dan nilaiAdmin.
   * Dihitung otomatis saat admin submit evaluasi.
   * Null jika belum dievaluasi atau karyawan tidak mengisi nilai.
   */
  gapAnalysis?: GapAnalysis;
  // ───────────────────────────────────────────────────────────────────────────

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