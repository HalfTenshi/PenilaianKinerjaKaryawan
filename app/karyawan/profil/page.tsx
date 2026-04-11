'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import Image from 'next/image';

import { CardSection } from '@/components/CardSection';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useAuth } from '@/context/AuthContext';

import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/firebase';

type PenggunaDoc = {
  uid: string;
  email: string;
  role: 'admin' | 'karyawan';
  nama?: string;
  karyawanId?: string;
  statusAktif?: boolean;
  fotoProfilUrl?: string;
  createdAt?: any;
  updatedAt?: any;
};

type KaryawanDoc = {
  karyawanId: string;
  nama: string;
  nip: string;
  bagian: string;
  jabatan: string;
  statusAktif: boolean;
  createdAt?: any;
  updatedAt?: any;
};

function formatTanggal(ts: any) {
  try {
    const date = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!date) return '-';

    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return '-';
  }
}

export default function ProfilPage() {
  const { user } = useAuth();

  const uid = user?.uid ?? '';
  const karyawanId = user?.karyawanId ?? uid;

  const [loading, setLoading] = useState(true);
  const [pengguna, setPengguna] = useState<PenggunaDoc | null>(null);
  const [karyawan, setKaryawan] = useState<KaryawanDoc | null>(null);

  const [bagianDraft, setBagianDraft] = useState('');
  const [savingBagian, setSavingBagian] = useState(false);
  const [bagianMsg, setBagianMsg] = useState('');

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const roleLabel = useMemo(() => {
    if (!pengguna?.role) return '-';
    return pengguna.role === 'admin' ? 'Admin' : 'Karyawan';
  }, [pengguna?.role]);

  useEffect(() => {
    const safeUid = uid;

    if (!safeUid) {
      setLoading(false);
      setPengguna(null);
      setKaryawan(null);
      setBagianDraft('');
      return;
    }

    async function loadProfil() {
      setLoading(true);

      try {
        const penggunaRef = doc(db, 'pengguna', safeUid);
        const snapPengguna = await getDoc(penggunaRef);

        if (snapPengguna.exists()) {
          const data = snapPengguna.data() as PenggunaDoc;
          setPengguna(data);
        } else {
          setPengguna(null);
        }

        if (!karyawanId) {
          setKaryawan(null);
          setBagianDraft('');
          return;
        }

        const karyawanRef = doc(db, 'karyawan', karyawanId);
        const snapKaryawan = await getDoc(karyawanRef);

        if (snapKaryawan.exists()) {
          const raw = snapKaryawan.data() as any;

          const data: KaryawanDoc = {
            karyawanId: raw.karyawanId || raw.id || karyawanId,
            nama: raw.nama ?? '',
            nip: raw.nip ?? '',
            bagian: raw.bagian ?? '',
            jabatan: raw.jabatan ?? '',
            statusAktif: raw.statusAktif ?? true,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
          };

          setKaryawan(data);
          setBagianDraft(data.bagian || '');
        } else {
          setKaryawan(null);
          setBagianDraft('');
        }
      } catch (e) {
        console.error(e);
        setPengguna(null);
        setKaryawan(null);
        setBagianDraft('');
      } finally {
        setLoading(false);
      }
    }

    loadProfil();
  }, [uid, karyawanId]);

  const handleSimpanBagian = async () => {
    if (!karyawanId) return;

    setBagianMsg('');

    const bagianBersih = bagianDraft.trim();
    if (!bagianBersih) {
      setBagianMsg('Bagian tidak boleh kosong.');
      return;
    }

    setSavingBagian(true);

    try {
      await updateDoc(doc(db, 'karyawan', karyawanId), {
        bagian: bagianBersih,
      });

      setKaryawan((prev) =>
        prev
          ? {
              ...prev,
              bagian: bagianBersih,
            }
          : prev
      );

      setBagianMsg('Bagian berhasil disimpan.');
    } catch (e) {
      console.error(e);
      setBagianMsg('Gagal menyimpan bagian. Coba lagi.');
    } finally {
      setSavingBagian(false);
      setTimeout(() => setBagianMsg(''), 2000);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Semua field harus diisi');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Password baru tidak cocok');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password minimal 6 karakter');
      return;
    }

    if (!pengguna?.email) {
      setPasswordError('Email pengguna tidak ditemukan.');
      return;
    }

    const auth = getFirebaseAuth();
    const fbUser = auth?.currentUser;

    if (!auth || !fbUser) {
      setPasswordError('Sesi login tidak valid. Silakan login ulang.');
      return;
    }

    setSavingPassword(true);

    try {
      const credential = EmailAuthProvider.credential(
        pengguna.email,
        currentPassword
      );

      await reauthenticateWithCredential(fbUser, credential);
      await updatePassword(fbUser, newPassword);

      setPasswordSuccess(true);

      setTimeout(() => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordSuccess(false);
      }, 1200);
    } catch (err: any) {
      const code = err?.code;

      if (code === 'auth/wrong-password') {
        setPasswordError('Password saat ini salah.');
      } else if (code === 'auth/too-many-requests') {
        setPasswordError('Terlalu banyak percobaan. Coba lagi nanti.');
      } else if (code === 'auth/requires-recent-login') {
        setPasswordError('Sesi sudah lama. Silakan login ulang lalu coba lagi.');
      } else {
        setPasswordError('Gagal mengubah password. Coba lagi.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const namaTampil = karyawan?.nama || pengguna?.nama || '-';
  const jabatanTampil =
  karyawan?.jabatan && karyawan.jabatan.trim() !== '-'
    ? karyawan.jabatan.trim()
    : '';
  const emailTampil = pengguna?.email || user?.email || '-';
  const createdAtTampil = formatTanggal(pengguna?.createdAt);
  const nipTampil = karyawan?.nip || '-';
  const statusAktif = karyawan?.statusAktif ?? pengguna?.statusAktif ?? true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-blue-900">Profil</h1>
      </div>

      {loading && (
        <CardSection>
          <p className="text-gray-600">Memuat data profil...</p>
        </CardSection>
      )}

      <CardSection>
        <div className="flex gap-8">
          <div className="shrink-0">
            <div className="w-40">
           <div className="h-48 w-40 rounded-lg border border-gray-300 bg-gray-100 overflow-hidden">
  <Image
    src="/images/default-profile.png"
    alt="Foto Profil"
    width={160}
    height={192}
    className="w-full h-full object-contain"
    priority
  />
</div>

              <p className="mt-2 text-xs text-gray-500">
                Fitur ubah foto profil dinonaktifkan sementara.
              </p>
            </div>
          </div>

          <div className="flex-1">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-blue-900">
                  {namaTampil}
                </h2>

               {jabatanTampil !== '' && (
  <p className="font-medium text-blue-600">{jabatanTampil}</p>
)}
              </div>

              <div className="space-y-4">
                <div className="flex items-center">
                  <span className="w-32 font-medium text-blue-700">Email</span>
                  <span className="mx-2 text-gray-500">:</span>
                  <span className="text-gray-700">{emailTampil}</span>
                </div>

                <div className="flex items-center">
                  <span className="w-32 font-medium text-blue-700">Peran</span>
                  <span className="mx-2 text-gray-500">:</span>
                  <span className="text-gray-700">{roleLabel}</span>
                </div>

                <div className="flex items-center">
                  <span className="w-32 font-medium text-blue-700">
                    Tanggal dibuat
                  </span>
                  <span className="mx-2 text-gray-500">:</span>
                  <span className="text-gray-700">{createdAtTampil}</span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowPasswordModal(true)}
              className="mt-8 bg-blue-700 hover:bg-blue-800"
            >
              Ubah Password
            </Button>
          </div>
        </div>
      </CardSection>

      <CardSection>
        <div className="mb-6 border-b border-gray-300 pb-4">
          <h3 className="text-lg font-semibold text-blue-900">Data Karyawan</h3>
        </div>

        <div className="space-y-5">
          <div className="flex items-center">
            <span className="w-40 font-medium text-blue-700">NIP</span>
            <span className="mx-2 text-gray-500">:</span>
            <span className="text-gray-700">{nipTampil}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-40 font-medium text-blue-700">Bagian</span>
            <span className="text-gray-500">:</span>

            <div className="flex flex-1 items-center gap-2">
              <Input
                value={bagianDraft}
                onChange={(e) => setBagianDraft(e.target.value)}
                placeholder="Masukkan bagian"
                disabled={!karyawanId || savingBagian}
              />
              <Button
                onClick={handleSimpanBagian}
                disabled={!karyawanId || savingBagian}
                className="bg-blue-700 hover:bg-blue-800"
              >
                {savingBagian ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Save size={18} />
                )}
                <span className="ml-2">
                  {savingBagian ? 'Menyimpan' : 'Simpan'}
                </span>
              </Button>
            </div>
          </div>

          {bagianMsg && <p className="text-sm text-gray-600">{bagianMsg}</p>}

          <div className="flex items-center">
            <span className="w-40 font-medium text-blue-700">Status</span>
            <span className="mx-2 text-gray-500">:</span>
            {statusAktif ? (
              <StatusBadge status="Aktif" />
            ) : (
              <span className="text-gray-700">Nonaktif</span>
            )}
          </div>
        </div>
      </CardSection>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 p-6">
              <h2 className="text-xl font-bold text-blue-900">
                Ubah Password
              </h2>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError('');
                  setPasswordSuccess(false);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {passwordSuccess ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                  <p className="font-semibold text-green-700">
                    Password berhasil diubah!
                  </p>
                </div>
              ) : (
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Password Saat Ini
                    </label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Masukkan password saat ini"
                      disabled={savingPassword}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Password Baru
                    </label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Masukkan password baru"
                      disabled={savingPassword}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Konfirmasi Password
                    </label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Konfirmasi password baru"
                      disabled={savingPassword}
                    />
                  </div>

                  {passwordError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                      <p className="text-sm font-medium text-red-700">
                        {passwordError}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowPasswordModal(false);
                        setPasswordError('');
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      disabled={savingPassword}
                      className="flex-1"
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={savingPassword}
                      className="flex-1 bg-blue-700 hover:bg-blue-800"
                    >
                      {savingPassword ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}