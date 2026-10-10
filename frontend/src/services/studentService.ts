import api from './api';
import type { Student } from '../types/auth';

export const studentService = {
  async getAll(section?: string): Promise<Student[]> {
    const params = section ? { section } : {};
    const response = await api.get<Student[]>('/students', { params });
    return response.data;
  },

  async create(studentData: Partial<Student>): Promise<Student> {
    const response = await api.post<Student>('/students', studentData);
    return response.data;
  },

  async delete(studentId: string): Promise<void> {
    await api.delete(`/students/${studentId}`);
  }
};
