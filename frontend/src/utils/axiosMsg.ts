import type { AxiosError } from 'axios';

export function axiosMsg(err: unknown, fallback = 'An unexpected error occurred.'): string {
  const e = err as AxiosError<{ error?: string; message?: string }>;
  return e.response?.data?.error ?? e.response?.data?.message ?? fallback;
}
