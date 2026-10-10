import axios from 'axios';

export const getApiMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data?.message || fallback;
  return error instanceof Error ? error.message : fallback;
};

export const getApiStatus = (error: unknown) => axios.isAxiosError(error) ? error.response?.status : undefined;
