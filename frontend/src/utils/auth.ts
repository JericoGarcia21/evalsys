import type { User, AuthState } from '../types/auth';

const AUTH_KEY = 'auth_state';
const USERS_KEY = 'users';

// Initialize with default admin account
export function initializeAuth() {
  const users = getUsers();
  if (users.length === 0) {
    const defaultAdmin: User = {
      id: '1',
      username: 'admin',
      password: 'admin123', // In production, use proper hashing
      role: 'admin',
      fullName: 'System Administrator',
      email: 'admin@evalsys.com',
      createdAt: new Date()
    };
    saveUser(defaultAdmin);
  }
}

export function login(username: string, password: string): User | null {
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    const authState: AuthState = {
      user,
      isAuthenticated: true
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(authState));
    return user;
  }
  
  return null;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

export function getCurrentUser(): User | null {
  const authState = localStorage.getItem(AUTH_KEY);
  if (!authState) return null;
  
  const state: AuthState = JSON.parse(authState);
  return state.isAuthenticated ? state.user : null;
}

export function isAuthenticated(): boolean {
  const user = getCurrentUser();
  return user !== null;
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function isPanel(): boolean {
  const user = getCurrentUser();
  return user?.role === 'panel';
}

function getUsers(): User[] {
  const users = localStorage.getItem(USERS_KEY);
  return users ? JSON.parse(users) : [];
}

export function saveUser(user: User) {
  const users = getUsers();
  const existingIndex = users.findIndex(u => u.id === user.id);
  
  if (existingIndex >= 0) {
    users[existingIndex] = user;
  } else {
    users.push(user);
  }
  
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getAllUsers(): User[] {
  return getUsers();
}

export function deleteUser(userId: string): boolean {
  const users = getUsers();
  const filtered = users.filter(u => u.id !== userId);
  
  if (filtered.length < users.length) {
    localStorage.setItem(USERS_KEY, JSON.stringify(filtered));
    return true;
  }
  
  return false;
}

export function getPanelUsers(): User[] {
  return getUsers().filter(u => u.role === 'panel');
}
