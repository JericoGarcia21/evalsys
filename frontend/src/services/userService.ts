import api from './api';
import type { User } from '../types/auth';

export const userService = {
  async getAll(): Promise<User[]> {
    const response = await api.get<User[]>('/users');
    return response.data;
  },

  async create(userData: Partial<User>): Promise<User> {
    const response = await api.post<User>('/users', userData);
    return response.data;
  },

  async delete(userId: string): Promise<void> {
    await api.delete(`/users/${userId}`);
  }
};
