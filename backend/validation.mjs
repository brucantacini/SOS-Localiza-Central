export const types = ['Alagamento', 'Enchente', 'Desmoronamento ou barranco em risco', 'Casa com risco de desabamento', 'Outra situação'];
export const statuses = ['novo', 'em_atendimento', 'resolvido'];
const sources = ['Localização do dispositivo', 'Informada manualmente', 'Endereço cadastrado'];
export class ApiError extends Error {
  constructor(status, code, message, fields) { super(message); Object.assign(this, { status, code, fields }); }
}
export function invalid(fields) { throw new ApiError(400, 'VALIDATION_ERROR', 'Verifique os campos informados.', fields); }
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid({ id: 'UUID inválido.' });
  return value.toLowerCase();
}
function text(value, field, max, optional = false) {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) invalid({ [field]: `Informe texto ${optional ? 'de 0' : 'de 1'} a ${max} caracteres.` });
  return value.trim();
}
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid({ body: 'Objeto JSON obrigatório.' }); }
export function createInput(body) {
  object(body); object(body.profile);
  if (!types.includes(body.type)) invalid({ type: 'Tipo de ocorrência inválido.' });
  if (!sources.includes(body.source)) invalid({ source: 'Origem inválida.' });
  const { latitude, longitude } = body;
  if (!(latitude === null && longitude === null) && !(Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) invalid({ latitude: 'Informe ambas coordenadas válidas ou null.' });
  return {
    requestId: uuid(body.requestId), type: body.type,
    location: text(body.location, 'location', 500), source: body.source, latitude, longitude,
    profile: { name: text(body.profile.name, 'profile.name', 120), cpf: text(body.profile.cpf, 'profile.cpf', 20), phone: text(body.profile.phone, 'profile.phone', 30), address: text(body.profile.address, 'profile.address', 500) },
    notes: text(body.notes ?? '', 'notes', 2000, true),
  };
}
export function statusInput(body) {
  object(body);
  if (!statuses.includes(body.status)) invalid({ status: 'Status inválido.' });
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) invalid({ expectedVersion: 'Versão positiva obrigatória.' });
  return { status: body.status, expectedVersion: body.expectedVersion };
}
export function listInput(params) {
  const value = Object.fromEntries(params);
  const allowed = ['status', 'type', 'q', 'from', 'to', 'page', 'pageSize'];
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid({ query: 'Filtro desconhecido.' });
  if (value.status && !statuses.includes(value.status)) invalid({ status: 'Status inválido.' });
  if (value.type && !types.includes(value.type)) invalid({ type: 'Tipo inválido.' });
  for (const key of ['from', 'to']) {
    if (value[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(value[key]) || Number.isNaN(Date.parse(value[key])) || new Date(value[key]).toISOString().slice(0, 10) !== value[key])) invalid({ [key]: 'Data inválida; use YYYY-MM-DD.' });
  }
  if (value.from && value.to && value.from > value.to) invalid({ to: 'Data final anterior à inicial.' });
  const page = value.page === undefined ? 1 : Number(value.page);
  const pageSize = value.pageSize === undefined ? 50 : Number(value.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) invalid({ page: 'Página de 1 a 1000000; pageSize de 1 a 100.' });
  return { ...value, q: text(value.q ?? '', 'q', 120, true), page, pageSize };
}
