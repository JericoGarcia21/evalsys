import api from './api';
import type { EvaluationResult } from '../types/rubric';

export const evaluationService = {
  async getAll(): Promise<EvaluationResult[]> {
    const response = await api.get<EvaluationResult[]>('/evaluations');
    return response.data;
  },

  async create(evaluationData: Partial<EvaluationResult>): Promise<EvaluationResult> {
    const response = await api.post<EvaluationResult>('/evaluations', evaluationData);
    return response.data;
  },

  async getByStudent(studentId: string): Promise<EvaluationResult[]> {
    const response = await api.get<EvaluationResult[]>(`/evaluations/student/${studentId}`);
    return response.data;
  }
};
