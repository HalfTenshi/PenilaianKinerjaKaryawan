# Firebase Setup Guide for Employee Performance System

## Prerequisites
- Node.js 18+ installed
- A Firebase project (Standard edition Firestore)
- Email/Password authentication enabled in Firebase Auth

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" and name it (e.g., "Penilaian Karyawan")
3. Enable Google Analytics (optional)
4. Create the project

## Step 2: Enable Authentication

1. In Firebase Console, navigate to **Authentication**
2. Click "Get started"
3. Enable **Email/Password** provider
4. Save and continue

## Step 3: Create Firestore Database

1. In Firebase Console, navigate to **Firestore Database**
2. Click "Create database"
3. Start in **Production mode**
4. Choose closest region (e.g., asia-southeast1 for Indonesia)
5. Create the database

## Step 4: Configure Environment Variables

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Select "Your apps" section
3. Create a Web app if not already created
4. Copy the Firebase config (JavaScript object)
5. Create `.env.local` file in project root and fill with these values:

```
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
```

6. Save and restart the dev server: `npm run dev`

## Step 5: Setup Firestore Collections

The app expects these 6 Firestore collections (auto-created):

1. **pengguna** - User accounts with roles
2. **karyawan** - Employee data
3. **periode_penilaian** - Evaluation periods
4. **kriteria_penilaian** - Evaluation criteria with weights
5. **penilaian_kinerja** - Performance evaluations
6. **absensi** - Attendance records

## Step 6: Seed Demo Data (Optional)

To add sample data for testing:

1. Open browser console while app is running
2. Run this command:
```javascript
// In browser console
import { seedDemoData } from '@/lib/firebase/seed';
await seedDemoData();
```

Or create a seed endpoint and call it from a page component.

**Demo Accounts:**
- Admin: `admin@test.com` / password: any
- Karyawan 1: `karyawan1@test.com` / password: any
- Karyawan 2: `karyawan2@test.com` / password: any

## Step 7: Setup Security Rules

Copy the Firestore Security Rules from `FIRESTORE_RULES.md` and apply them:

1. In Firebase Console, navigate to **Firestore Database**
2. Go to **Rules** tab
3. Replace default rules with rules from `FIRESTORE_RULES.md`
4. Click "Publish"

## Folder Structure

```
lib/
  firebase/
    firebase.ts          # Firebase initialization
    auth.ts              # Auth helpers
    firestore.ts         # Firestore CRUD helpers
    collections.ts       # Collection references
    seed.ts              # Demo data seeding
  utils/
    env.ts               # Environment validation

types/
  models.ts              # TypeScript interfaces

contexts/
  AuthContext.tsx        # Auth state management

app/
  (auth)/
    login/               # Login page (public)
  admin/                 # Admin routes (protected)
  karyawan/              # Employee routes (protected)
```

## Key Features

### Authentication Flow
1. User logs in with email/password
2. System loads user role from Firestore `pengguna` collection
3. AuthContext manages state and route protection
4. Role-based routing: admin → /admin, karyawan → /karyawan

### Firestore Schema

**pengguna**
```json
{
  "uid": "user-001",
  "email": "user@example.com",
  "role": "admin" | "karyawan",
  "karyawanId": "optional-link-to-karyawan",
  "createdAt": timestamp
}
```

**karyawan**
```json
{
  "id": "karyawan-001",
  "nama": "Bambang P",
  "nip": "001",
  "bagian": "Proyek A",
  "jabatan": "Supervisor",
  "statusAktif": true,
  "createdAt": timestamp
}
```

**penilaian_kinerja**
```json
{
  "id": "karyawan-001_periode-202601",
  "periodeId": "periode-202601",
  "karyawanId": "karyawan-001",
  "status": "draft" | "dikirim" | "dinilai",
  "nilaiKaryawan": { "kriteria-1": 5, "kriteria-2": 4 },
  "catatanKaryawan": "Text",
  "nilaiAdmin": { "kriteria-1": 5, "kriteria-2": 4 },
  "catatanAdmin": "Text",
  "totalNilai": 87.5,
  "createdAt": timestamp,
  "updatedAt": timestamp
}
```

## Helpers Available

- `getPeriodeAktif()` - Get current active period
- `listKriteriaByPeriode(periodeId)` - List criteria for period
- `saveDraftPenilaian()` - Save draft evaluation
- `submitPenilaian()` - Submit evaluation
- `adminListPenilaian()` - Admin list all evaluations
- `adminEvaluatePenilaian()` - Admin grade evaluation
- `laporanRekap()` - Generate recap report
- `upsertAbsensiHarian()` - Record daily attendance

## Troubleshooting

**"Firebase configuration missing" error:**
- Check `.env.local` exists with all variables
- Restart dev server after adding variables

**"Permission denied" errors:**
- Check Firestore Rules are applied
- Verify user has correct role in `pengguna` collection

**Seed data not appearing:**
- Verify Firestore collections exist
- Check browser console for errors
- Use Firebase Console to manually verify data

## Security Notes

- Role-based access enforced in middleware and components
- Firestore Rules restrict read/write by role
- Passwords hashed automatically by Firebase Auth
- Use environment variables for all secrets
- Never commit `.env.local` to repository

## Production Deployment

1. Generate Firestore indexes as needed (Firebase will suggest)
2. Enable Production Mode security rules
3. Set up Cloud Backups in Firestore settings
4. Configure SSL certificates
5. Monitor quota usage in Firebase Console

## Support

For Firebase documentation, visit https://firebase.google.com/docs
