# Employee Performance Evaluation System - Implementation Guide

## Overview

Complete Next.js 16 + Firebase + Firestore system for managing employee performance evaluations with role-based access control (admin vs karyawan).

## Quick Start

### 1. Prerequisites
```bash
Node.js 18+
Firebase project with Firestore (Standard) enabled
Email/Password authentication configured
```

### 2. Environment Setup
```bash
# Copy example env file
cp .env.local.example .env.local

# Edit .env.local with your Firebase credentials
# Get values from Firebase Console > Project Settings > Your apps > Web
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Start Development
```bash
npm run dev
# Visit http://localhost:3000
```

### 5. Access the App
- **Admin**: Login with admin@test.com (after seeding)
- **Karyawan**: Login with karyawan1@test.com (after seeding)
- **Login Page**: http://localhost:3000/(auth)/login

### 6. Seed Demo Data (Optional)
See SETUP_FIREBASE.md for instructions on adding demo data via browser console.

## System Architecture

### Firebase Configuration
All Firebase helpers are in `lib/firebase/`:
- `firebase.ts` - Initialize Firebase app/auth/firestore
- `auth.ts` - Login/signup/logout helpers
- `firestore.ts` - CRUD operations for all collections
- `collections.ts` - Collection references with types
- `seed.ts` - Demo data seeding

### Authentication Flow
```
User Login → Firebase Auth → Load Role from Firestore → AuthContext → Route Guard
```

1. User enters email/password
2. Firebase Auth validates credentials
3. System fetches user's role from `pengguna` collection
4. AuthContext stores user state
5. Route guards check role before allowing access

### Authorization & Route Protection
- `/admin/*` - Protected for admin role only
- `/(auth)/login` - Public, accessible to unauthenticated users
- `/karyawan/*` - Protected for karyawan role only
- Role validation happens in layout.tsx for each route group

## Firestore Collections Schema

### 1. pengguna (User Accounts)
```typescript
{
  uid: string;           // Firebase Auth UID (doc ID)
  email: string;         // User's email
  role: 'admin' | 'karyawan';
  karyawanId?: string;   // Link to karyawan doc
  createdAt: Date;
}
```

### 2. karyawan (Employee Data)
```typescript
{
  id: string;            // Doc ID
  nama: string;
  nip: string;           // Employee ID number
  bagian: string;        // Department/Division
  jabatan: string;       // Job title
  statusAktif: boolean;
  createdAt: Date;
}
```

### 3. periode_penilaian (Evaluation Periods)
```typescript
{
  id: string;
  namaPeriode: string;   // e.g. "Januari 2026"
  startDate: Date;
  endDate: Date;
  status: 'aktif' | 'tutup';
  createdAt: Date;
}
```

### 4. kriteria_penilaian (Evaluation Criteria)
```typescript
{
  id: string;
  periodeId: string;     // Link to periode
  namaKriteria: string;  // e.g. "Disiplin kerja"
  bobot: number;         // Weight percentage (e.g. 20)
  urutan: number;        // Display order
}
```

### 5. penilaian_kinerja (Performance Evaluations)
```typescript
{
  id: string;            // "{karyawanId}_{periodeId}"
  periodeId: string;
  karyawanId: string;
  status: 'draft' | 'dikirim' | 'dinilai';
  nilaiKaryawan: Record<string, number>;  // Criteria ID → score
  catatanKaryawan: string;
  nilaiAdmin: Record<string, number>;
  catatanAdmin: string;
  totalNilai: number;    // Weighted total
  createdAt: Date;
  updatedAt: Date;
}
```

### 6. absensi (Attendance Records)
```typescript
{
  id: string;            // "{karyawanId}_{date}"
  karyawanId: string;
  tanggal: Date;
  status: 'hadir' | 'sakit' | 'izin';
  keterangan?: string;
}
```

## Key Features

### Authentication
- Email/password registration and login
- Role assignment during signup
- Persistent login state with Firebase sessions
- Automatic logout option

### Admin Dashboard
- View all employee evaluations
- Create/edit evaluation periods and criteria
- Review and grade employee submissions
- Generate performance reports
- View attendance summaries

### Employee Features
- View active evaluation period
- Submit performance self-assessment
- Track evaluation status
- View detailed evaluation results
- Update profile and password
- View attendance record

### Security
- Firebase Security Rules enforce row-level access
- Employees can only view/edit their own data
- Admins have full read/write access
- Passwords never exposed (Firebase Auth handles encryption)
- Role-based routing prevents unauthorized access

## Available Firestore Helpers

### Periode Management
```typescript
getPeriodeAktif()          // Get current active period
```

### Criteria
```typescript
listKriteriaByPeriode(periodeId)  // Get all criteria for a period
```

### Attendance
```typescript
upsertAbsensiHarian(karyawanId, tanggal, status, keterangan)
```

### Penilaian (Evaluation)
```typescript
saveDraftPenilaian(karyawanId, periodeId, nilaiKaryawan, catatanKaryawan)
submitPenilaian(karyawanId, periodeId)  // Mark as dikirim
adminListPenilaian(filters?: {periodeId, status, search})
adminEvaluatePenilaian(penilaianId, nilaiAdmin, catatanAdmin)
```

### Reporting
```typescript
laporanRekap(filters?: {periode, divisi, search})  // Generate recap
```

## File Structure

```
app/
├── (auth)/
│   └── login/
│       └── page.tsx        # Login page (public)
├── admin/
│   ├── layout.tsx          # Admin route guard
│   ├── dashboard/
│   │   └── page.tsx
│   ├── penilaian-kinerja/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── evaluasi/
│   │           └── page.tsx
│   └── laporan/
│       ├── page.tsx
│       └── [id]/
│           └── detail/
│               └── page.tsx
├── karyawan/
│   ├── layout.tsx          # Karyawan route guard
│   ├── dashboard/
│   │   └── page.tsx
│   ├── isi-penilaian/
│   │   └── page.tsx
│   ├── profil/
│   │   └── page.tsx
│   └── riwayat/
│       ├── page.tsx
│       └── [periode]/
│           └── detail/
│               └── page.tsx
├── page.tsx               # Redirect to login
└── layout.tsx            # Root layout with AuthProvider

lib/
├── firebase/
│   ├── firebase.ts       # Initialization
│   ├── auth.ts           # Auth helpers
│   ├── firestore.ts      # CRUD helpers
│   ├── collections.ts    # Collection refs
│   └── seed.ts          # Demo data
└── utils/
    └── env.ts            # Env validation

types/
└── models.ts            # TypeScript interfaces

contexts/
└── AuthContext.tsx       # Auth state provider

components/
├── shells/
│   ├── AdminShell.tsx
│   └── KaryawanShell.tsx
└── ui/                   # shadcn UI components
```

## Configuration Checklist

- [ ] Firebase project created with Firestore (Standard)
- [ ] Email/Password authentication enabled
- [ ] `.env.local` file created with Firebase credentials
- [ ] App started with `npm run dev`
- [ ] Login page accessible at http://localhost:3000/(auth)/login
- [ ] Firestore Security Rules applied (from FIRESTORE_RULES.md)
- [ ] Demo data seeded (optional)
- [ ] Admin and karyawan accounts created for testing

## Troubleshooting

### Firebase Not Configured
**Error**: "Firebase configuration missing"
- Check `.env.local` exists with all required variables
- Verify variable names match exactly
- Restart dev server after adding variables

### Login Fails
**Error**: "auth/user-not-found" or "auth/wrong-password"
- Verify user exists in Firebase Auth
- Check password is correct
- Ensure email/password auth is enabled in Firebase

### Permission Denied
**Error**: "Missing or insufficient permissions"
- Verify Firestore Security Rules are applied
- Check user role is correctly set in `pengguna` collection
- Ensure user UID in auth matches doc ID in Firestore

### Type Errors
- Run `npm run build` to check TypeScript compilation
- Verify all imports use correct paths
- Check that Firebase functions are imported from correct files

## Environment Variables

All variables must be in `.env.local` (create from `.env.local.example`):

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

## Production Deployment

1. Verify all environment variables are set in deployment platform
2. Review and test Firestore Security Rules in production
3. Enable Cloud Backups for Firestore
4. Set up Firebase Functions for server-side operations if needed
5. Monitor Firebase quota and usage
6. Set up error logging (Sentry, etc.)
7. Configure CORS if needed for API calls

## Security Best Practices

1. Never commit `.env.local` to version control
2. Use strong passwords for admin accounts
3. Regularly review Firestore access logs
4. Keep dependencies updated
5. Enable Multi-Factor Authentication (MFA) in Firebase
6. Rotate sensitive credentials periodically
7. Review Security Rules regularly for permission leaks

## Development Tips

### Testing Auth Flows
Use Firebase Console > Authentication > Users to manually manage test accounts

### Monitoring Firestore
Use Firebase Console > Firestore to:
- View all collections and documents
- Run queries to test data
- Monitor quota usage
- Check security rule violations

### Debugging
- Use browser console for client-side errors
- Check Firebase Console for auth/permission errors
- Enable Firebase Emulator Suite for local development without hitting production Firebase

## Performance Considerations

- Queries use indexed fields (periodeId, karyawanId, status)
- Paginate large result sets on admin pages
- Cache active periode in React state where possible
- Use collection refs and queries for efficient data access

## Future Enhancements

- [ ] Email notifications on evaluation status changes
- [ ] PDF report generation
- [ ] Advanced filtering and analytics
- [ ] Bulk data import/export
- [ ] Mobile app version
- [ ] Performance trend analysis
- [ ] Multi-level approval workflow
- [ ] Custom evaluation criteria templates

## Support & Resources

- **Firebase Documentation**: https://firebase.google.com/docs
- **Next.js Documentation**: https://nextjs.org/docs
- **TypeScript Documentation**: https://www.typescriptlang.org/docs
- **Firestore Best Practices**: https://firebase.google.com/docs/firestore/best-practices

## License

This project is provided as-is for the employee performance evaluation system.
