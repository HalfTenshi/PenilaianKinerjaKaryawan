# Demo Mode - Test Credentials

When Firebase is not configured (no `.env.local`), the app runs in **Demo Mode** with local authentication.

## Demo Mode Features
- No Firebase required
- User data stored in browser localStorage
- Full app functionality available
- Perfect for testing UI/UX without backend

## Demo Test Accounts

### Admin Account
```
Email: admin@demo.com
Password: admin123
```

### Employee Accounts
```
Email: karyawan@demo.com
Password: karyawan123

Email: bambang@demo.com
Password: bambang123

Email: yono@demo.com
Password: yono123
```

## How Demo Mode Works

1. **AuthContext** checks if Firebase is configured
2. If not configured → uses `lib/demo/auth.ts`
3. Demo auth stores user in localStorage
4. User stays logged in across page reloads
5. All app features work normally

## Using Demo Accounts

1. Go to http://localhost:3000 (redirects to `/login`)
2. Select "Login" tab
3. Enter any demo account credentials
4. Click "Masuk" button
5. Redirected to appropriate dashboard

## Switching to Production Firebase

1. Create Firebase project (see `SETUP_FIREBASE.md`)
2. Add credentials to `.env.local`:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```
3. Restart dev server
4. App will use real Firebase auth

## Demo vs Production

| Feature | Demo | Firebase |
|---------|------|----------|
| User Data Storage | localStorage | Firestore |
| Auth | In-memory | Firebase Auth |
| Persistence | Browser only | Cloud |
| Multi-device | ❌ | ✅ |
| Security | Demo only | Production-ready |
| User Management | Simple | Full |

## Reset Demo Data

Clear localStorage to reset all demo accounts:
```javascript
localStorage.clear();
```
Then refresh the page and log in again with demo credentials.
