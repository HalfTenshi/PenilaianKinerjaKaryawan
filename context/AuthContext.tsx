'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/firebase';
import { loginUser, logoutUser, registerUser, getUserProfile } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/utils/env';
import { demologin, demoSignup, demoLogout, getDemoUser } from '@/lib/demo/auth';

export type UserRole = 'admin' | 'karyawan';

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;

  nama?: string;
  karyawanId?: string;
  statusAktif?: boolean;
}

type SignupProfil = { nama: string; nip: string };

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  isFirebaseReady: boolean;
  isDemoMode: boolean;

  isAdmin: boolean;
  isKaryawan: boolean;

  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, role: UserRole, profil: SignupProfil) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const firebaseReady = isFirebaseConfigured();
  const [isFirebaseReady] = useState(firebaseReady);
  const isDemoMode = !firebaseReady;

  useEffect(() => {
    if (isDemoMode) {
      const demoUser = getDemoUser();
      if (demoUser) {
        setUser({
          uid: demoUser.uid,
          email: demoUser.email,
          role: demoUser.role,
          nama: demoUser.email.split('@')[0],
          karyawanId: demoUser.uid,
          statusAktif: true,
        });
      }
      setIsLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      setIsLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (!fbUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const profile = await getUserProfile(fbUser.uid);

        // Kalau profile belum ada (kasus data lama / delay), tetap simpan auth user minimal
        if (!profile) {
          setUser({
            uid: fbUser.uid,
            email: fbUser.email || '',
            role: 'karyawan', // default aman (layout karyawan tetap butuh role dari profile biasanya)
            nama: '',
            karyawanId: fbUser.uid,
            statusAktif: true,
          });
          return;
        }

        // ✅ fallback karyawanId = uid untuk konsistensi (docId karyawan memang uid)
        const karyawanId =
          profile.karyawanId ||
          (profile.role === 'karyawan' ? fbUser.uid : undefined);

        setUser({
          uid: fbUser.uid,
          email: fbUser.email || profile.email,
          role: profile.role,
          nama: profile.nama,
          karyawanId,
          statusAktif: profile.statusAktif ?? true,
        });
      } catch (e) {
        console.error(e);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsub();
  }, [isDemoMode]);

  const login = async (email: string, password: string) => {
    if (!email || !password) throw new Error('Email dan password wajib diisi');

    if (isDemoMode) {
      const d = demologin(email, password);
      setUser({
        uid: d.uid,
        email: d.email,
        role: d.role,
        nama: d.email.split('@')[0],
        karyawanId: d.uid,
        statusAktif: true,
      });
      return;
    }

    await loginUser(email, password);
  };

  const signup = async (email: string, password: string, role: UserRole, profil: SignupProfil) => {
    if (!email || !password) throw new Error('Email dan password wajib diisi');
    if (!profil?.nama?.trim() || !profil?.nip?.trim()) throw new Error('Nama dan NIP wajib diisi');

    if (isDemoMode) {
      const d = demoSignup(email, password, role);
      setUser({
        uid: d.uid,
        email: d.email,
        role: d.role,
        nama: profil.nama.trim(),
        karyawanId: d.uid,
        statusAktif: true,
      });
      return;
    }

    await registerUser(email, password, role, {
      nama: profil.nama.trim(),
      nip: profil.nip.trim(),
    });
    // state user akan otomatis ke-update oleh onAuthStateChanged
  };

  const logout = async () => {
    if (isDemoMode) {
      demoLogout();
      setUser(null);
      return;
    }
    await logoutUser();
    setUser(null);
  };

  const flags = useMemo(
    () => ({
      isAdmin: user?.role === 'admin',
      isKaryawan: user?.role === 'karyawan',
    }),
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isFirebaseReady,
        isDemoMode,
        isAdmin: flags.isAdmin,
        isKaryawan: flags.isKaryawan,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}