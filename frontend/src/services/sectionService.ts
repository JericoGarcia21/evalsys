import api from './api';
import type { Section } from '../types/auth';

export const sectionService = {
  async getAll(): Promise<Section[]> {
    const response = await api.get<Section[]>('/sections');
    return response.data;
  },

  async create(sectionData: Partial<Section>): Promise<Section> {
    const response = await api.post<Section>('/sections', sectionData);
    return response.data;
  },

  async delete(sectionId: string): Promise<void> {
    await api.delete(`/sections/${sectionId}`);
  }
};
