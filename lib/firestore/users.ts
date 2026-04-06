import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'karyawan';

export interface UserDoc {
  uid: string;
  email: string;
  role: UserRole;

  // schema final
  nama?: string;
  karyawanId?: string;
  statusAktif?: boolean;
  fotoProfilUrl?: string;

  // alias kompatibilitas lama
  name?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const USERS_COLLECTION = 'pengguna';

function sanitizeFirestorePayload<T extends Record<string, any>>(
  payload: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function normalizeUserDoc(id: string, raw: any): UserDoc {
  const nama = raw?.nama ?? raw?.name ?? undefined;
  const createdAt =
    raw?.createdAt instanceof Timestamp ? raw.createdAt : Timestamp.now();
  const updatedAt =
    raw?.updatedAt instanceof Timestamp ? raw.updatedAt : createdAt;

  return {
    uid: String(raw?.uid ?? id),
    email: String(raw?.email ?? ''),
    role: raw?.role === 'admin' ? 'admin' : 'karyawan',
    nama,
    name: nama, // alias kompatibilitas
    karyawanId: raw?.karyawanId ?? id,
    statusAktif:
      typeof raw?.statusAktif === 'boolean' ? raw.statusAktif : true,
    fotoProfilUrl: raw?.fotoProfilUrl ?? undefined,
    createdAt,
    updatedAt,
  };
}

/**
 * Ambil dokumen pengguna dari Firestore
 */
export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) return null;

    return normalizeUserDoc(snap.id, snap.data());
  } catch (error) {
    console.error('Error fetching user doc:', error);
    return null;
  }
}

/**
 * Pastikan dokumen pengguna ada.
 * Jika belum ada, buat default role="karyawan"
 */
export async function ensureUserDoc(
  uid: string,
  email: string,
  name?: string
): Promise<UserDoc> {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      return normalizeUserDoc(snap.id, snap.data());
    }

    const now = Timestamp.now();
    const nama = (name || email.split('@')[0] || '').trim();

    const newUser: UserDoc = {
      uid,
      email,
      role: 'karyawan',
      nama,
      name: nama, // alias runtime
      karyawanId: uid,
      statusAktif: true,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(
      userRef,
      sanitizeFirestorePayload({
        uid: newUser.uid,
        email: newUser.email,
        role: newUser.role,
        nama: newUser.nama,
        karyawanId: newUser.karyawanId,
        statusAktif: newUser.statusAktif,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      })
    );

    return newUser;
  } catch (error) {
    console.error('Error ensuring user doc:', error);
    throw error;
  }
}

/**
 * Update dokumen pengguna
 * Aman dari undefined dan tidak mengubah uid/createdAt secara tidak sengaja
 */
export async function updateUserDoc(
  uid: string,
  updates: Partial<Omit<UserDoc, 'uid' | 'createdAt'>>
): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid);

    const safeUpdates = sanitizeFirestorePayload({
      nama:
        updates.nama !== undefined
          ? String(updates.nama).trim()
          : updates.name !== undefined
          ? String(updates.name).trim()
          : undefined,
      fotoProfilUrl:
        updates.fotoProfilUrl !== undefined
          ? String(updates.fotoProfilUrl)
          : undefined,
      statusAktif:
        typeof updates.statusAktif === 'boolean'
          ? updates.statusAktif
          : undefined,
      updatedAt: Timestamp.now(),
    });

    const keys = Object.keys(safeUpdates).filter((key) => key !== 'updatedAt');
    if (keys.length === 0) return;

    await updateDoc(userRef, safeUpdates);
  } catch (error) {
    console.error('Error updating user doc:', error);
    throw error;
  }
}