export type UserRole = 'admin' | 'panel';

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  fullName: string;
  email?: string;
  createdAt: Date;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export interface Student {
  id: string;
  studentId: string;
  name: string;
  section: string;
  groupNumber?: string;
  createdAt: Date;
}

export interface Section {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
}
