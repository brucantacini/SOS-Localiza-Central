export const TYPES = ['Alagamento', 'Enchente', 'Desmoronamento ou barranco em risco', 'Casa com risco de desabamento', 'Outra situação'] as const;
export const STATUSES = { novo: 'Novo', em_atendimento: 'Em atendimento', resolvido: 'Resolvido' } as const;
export type Status = keyof typeof STATUSES;
export interface Alert { id: string; requestId: string; type: typeof TYPES[number]; date: string; updatedAt: string; status: Status; version: number; location: string; source: string; latitude: number | null; longitude: number | null; profile: { name: string; cpf: string; phone: string; address: string }; notes: string }
export interface Filters { status: string; type: string; q: string; from: string; to: string }
export interface AlertPage { data: Alert[]; pagination: { page: number; pageSize: number; total: number }; summary: { total: number; novo: number; em_atendimento: number; resolvido: number } }
const base = ((import.meta as unknown as { env: Record<string, string> }).env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export interface Operator { username: string; mustChangePassword: boolean }
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
async function request<T>(path: string, signal?: AbortSignal, body?: unknown, method = body ? 'PATCH' : 'GET'): Promise<T> {
  let response: Response;
  try { response = await fetch(`${base}${path}`, { method, credentials: 'include', headers: { 'X-SOS-Client': 'central', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal }); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new Error('Não foi possível conectar à API. Confira a conexão e se o backend está em execução.'); }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload?.error?.code || 'HTTP_ERROR', payload?.error?.message || `A API retornou um erro (${response.status}).`);
  if (!payload || !('data' in payload)) throw new Error('A API retornou uma resposta inválida.');
  return payload as T;
}
export function getAlerts(filters: Filters, page: number, signal?: AbortSignal) { const query = new URLSearchParams({ page: String(page), pageSize: '25' }); Object.entries(filters).forEach(([k, v]) => { if (v) query.set(k, v); }); return request<AlertPage>(`/alerts?${query}`, signal); }
export function getAlert(id: string, signal?: AbortSignal) { return request<{ data: Alert }>(`/alerts/${encodeURIComponent(id)}`, signal); }
export function updateStatus(alert: Alert, status: Status, signal?: AbortSignal) { return request<{ data: Alert }>(`/alerts/${encodeURIComponent(alert.id)}/status`, signal, { status, expectedVersion: alert.version }); }
export function login(username: string, password: string, signal?: AbortSignal) { return request<{ data: { operator: Operator } }>('/auth/login', signal, { username, password }, 'POST'); }
export function currentSession(signal?: AbortSignal) { return request<{ data: { operator: Operator } }>('/auth/session', signal); }
export function endSession(signal?: AbortSignal) { return request('/auth/logout', signal, {}, 'POST'); }
export function changePassword(currentPassword: string, newPassword: string, signal?: AbortSignal) { return request('/auth/password', signal, { currentPassword, newPassword }, 'POST'); }
