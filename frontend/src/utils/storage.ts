import type { User, Student, Section } from '../types/auth';
import type { EvaluationResult } from '../types/rubric';

const STORAGE_KEYS = {
  USERS: 'evalsys_users',
  CURRENT_USER: 'evalsys_current_user',
  STUDENTS: 'evalsys_students',
  SECTIONS: 'evalsys_sections',
  EVALUATIONS: 'evalsys_evaluations'
};

// Initialize default admin account
export function initializeDefaultAdmin() {
  const users = getUsers();
  if (users.length === 0) {
    const defaultAdmin: User = {
      id: '1',
      username: 'admin',
      password: 'admin123',
      role: 'admin',
      fullName: 'System Administrator',
      email: 'admin@evalsys.com',
      createdAt: new Date()
    };
    saveUser(defaultAdmin);
  }
}

// User Management
export function getUsers(): User[] {
  const data = localStorage.getItem(STORAGE_KEYS.USERS);
  return data ? JSON.parse(data) : [];
}

export function saveUser(user: User): void {
  const users = getUsers();
  const existingIndex = users.findIndex(u => u.id === user.id);
  if (existingIndex >= 0) {
    users[existingIndex] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

export function deleteUser(userId: string): void {
  const users = getUsers().filter(u => u.id !== userId);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

export function authenticateUser(username: string, password: string): User | null {
  const users = getUsers();
  return users.find(u => u.username === username && u.password === password) || null;
}

export function getCurrentUser(): User | null {
  const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  return data ? JSON.parse(data) : null;
}

export function setCurrentUser(user: User | null): void {
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
}

// Student Management
export function getStudents(): Student[] {
  const data = localStorage.getItem(STORAGE_KEYS.STUDENTS);
  return data ? JSON.parse(data) : [];
}

export function saveStudent(student: Student): void {
  const students = getStudents();
  const existingIndex = students.findIndex(s => s.id === student.id);
  if (existingIndex >= 0) {
    students[existingIndex] = student;
  } else {
    students.push(student);
  }
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
}

export function deleteStudent(studentId: string): void {
  const students = getStudents().filter(s => s.id !== studentId);
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
}

export function getStudentsBySection(section: string): Student[] {
  return getStudents().filter(s => s.section === section);
}

// Section Management
export function getSections(): Section[] {
  const data = localStorage.getItem(STORAGE_KEYS.SECTIONS);
  return data ? JSON.parse(data) : [];
}

export function saveSection(section: Section): void {
  const sections = getSections();
  const existingIndex = sections.findIndex(s => s.id === section.id);
  if (existingIndex >= 0) {
    sections[existingIndex] = section;
  } else {
    sections.push(section);
  }
  localStorage.setItem(STORAGE_KEYS.SECTIONS, JSON.stringify(sections));
}

export function deleteSection(sectionId: string): void {
  const sections = getSections().filter(s => s.id !== sectionId);
  localStorage.setItem(STORAGE_KEYS.SECTIONS, JSON.stringify(sections));
}

// Evaluation Management
export function getEvaluations(): EvaluationResult[] {
  const data = localStorage.getItem(STORAGE_KEYS.EVALUATIONS);
  return data ? JSON.parse(data) : [];
}

export function saveEvaluation(evaluation: EvaluationResult): void {
  const evaluations = getEvaluations();
  evaluations.push(evaluation);
  localStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(evaluations));
}

export function getEvaluationsByStudent(studentId: string): EvaluationResult[] {
  return getEvaluations().filter(e => e.studentId === studentId);
}
