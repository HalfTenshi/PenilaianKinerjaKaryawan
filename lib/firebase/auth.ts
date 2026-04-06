import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebase';
import { COLLECTIONS } from './collections';
import type { Pengguna, Karyawan } from '@/types/models';

export type UserRole = 'admin' | 'karyawan';

type SignupProfil = {
  nama: string;
  nip: string;
};

export async function registerUser(
  email: string,
  password: string,
  role: UserRole,
  profil?: SignupProfil
) {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth || !db) throw new Error('Firebase not initialized');

  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCred.user.uid;

  // ✅ karyawanId disamakan dengan uid
  const karyawanId = uid;

  // 1) pengguna/{uid}
  const pengguna: Pengguna = {
    uid,
    email,
    role,
    nama: profil?.nama ?? '',
    karyawanId,
    statusAktif: true,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  await setDoc(doc(db, COLLECTIONS.PENGGUNA, uid), pengguna as any, { merge: true });

  // 2) karyawan/{karyawanId} - khusus role karyawan
  if (role === 'karyawan') {
    const karyawan: Partial<Karyawan> & Record<string, any> = {
      // simpan dua-duanya biar kompatibel dengan kode lama & rules baru
      id: karyawanId,
      karyawanId, // ✅ penting supaya konsisten & mudah dipakai query/rules
      nama: profil?.nama ?? '',
      nip: profil?.nip ?? '',
      bagian: '-',   // default (bisa diedit karyawan)
      jabatan: '-',  // default
      statusAktif: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, COLLECTIONS.KARYAWAN, karyawanId), karyawan, { merge: true });
  }

  return userCred.user;
}

export async function loginUser(email: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase not initialized');
  const userCred = await signInWithEmailAndPassword(auth, email, password);
  return userCred.user;
}

export async function logoutUser() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase not initialized');
  await signOut(auth);
}

export async function getUserRole(uid: string): Promise<UserRole | null> {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  const snap = await getDoc(doc(db, COLLECTIONS.PENGGUNA, uid));
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  return (data?.role as UserRole) ?? null;
}

export async function getUserProfile(uid: string): Promise<Pengguna | null> {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase not initialized');

  const snap = await getDoc(doc(db, COLLECTIONS.PENGGUNA, uid));
  if (!snap.exists()) return null;

  return snap.data() as Pengguna;
}

export async function getCurrentUserWithRole(user: User | null) {
  if (!user) return null;

  const role = await getUserRole(user.uid);
  if (!role) return null;

  return {
    uid: user.uid,
    email: user.email,
    role,
  };
}