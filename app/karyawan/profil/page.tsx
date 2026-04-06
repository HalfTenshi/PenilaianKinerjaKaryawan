'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { X, Camera, Loader2, Save } from 'lucide-react';

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

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type PenggunaDoc = {
  uid: string;
  email: string;
  role: 'admin' | 'karyawan';
  nama?: string;
  karyawanId?: string;
  statusAktif?: boolean;
  fotoProfilUrl?: string;
  createdAt?: any; // Timestamp
  updatedAt?: any; // Timestamp
};

type KaryawanDoc = {
  karyawanId: string; // ✅ konsisten
  nama: string;
  nip: string;
  bagian: string;
  jabatan: string;
  statusAktif: boolean;
  createdAt?: any; // Timestamp
  updatedAt?: any; // Timestamp
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
  const uid = user?.uid;

  // ✅ fallback: docId karyawan selalu uid
  const karyawanId = user?.karyawanId || uid;

  const [loading, setLoading] = useState(true);
  const [pengguna, setPengguna] = useState<PenggunaDoc | null>(null);
  const [karyawan, setKaryawan] = useState<KaryawanDoc | null>(null);

  // foto profil
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fotoProfilUrl, setFotoProfilUrl] = useState<string>('');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoError, setFotoError] = useState('');

  // edit bagian
  const [bagianDraft, setBagianDraft] = useState('');
  const [savingBagian, setSavingBagian] = useState(false);
  const [bagianMsg, setBagianMsg] = useState('');

  // password modal
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
    if (!uid) {
      setLoading(false);
      return;
    }

    async function loadProfil() {
      setLoading(true);
      try {
        const penggunaRef = doc(db, 'pengguna', uid);
        const snapPengguna = await getDoc(penggunaRef);

        if (snapPengguna.exists()) {
          const data = snapPengguna.data() as PenggunaDoc;
          setPengguna(data);
          setFotoProfilUrl(data.fotoProfilUrl || '');
        } else {
          setPengguna(null);
          setFotoProfilUrl('');
        }

        if (karyawanId) {
          const karyawanRef = doc(db, 'karyawan', karyawanId);
          const snapKaryawan = await getDoc(karyawanRef);

          if (snapKaryawan.exists()) {
            // toleransi data lama: kalau ada field "id" lama, kita fallback
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
        } else {
          setKaryawan(null);
          setBagianDraft('');
        }
      } catch (e) {
        console.error(e);
        setPengguna(null);
        setKaryawan(null);
        setFotoProfilUrl('');
        setBagianDraft('');
      } finally {
        setLoading(false);
      }
    }

    loadProfil();
  }, [uid, karyawanId]);

  // =========================
  // Upload foto profil
  // =========================
  const handlePickFoto = () => {
    setFotoError('');
    fileInputRef.current?.click();
  };

  const handleUploadFoto = async (file: File) => {
    if (!uid) return;

    setFotoError('');
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setFotoError('Format foto harus JPG, PNG, atau WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFotoError('Ukuran foto maksimal 2MB.');
      return;
    }

    setUploadingFoto(true);
    try {
      const storage = getStorage();
      const ext =
        file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
          ? 'webp'
          : 'jpg';

      const storageRef = ref(storage, `foto_profil/${uid}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'pengguna', uid), { fotoProfilUrl: url });
      setFotoProfilUrl(url);
    } catch (e) {
      console.error(e);
      setFotoError('Gagal mengunggah foto. Coba lagi.');
    } finally {
      setUploadingFoto(false);
    }
  };

  // =========================
  // Simpan bagian (editable)
  // =========================
  const handleSimpanBagian = async () => {
    if (!karyawanId) return;

    setBagianMsg('');
    if (!bagianDraft.trim()) {
      setBagianMsg('Bagian tidak boleh kosong.');
      return;
    }

    setSavingBagian(true);
    try {
      // ✅ update HANYA field "bagian" (biar lolos rules changedKeys hasOnly(['bagian']))
      await updateDoc(doc(db, 'karyawan', karyawanId), {
        bagian: bagianDraft.trim(),
      });

      setKaryawan((prev) => (prev ? { ...prev, bagian: bagianDraft.trim() } : prev));
      setBagianMsg('Bagian berhasil disimpan.');
    } catch (e) {
      console.error(e);
      setBagianMsg('Gagal menyimpan bagian. Coba lagi.');
    } finally {
      setSavingBagian(false);
      setTimeout(() => setBagianMsg(''), 2000);
    }
  };

  // =========================
  // Ubah password
  // =========================
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
      const credential = EmailAuthProvider.credential(pengguna.email, currentPassword);
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
      if (code === 'auth/wrong-password') setPasswordError('Password saat ini salah.');
      else if (code === 'auth/too-many-requests')
        setPasswordError('Terlalu banyak percobaan. Coba lagi nanti.');
      else if (code === 'auth/requires-recent-login')
        setPasswordError('Sesi sudah lama. Silakan login ulang lalu coba lagi.');
      else setPasswordError('Gagal mengubah password. Coba lagi.');
    } finally {
      setSavingPassword(false);
    }
  };

  const namaTampil = karyawan?.nama || pengguna?.nama || '-';
  const jabatanTampil = karyawan?.jabatan || '-';
  const emailTampil = pengguna?.email || user?.email || '-';
  const createdAtTampil = formatTanggal(pengguna?.createdAt);
  const nipTampil = karyawan?.nip || '-';
  const statusAktif = karyawan?.statusAktif ?? pengguna?.statusAktif ?? true;

  const fotoFallback =
    'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Desktop%20-%205-pdNnY1TEg5DVN9QP6i8QE6w2hXd86R.png';
  const fotoTampil = fotoProfilUrl || fotoFallback;

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
          <div className="flex-shrink-0">
            <div className="w-40">
              <div className="w-40 h-48 bg-gray-200 rounded-lg overflow-hidden border border-gray-300 relative">
                <Image
                  src={fotoTampil}
                  alt={namaTampil}
                  width={160}
                  height={192}
                  className="w-full h-full object-cover"
                  priority
                />

                <button
                  type="button"
                  onClick={handlePickFoto}
                  disabled={uploadingFoto}
                  className="absolute bottom-2 right-2 bg-white/90 hover:bg-white text-blue-700 border border-gray-200 rounded-full p-2 shadow-sm disabled:opacity-60"
                  title="Ubah foto profil"
                >
                  {uploadingFoto ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadFoto(file);
                  e.currentTarget.value = '';
                }}
              />

              {fotoError && <p className="mt-2 text-sm text-red-600">{fotoError}</p>}
              <p className="mt-2 text-xs text-gray-500">Format: JPG/PNG/WEBP • Maks 2MB</p>
            </div>
          </div>

          <div className="flex-1">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-blue-900">{namaTampil}</h2>
                <p className="text-blue-600 font-medium">{jabatanTampil}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center">
                  <span className="text-blue-700 font-medium w-32">Email</span>
                  <span className="text-gray-500 mx-2">:</span>
                  <span className="text-gray-700">{emailTampil}</span>
                </div>

                <div className="flex items-center">
                  <span className="text-blue-700 font-medium w-32">Peran</span>
                  <span className="text-gray-500 mx-2">:</span>
                  <span className="text-gray-700">{roleLabel}</span>
                </div>

                <div className="flex items-center">
                  <span className="text-blue-700 font-medium w-32">Tanggal dibuat</span>
                  <span className="text-gray-500 mx-2">:</span>
                  <span className="text-gray-700">{createdAtTampil}</span>
                </div>
              </div>
            </div>

            <Button onClick={() => setShowPasswordModal(true)} className="mt-8 bg-blue-700 hover:bg-blue-800">
              Ubah Password
            </Button>
          </div>
        </div>
      </CardSection>

      <CardSection>
        <div className="border-b border-gray-300 pb-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-900">Data Karyawan</h3>
        </div>

        <div className="space-y-5">
          <div className="flex items-center">
            <span className="text-blue-700 font-medium w-40">NIP</span>
            <span className="text-gray-500 mx-2">:</span>
            <span className="text-gray-700">{nipTampil}</span>
          </div>

          {/* ✅ Bagian editable */}
          <div className="flex items-center gap-3">
            <span className="text-blue-700 font-medium w-40">Bagian</span>
            <span className="text-gray-500">:</span>

            <div className="flex-1 flex items-center gap-2">
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
                {savingBagian ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span className="ml-2">{savingBagian ? 'Menyimpan' : 'Simpan'}</span>
              </Button>
            </div>
          </div>

          {bagianMsg && <p className="text-sm text-gray-600">{bagianMsg}</p>}

          <div className="flex items-center">
            <span className="text-blue-700 font-medium w-40">Status</span>
            <span className="text-gray-500 mx-2">:</span>
            {statusAktif ? <StatusBadge status="Aktif" /> : <span className="text-gray-700">Nonaktif</span>}
          </div>
        </div>
      </CardSection>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-blue-900">Ubah Password</h2>
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-700 font-semibold">Password berhasil diubah!</p>
                </div>
              ) : (
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password Saat Ini</label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Masukkan password saat ini"
                      disabled={savingPassword}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password Baru</label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Masukkan password baru"
                      disabled={savingPassword}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Konfirmasi Password</label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Konfirmasi password baru"
                      disabled={savingPassword}
                    />
                  </div>

                  {passwordError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <p className="text-red-700 text-sm font-medium">{passwordError}</p>
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