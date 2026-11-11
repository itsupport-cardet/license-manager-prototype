import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';

export class ApiError extends Error {
  constructor(message, status, details) { super(message); this.status = status; this.details = details; }
}

export async function api(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && url !== '/auth/me' && url !== '/auth/login') window.dispatchEvent(new Event('lm:logout'));
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details);
  }
  return data;
}

export const get = (url) => api('GET', url);
export const post = (url, body = {}) => api('POST', url, body);
export const put = (url, body) => api('PUT', url, body);
export const patch = (url, body) => api('PATCH', url, body);
export const del = (url) => api('DELETE', url);

/** Load JSON from the API; returns { data, loading, error, reload }. */
export function useApi(url) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true }));
    try { setState({ data: await get(url), loading: false, error: null }); }
    catch (e) { setState({ data: null, loading: false, error: e }); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function notifyError(e) {
  notifications.show({ color: 'red', title: 'Something went wrong', message: e.details?.join('\n') || e.message });
}
export function notifyOk(message) {
  notifications.show({ color: 'teal', message });
}

/** Wrap an async action with error notification. */
export async function attempt(fn, okMessage) {
  try { const r = await fn(); if (okMessage) notifyOk(okMessage); return r; }
  catch (e) { notifyError(e); throw e; }
}
