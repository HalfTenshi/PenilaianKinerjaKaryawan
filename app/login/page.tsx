'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ AUTO REDIRECT BERDASARKAN ROLE (ANTI LOOP)
  useEffect(() => {
    if (!user) return;

    if (user.role === 'admin') {
      router.replace('/admin/dashboard');
    } else if (user.role === 'karyawan') {
      router.replace('/karyawan/dashboard');
    }
  }, [user, router]);

  const mapAuthError = (code?: string) => {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email atau kata sandi salah.';
      case 'auth/invalid-email':
        return 'Format email tidak valid.';
      case 'auth/too-many-requests':
        return 'Terlalu banyak percobaan. Coba lagi nanti.';
      default:
        return 'Gagal masuk. Coba lagi.';
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(mapAuthError(err?.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="w-full max-w-md">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
              CV
            </div>
            <h1 className="text-2xl font-bold text-blue-900">
              CV natas nitis netes
            </h1>
          </div>
          <p className="text-gray-600 text-sm">
            Sistem Penilaian Kinerja Karyawan
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-blue-100">
          <h2 className="text-2xl font-bold text-blue-900 mb-2">
            Masuk
          </h2>
          <p className="text-gray-600 mb-6 text-sm">
            Masuk ke akun Anda
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Email
              </label>
              <Input
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Kata Sandi
              </label>
              <Input
                type="password"
                placeholder="Masukkan kata sandi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Button */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {isSubmitting ? 'Sedang Masuk...' : 'Masuk'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">atau</span>
            </div>
          </div>

          {/* Signup */}
          <p className="text-center text-gray-600 text-sm">
            Belum punya akun?{' '}
            <Link
              href="/signup"
              className="text-blue-600 font-semibold hover:text-blue-700"
            >
              Daftar di sini
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}