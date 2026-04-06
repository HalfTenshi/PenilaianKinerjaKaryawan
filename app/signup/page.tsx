'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();

  const [nama, setNama] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const mapAuthError = (code?: string) => {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'Email sudah terdaftar. Gunakan email lain atau login.';
      case 'auth/invalid-email':
        return 'Format email tidak valid.';
      case 'auth/weak-password':
        return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
      case 'auth/too-many-requests':
        return 'Terlalu banyak percobaan. Coba lagi nanti.';
      default:
        return 'Pendaftaran gagal. Coba lagi.';
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nama.trim()) return setError('Nama wajib diisi');
    if (!nip.trim()) return setError('NIP wajib diisi');

    if (password !== confirmPassword) {
      setError('Kata sandi tidak sesuai');
      return;
    }

    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter');
      return;
    }

    setIsLoading(true);
    try {
      // ✅ signup karyawan + simpan nama & nip
      await signup(email, password, 'karyawan', { nama: nama.trim(), nip: nip.trim() });
      router.push('/karyawan/dashboard');
    } catch (err: any) {
      setError(mapAuthError(err?.code));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-bold">
              CV
            </div>
            <h1 className="text-2xl font-bold text-blue-900">CV Natas Nitis Netes</h1>
          </div>
          <p className="text-gray-600">Sistem Penilaian Kinerja Karyawan</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-blue-900 mb-2">Daftar Akun Baru</h2>
          <p className="text-gray-600 mb-6">Buat akun untuk memulai</p>

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">Nama Lengkap</label>
              <Input
                type="text"
                placeholder="Masukkan nama lengkap"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">NIP</label>
              <Input
                type="text"
                placeholder="Masukkan NIP"
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">Email</label>
              <Input
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">Kata Sandi</label>
              <Input
                type="password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">Konfirmasi Kata Sandi</label>
              <Input
                type="password"
                placeholder="Ulangi kata sandi"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg"
            >
              {isLoading ? 'Sedang Mendaftar...' : 'Daftar'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">atau</span>
            </div>
          </div>

          <p className="text-center text-gray-600">
            Sudah punya akun?{' '}
            <Link href="/login" className="text-blue-600 font-semibold hover:text-blue-700">
              Masuk di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}