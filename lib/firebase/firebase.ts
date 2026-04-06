import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFirebaseConfig, isFirebaseConfigured } from '@/lib/utils/env';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function initializeFirebase() {
  if (getApps().length > 0) {
    app = getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    return { app, auth, db };
  }

  const config = getFirebaseConfig();
  if (!config) {
    console.error('[Firebase] Configuration missing. Please set environment variables.');
    return { app: null, auth: null, db: null };
  }

  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  return { app, auth, db };
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!app) {
    initializeFirebase();
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  if (!db) {
    initializeFirebase();
  }
  return db;
}

export function isFirebaseReady(): boolean {
  return isFirebaseConfigured() && getFirebaseApp() !== null;
}
