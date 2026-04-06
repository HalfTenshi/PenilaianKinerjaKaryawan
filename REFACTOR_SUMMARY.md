# Firebase + Firestore Refactoring Summary

## Overview
This document outlines the structural and architectural changes made to integrate Firebase Authentication and Firestore database into the performance appraisal system.

---

## File Structure Changes

### Old Structure → New Structure

```
MOVED FILES:
app/login/ → app/(auth)/login/
app/signup/ → app/(auth)/signup/
app/admin/* → app/(protected)/admin/*
app/karyawan/* → app/(protected)/karyawan/*
```

### New Files Created

```
lib/firebase.ts
├─ Firebase initialization (singleton)
└─ Auth and Firestore exports

lib/firestore/
├─ users.ts
│  ├─ getUserDoc(uid)
│  ├─ ensureUserDoc(uid, email, name)
│  └─ updateUserDoc(uid, updates)
├─ assessments.ts
│  ├─ createDraftAssessment(employeeId, periodId, payload)
│  ├─ getAssessmentDoc(assessmentId)
│  ├─ getEmployeeAssessments(employeeId, periodId)
│  ├─ submitAssessment(assessmentId, employeeScores, note)
│  └─ setAdminScore(assessmentId, adminScores, finalScore, note)
└─ attendance.ts
   ├─ upsertDailyAttendance(employeeId, date, status, note)
   ├─ getAttendanceSummary(employeeId, month, year)
   └─ getEmployeeAttendanceRecords(employeeId, month, year)

hooks/useAuth.ts
└─ useAuthHook() - Client-side auth hook

app/(auth)/layout.tsx (implicit - auth routes)
├─ app/(auth)/login/page.tsx
└─ app/(auth)/signup/page.tsx

app/(protected)/layout.tsx (implicit - protected routes)
├─ app/(protected)/admin/layout.tsx
│  └─ app/(protected)/admin/dashboard/page.tsx
└─ app/(protected)/karyawan/layout.tsx
   ├─ app/(protected)/karyawan/dashboard/page.tsx
   ├─ app/(protected)/karyawan/isi-penilaian/page.tsx
   ├─ app/(protected)/karyawan/profil/page.tsx
   └─ app/(protected)/karyawan/riwayat/
      ├─ page.tsx
      └─ [periode]/detail/page.tsx
```

---

## Route Group Organization

### Auth Routes (Unauthenticated Access)
```
(auth)/login       - Public login page
(auth)/signup      - Public signup page
```

### Protected Routes (Role-Based Access)
```
(protected)/admin/dashboard       - Admin only
(protected)/karyawan/dashboard    - Karyawan only
(protected)/karyawan/isi-penilaian
(protected)/karyawan/profil
(protected)/karyawan/riwayat
(protected)/karyawan/riwayat/[periode]/detail
```

---

## Firebase Integration

### Environment Variables Required
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

### Firebase Init (lib/firebase.ts)
- Singleton pattern to initialize Firebase app once
- Exports `auth` (Firebase Auth instance) and `db` (Firestore instance)
- Safe for client-side usage with environment variables

---

## Authentication Flow

### Login
1. User enters email/password in `(auth)/login`
2. Calls `useAuth().login(email, password)`
3. Firebase Auth validates credentials
4. User doc loaded from Firestore (`users/{uid}`)
5. Role loaded from user doc
6. Redirects to appropriate dashboard based on role

### Signup
1. User enters name/email/password in `(auth)/signup`
2. Calls `useAuth().signup(name, email, password)`
3. Firebase Auth creates user
4. `ensureUserDoc()` creates default user doc with `role="karyawan"`
5. Redirects to karyawan dashboard

### Logout
1. User clicks logout button
2. Calls `useAuth().logout()`
3. Firebase Auth signs out
4. Redirects to login page

---

## Firestore Service Layer

### Users Collection (`lib/firestore/users.ts`)
**Document Structure:**
```typescript
users/{uid}
├─ uid: string
├─ email: string
├─ name: string
├─ role: 'admin' | 'karyawan'
├─ position?: string
├─ department?: string
├─ createdAt: Timestamp
└─ updatedAt: Timestamp
```

**Key Functions:**
- `getUserDoc(uid)` - Fetch user document
- `ensureUserDoc(uid, email, name)` - Create user with default karyawan role
- `updateUserDoc(uid, updates)` - Update user info

### Assessments Collection (`lib/firestore/assessments.ts`)
**Document Structure:**
```typescript
assessments/{id}
├─ employeeId: string
├─ periodId: string
├─ status: 'draft' | 'submitted' | 'scored'
├─ employeeScores?: CriteriaScore[]
├─ employeeNote?: string
├─ adminScores?: CriteriaScore[]
├─ finalScore?: number
├─ adminNote?: string
├─ createdAt: Timestamp
└─ updatedAt: Timestamp
```

**Key Functions:**
- `createDraftAssessment()` - Create draft for employee
- `submitAssessment()` - Employee submits self-assessment
- `setAdminScore()` - Admin scores and finalizes
- `getEmployeeAssessments()` - Fetch assessments for period

### Attendance Collection (`lib/firestore/attendance.ts`)
**Document Structure:**
```typescript
attendance/{employeeId}_{YYYY-MM-DD}
├─ employeeId: string
├─ date: string (YYYY-MM-DD)
├─ status: 'hadir' | 'sakit' | 'izin' | 'alpha'
├─ note?: string
├─ createdAt: Timestamp
└─ updatedAt: Timestamp
```

**Key Functions:**
- `upsertDailyAttendance()` - Record daily attendance
- `getAttendanceSummary()` - Get summary for period
- `getEmployeeAttendanceRecords()` - Fetch all records in period

---

## Context & Hooks

### AuthContext (context/AuthContext.tsx)
**State:**
- `user: User | null` - Current authenticated user
- `firebaseUser: FirebaseUser | null` - Firebase Auth user
- `isLoading: boolean` - Auth state loading indicator

**Methods:**
- `login(email, password)` - Firebase Auth + Firestore role load
- `signup(name, email, password)` - Firebase Auth + user doc create
- `logout()` - Sign out and clear state

**Integration:**
- Uses Firebase Auth state listener (`onAuthStateChanged`)
- Auto-loads user role from Firestore on auth state change
- Must wrap entire app in `<AuthProvider>`

---

## Route Guards

### Admin Layout Guard (`app/(protected)/admin/layout.tsx`)
```typescript
- Checks if user.role === 'admin'
- Redirects to login if not authenticated or wrong role
- Shows loading state while auth is loading
```

### Karyawan Layout Guard (`app/(protected)/karyawan/layout.tsx`)
```typescript
- Checks if user.role === 'karyawan'
- Wraps children in AppShell component
- Provides sidebar navigation and navbar
```

---

## Package Dependencies

### New Dependencies Added
```json
"firebase": "^11.3.1"
```

### Existing Dependencies Used
- `next` (16.1.6) - Next.js framework
- `react` (19.2.4) - UI library
- `lucide-react` - Icons
- shadcn/ui components - UI components

---

## Important Notes

### TODO Items (Not Implemented)
1. **Score Calculation Logic** - `setAdminScore()` marked with TODO
   - Need to implement weighted score calculation
   - Should validate total weights = 100%

2. **Period-based Filtering** - `getAttendanceSummary()` marked with TODO
   - Currently filters client-side
   - Should add Firestore query optimization

3. **Reports & Analytics**
   - No report generation implemented
   - Dashboard shows static data only

### Security Considerations
- Auth routes accessible without login
- Protected routes guard with role checks in layout
- Firestore rules should be configured in Firebase console
- Recommended RLS rules pattern:
  ```
  allow read: if request.auth.uid != null && request.auth.uid == resource.data.uid
  allow read: if request.auth.uid != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
  ```

### Client-Side Only
- All auth is client-side (no API routes)
- Firebase auth tokens managed by Firebase SDK
- User context available via `useAuth()` hook

---

## Migration Checklist

- [x] Move auth pages to `(auth)` route group
- [x] Move protected pages to `(protected)` route group
- [x] Create Firebase singleton in `lib/firebase.ts`
- [x] Create Firestore service modules
- [x] Update AuthContext to use Firebase Auth
- [x] Add role guards to protected layouts
- [x] Update all internal route references
- [x] Add Firebase dependency to package.json
- [ ] Configure Firebase project (external - user must do)
- [ ] Set up Firestore collections (external - user must do)
- [ ] Implement TODO items (optional enhancement)
- [ ] Add Firestore security rules (external - user must do)

---

## Next Steps for User

1. **Create Firebase Project**
   - Go to https://console.firebase.google.com
   - Create new project
   - Enable Firebase Authentication
   - Enable Firestore Database

2. **Add Firebase Config to `.env.local`**
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

3. **Enable Authentication Methods**
   - Go to Firebase Console > Authentication
   - Enable "Email/Password" provider

4. **Set Up Firestore Collections**
   - Create collection `users` with sample documents
   - Create collection `assessments` with sample documents
   - Create collection `attendance` with sample documents

5. **Configure Firestore Security Rules** (Recommended)
   - Only authenticated users can access their own data
   - Admins can access all data

---

## Code Examples

### Using Firestore Services
```typescript
// In a component
import { getEmployeeAssessments } from '@/lib/firestore/assessments';
import { useAuth } from '@/context/AuthContext';

export function MyComponent() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);

  useEffect(() => {
    if (user) {
      getEmployeeAssessments(user.id).then(setAssessments);
    }
  }, [user]);

  return <div>{assessments.map(a => <p>{a.periodId}</p>)}</div>;
}
```

### Using Auth Context
```typescript
import { useAuth } from '@/context/AuthContext';

export function Profile() {
  const { user, logout } = useAuth();

  return (
    <div>
      <p>Hello, {user?.name}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

---

## Version Info
- **Next.js**: 16.1.6
- **React**: 19.2.4
- **Firebase**: 11.3.1
- **TypeScript**: 5.7.3
