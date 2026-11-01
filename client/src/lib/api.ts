import type { Analysis, DashboardStats, IntegrateResponse } from './types';
export { getAnalysisId } from './types';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, ...customConfig } = options;

  let url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const config: RequestInit = {
    method: customConfig.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...customConfig,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }

    let message = `API request failed with status ${response.status}`;
    if (typeof errorData === 'object' && errorData !== null && 'detail' in errorData) {
      const detail = (errorData as { detail: unknown }).detail;
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; ');
      }
    } else if (typeof errorData === 'string' && errorData) {
      message = errorData;
    }

    throw new ApiError(response.status, message, errorData);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, data?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  put: <T>(endpoint: string, data?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  delete: <T>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),

  // Typed endpoints
  scan: (repo_url: string, pr_number: number) =>
    apiFetch<Analysis>('/api/scan', {
      method: 'POST',
      body: JSON.stringify({ repo_url, pr_number }),
    }),

  getHistory: (limit: number = 10) =>
    apiFetch<Analysis[]>('/api/history', {
      params: { limit },
    }),

  getAnalysis: (id: string) =>
    apiFetch<Analysis>(`/api/analysis/${id}`),

  integrate: (analysis_id: string) =>
    apiFetch<IntegrateResponse>('/api/integrate', {
      method: 'POST',
      body: JSON.stringify({ analysis_id }),
    }),

  getStats: () =>
    apiFetch<DashboardStats>('/api/dashboard/stats'),

  getHealth: () =>
    apiFetch<{ status: string; database: string }>('/api/health'),
};
