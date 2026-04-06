// Demo authentication for development without Firebase

export interface DemoUser {
  uid: string;
  email: string;
  role: 'admin' | 'karyawan';
}

const DEMO_USERS: Record<string, DemoUser & { password: string }> = {
  'admin@demo.com': {
    uid: 'admin-demo-1',
    email: 'admin@demo.com',
    password: 'admin123',
    role: 'admin',
  },
  'karyawan@demo.com': {
    uid: 'karyawan-demo-1',
    email: 'karyawan@demo.com',
    password: 'karyawan123',
    role: 'karyawan',
  },
};

const DEMO_STORAGE_KEY = 'demo_auth_user';

export function demologin(email: string, password: string): DemoUser {
  const user = DEMO_USERS[email];
  if (!user || user.password !== password) {
    throw new Error('Invalid email or password');
  }

  const demoUser = { uid: user.uid, email: user.email, role: user.role };
  if (typeof window !== 'undefined') {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoUser));
  }
  return demoUser;
}

export function demoSignup(email: string, password: string, role: 'admin' | 'karyawan'): DemoUser {
  // Demo mode: allow any signup with karyawan role
  const demoUser = {
    uid: `demo-${Date.now()}`,
    email,
    role: role || 'karyawan',
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoUser));
  }

  return demoUser;
}

export function demoLogout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  }
}

export function getDemoUser(): DemoUser | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(DEMO_STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as DemoUser;
  } catch {
    return null;
  }
}
