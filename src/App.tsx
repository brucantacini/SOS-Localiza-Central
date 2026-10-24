import { useEffect, useMemo, useState, type FormEvent } from 'react';
import AlertMap from './AlertMap';
import { Activity, ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Filter, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, MapPin, Radio, RefreshCw, Search, ShieldCheck, X } from './icons';
import { Alert, AlertPage, ApiError, Filters, getAlert, getAlerts, STATUSES, Status, TYPES, updateStatus, Operator, login, currentSession, endSession, changePassword } from './api';

const emptyFilters: Filters = { status: '', type: '', q: '', from: '', to: '' };
const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const color = (status: Status) => ({ novo: '#b57427', em_atendimento: '#237a97', resolvido: '#3e7452' })[status];
function Badge({ status }: { status: Status }) { return <span className={`badge ${status}`}><i />{STATUSES[status]}</span>; }

export default function App() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [authBusy, setAuthBusy] = useState(false); const [restoring, setRestoring] = useState(true);
  const [authError, setAuthError] = useState(''); const [authNotice, setAuthNotice] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(emptyFilters); const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0); const [result, setResult] = useState<AlertPage | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null); const [selected, setSelected] = useState<Alert | null>(null);
  const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState('');
  const [nextStatus, setNextStatus] = useState<Status>('novo'); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState('');
  const [mutationController, setMutationController] = useState<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000); let active = true;
    currentSession(controller.signal).then(({ data }) => { if (active) setOperator(data.operator); }).catch(e => { if (active && !(e instanceof ApiError && e.status === 401)) setAuthError(e.name === 'AbortError' ? 'Tempo limite ao consultar a sessão. Tente entrar novamente.' : e.message); }).finally(() => { clearTimeout(timer); if (active) setRestoring(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    if (!operator) return;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    let active = true; setLoading(true); setError(''); setResult(null);
    getAlerts(filters, page, controller.signal).then(data => { if (active) setResult(data); }).catch(e => { if (active) { if (e instanceof ApiError && e.status === 401) { setOperator(null); setAuthError('Sua sessão expirou. Entre novamente.'); } else setError(e.name === 'AbortError' ? 'A consulta excedeu o tempo limite. Tente atualizar.' : e.message); } }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [operator, filters, page, refresh]);

  useEffect(() => {
    if (!selectedId || !operator) { setSelected(null); return; }
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000); let active = true;
    setDetailLoading(true); setDetailError(''); setSelected(null); setNotice('');
    getAlert(selectedId, controller.signal).then(({ data }) => { if (active) { setSelected(data); setNextStatus(data.status); } }).catch(e => { if (active) setDetailError(e.name === 'AbortError' ? 'Tempo limite ao carregar os detalhes.' : e.message); }).finally(() => { clearTimeout(timer); if (active) setDetailLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [selectedId, operator]);

  useEffect(() => { if (!selectedId) return; const listener = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) setSelectedId(null); }; document.addEventListener('keydown', listener); const previous = document.activeElement as HTMLElement | null; const close = document.getElementById('close-details'); close?.focus(); return () => { document.removeEventListener('keydown', listener); previous?.focus(); }; }, [selectedId, saving]);

  async function saveStatus() {
    if (!selected || saving) return;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000); setMutationController(controller);
    setSaving(true); setDetailError(''); setNotice('');
    try { const { data } = await updateStatus(selected, nextStatus, controller.signal); setSelected(data); setNextStatus(data.status); setNotice('Status atualizado e salvo no servidor.'); setRefresh(n => n + 1); }
    catch (e) {
      const err = e as Error;
      setDetailError(err.name === 'AbortError' ? 'O envio excedeu o tempo limite. Reabra o alerta para verificar se o status foi salvo antes de tentar novamente.' : err.message);
      if (e instanceof ApiError && e.status === 409) { try { const { data } = await getAlert(selected.id, controller.signal); setSelected(data); setNextStatus(data.status); setDetailError('Este alerta foi alterado por outro operador. Os dados foram atualizados; revise antes de salvar novamente.'); } catch { setSelected(null); } }
    } finally { clearTimeout(timer); setSaving(false); setMutationController(null); }
  }
  function clearSession() { mutationController?.abort(); setOperator(null); setSelectedId(null); setSelected(null); setResult(null); setError(''); setFilters(emptyFilters); setDraft(emptyFilters); setPage(1); setPasswordOpen(false); }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (authBusy) return;
    const form = event.currentTarget; const fields = new FormData(form);
    const username = String(fields.get('username') || ''); const password = String(fields.get('password') || '');
    (form.elements.namedItem('password') as HTMLInputElement).value = '';
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    setAuthBusy(true); setAuthError(''); setAuthNotice('');
    try { const { data } = await login(username, password, controller.signal); setOperator(data.operator); form.reset(); }
    catch (e) { setAuthError((e as Error).name === 'AbortError' ? 'Tempo limite ao entrar. Tente novamente.' : (e as Error).message); }
    finally { clearTimeout(timer); setAuthBusy(false); }
  }
  async function logout() {
    if (authBusy) return; setAuthBusy(true); setAuthError('');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    try { await endSession(controller.signal); clearSession(); setAuthNotice('Sessão encerrada.'); }
    catch { setAuthError('Não foi possível encerrar a sessão no servidor. Tente novamente.'); }
    finally { clearTimeout(timer); setAuthBusy(false); }
  }
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (authBusy) return;
    const form = event.currentTarget; const fields = new FormData(form);
    const currentPassword = String(fields.get('currentPassword') || ''); const newPassword = String(fields.get('newPassword') || ''); form.reset();
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    setAuthBusy(true); setAuthError('');
    try { await changePassword(currentPassword, newPassword, controller.signal); clearSession(); setAuthNotice('Senha alterada. Todas as sessões foram encerradas; entre com a nova senha.'); }
    catch (e) { setAuthError((e as Error).name === 'AbortError' ? 'Tempo limite. Tente entrar com a nova senha para conferir a alteração.' : (e as Error).message); }
    finally { clearTimeout(timer); setAuthBusy(false); }
  }

  const mapped = useMemo(() => result?.data.filter(a => a.latitude !== null && a.longitude !== null) || [], [result]);
  const totalPages = result ? Math.max(1, Math.ceil(result.pagination.total / result.pagination.pageSize)) : 1;
  return <div className="shell">
    <aside className="sidebar"><a href="/" className="brand"><span className="brand-icon"><MapPin size={25} /></span><span>SOS <strong>Localiza</strong><small>CENTRAL DE ATENDIMENTO</small></span></a><div className="sidebar-label">OPERAÇÃO</div><div className="nav-active"><LayoutDashboard size={18} /> Visão geral</div><div className="sidebar-bottom"><ShieldCheck size={23} /><strong>Conexão que protege.</strong><p>Informação para agir.<br />Cuidado para transformar.</p><span>FIAP · SOS Localiza</span></div></aside>
    <main><header><div className="breadcrumb">Central <ChevronRight size={14} /><strong>Visão geral</strong></div><div className="operator"><span className="operator-dot" />{operator ? operator.username : 'Acesso restrito'}{operator && <><button className="text-button" disabled={authBusy || saving} onClick={() => { setAuthError(''); setPasswordOpen(!passwordOpen); }}>Alterar senha</button><button className="icon-button" disabled={authBusy || saving} onClick={logout} aria-label="Encerrar sessão"><LogOut size={18}/></button></>}</div></header>
    <div className="content"><div className="heading"><div><div className="eyebrow">MONITORAMENTO E RESPOSTA</div><h1>Cuidar começa por localizar<span>.</span></h1><p>Acompanhe os alertas da comunidade e organize o atendimento.</p></div>{operator && <button className="secondary" onClick={() => setRefresh(n => n + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Atualizar</button>}</div>
    {authError && <div className="error" role="alert">{authError}</div>}
    {authNotice && <div className="success" role="status">{authNotice}</div>}
    {restoring ? <p role="status">Verificando sessão…</p> : !operator ? <section className="login-card"><div className="login-icon"><LockKeyhole size={28}/></div><div className="eyebrow">ÁREA DO OPERADOR</div><h2>Acesse a central</h2><p>Entre com seu usuário e senha para consultar e atender os alertas.</p><form onSubmit={authenticate}><label htmlFor="operator-username">Usuário</label><input id="operator-username" name="username" autoComplete="username" maxLength={80} required/><label htmlFor="operator-password">Senha</label><input id="operator-password" name="password" type="password" autoComplete="current-password" maxLength={256} required/><button className="primary" disabled={authBusy}>{authBusy ? 'Entrando…' : 'Acessar central'} <ArrowRight size={17}/></button></form><small>Use Encerrar sessão ao terminar o atendimento.</small></section> : <>
    {operator.mustChangePassword && <div className="password-warning" role="status">A senha inicial é compartilhada para a demonstração acadêmica. Altere-a antes de qualquer uso fora da demonstração.</div>}
    {passwordOpen && <section className="login-card password-card"><h2>Alterar senha</h2><form onSubmit={savePassword}><label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" maxLength={256} required/></label><label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/></label><small>Use de 12 a 256 caracteres. A alteração encerra todas as sessões deste operador.</small><button className="primary" disabled={authBusy}>{authBusy ? 'Salvando…' : 'Salvar nova senha'}</button><button className="secondary" type="button" disabled={authBusy} onClick={() => setPasswordOpen(false)}>Cancelar</button></form></section>}
    <section className="stats" aria-label="Resumo de todos os alertas filtrados">{[{ label: 'Alertas encontrados', value: result?.summary.total, icon: Radio, className: 'all' }, { label: 'Novos alertas', value: result?.summary.novo, icon: Activity, className: 'new' }, { label: 'Em atendimento', value: result?.summary.em_atendimento, icon: Clock3, className: 'progress' }, { label: 'Resolvidos', value: result?.summary.resolvido, icon: Check, className: 'done' }].map(({ label, value, icon: Icon, className }) => <article className={`stat ${className}`} key={label}><div><span>{label}</span><strong>{value ?? '—'}</strong></div><span className="stat-icon"><Icon size={22}/></span></article>)}</section>
    <form className="filters" onSubmit={e => { e.preventDefault(); setFilters({ ...draft, q: draft.q.trim() }); setPage(1); }}><div className="filter-title"><Filter size={17}/><strong>Filtrar alertas</strong><span>Resumo considera todos os resultados.</span></div><div className="filter-grid"><label className="search-label">Buscar<div className="search-input"><Search size={16}/><input placeholder="Nome, localização ou observação" value={draft.q} maxLength={120} onChange={e => setDraft({ ...draft, q: e.target.value })}/></div></label><label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="">Todos os status</option>{Object.entries(STATUSES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Tipo de ocorrência<select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="">Todos os tipos</option>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label><label>De (UTC)<input type="date" value={draft.from} max={draft.to || undefined} onChange={e => setDraft({ ...draft, from: e.target.value })}/></label><label>Até (UTC)<input type="date" value={draft.to} min={draft.from || undefined} onChange={e => setDraft({ ...draft, to: e.target.value })}/></label></div><div className="filter-actions"><button type="button" className="text-button" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); }}>Limpar filtros</button><button className="primary" disabled={loading}>Aplicar filtros</button></div></form>
    {error && <div className="error" role="alert"><strong>Não foi possível carregar os alertas.</strong><span>{error}</span><button className="text-button" onClick={() => setRefresh(n => n + 1)}>Tentar novamente</button></div>}
    {loading && <div className="loading" role="status"><LoaderCircle size={20} className="spin"/> Consultando alertas na API…</div>}
    <section className="panel map-panel"><div className="panel-heading"><div><h2><MapPin size={19}/> Mapa de ocorrências</h2><p>Somente alertas com GPS na página carregada · {mapped.length} de {result?.data.length ?? 0} alertas</p></div><span className="map-caption">OpenStreetMap</span></div><div className="map-wrap"><AlertMap alerts={mapped} onSelect={setSelectedId}/>{!mapped.length && <div className="map-empty">{loading ? 'Carregando coordenadas…' : error ? 'Mapa sem dados: consulta indisponível.' : 'Nenhum alerta com GPS nesta página.'}</div>}</div><div className="map-legend">{Object.entries(STATUSES).map(([status, label]) => <span key={status}><i style={{ background: color(status as Status) }}/>{label}</span>)}<span>Endereços sem GPS aparecem na lista.</span></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>Alertas da comunidade</h2><p>Mais recentes primeiro · horários no fuso do seu dispositivo</p></div><span className="count">{result?.pagination.total ?? '—'} resultados</span></div><div className="table-scroll"><table><thead><tr><th>Ocorrência / protocolo</th><th>Localização</th><th>Recebido em</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{result?.data.map(alert => <tr key={alert.id}><td><strong>{alert.type}</strong><small title={alert.id}>{alert.id.slice(0, 8)}</small></td><td><span className="location-text">{alert.location}</span><small>{alert.latitude === null ? 'Endereço sem GPS' : 'Coordenadas disponíveis'}</small></td><td className="date-cell">{formatDate(alert.date)}</td><td><Badge status={alert.status}/></td><td><button className="detail-button" onClick={() => setSelectedId(alert.id)} aria-label={`Ver detalhes do alerta ${alert.id}`}>Detalhes <ChevronRight size={15}/></button></td></tr>)}</tbody></table></div>{!loading && !error && result?.data.length === 0 && <div className="empty"><Radio size={30}/><h3>Nenhum alerta encontrado</h3><p>Os alertas enviados pelo app aparecerão aqui. Revise os filtros ou atualize a consulta.</p></div>}<div className="pagination"><span>Página {result?.pagination.page ?? page} de {totalPages} · até 25 alertas por página</span><div><button className="icon-button" disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)} aria-label="Página anterior"><ArrowLeft size={18}/></button><button className="icon-button" disabled={loading || !result || page >= totalPages} onClick={() => setPage(n => n + 1)} aria-label="Próxima página"><ArrowRight size={18}/></button></div></div></section>
    <footer><span>SOS Localiza Central</span><span>Dados consultados pela API · atualização manual</span></footer>
    </> }</div></main>
    {operator && selectedId && <div className="modal-overlay" onClick={() => { if (!saving) setSelectedId(null); }}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key !== 'Tab') return; const elements = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href], input:not(:disabled)'); const first = elements[0]; const last = elements[elements.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }}><div className="detail-header"><div><div className="eyebrow">ATENDIMENTO</div><h2 id="detail-title">Detalhes do alerta</h2></div><button id="close-details" className="icon-button" disabled={saving} onClick={() => setSelectedId(null)} aria-label="Fechar detalhes"><X size={22}/></button></div>{detailLoading && <p role="status">Carregando detalhes…</p>}{detailError && <div className="error" role="alert">{detailError}</div>}{notice && <div className="success" role="status"><Check size={17}/>{notice}</div>}{selected && <><div className="detail-type"><h3>{selected.type}</h3><Badge status={selected.status}/></div><dl><dt>Protocolo</dt><dd className="protocol">{selected.id}</dd><dt>Recebido em</dt><dd>{formatDate(selected.date)}</dd><dt>Localização</dt><dd>{selected.location}<small>{selected.source}</small>{selected.latitude !== null && <small>GPS: {selected.latitude}, {selected.longitude}</small>}</dd><dt>Solicitante</dt><dd>{selected.profile.name}</dd><dt>CPF</dt><dd>{selected.profile.cpf}</dd><dt>Telefone</dt><dd>{selected.profile.phone}</dd><dt>Endereço cadastrado</dt><dd>{selected.profile.address}</dd><dt>Observações</dt><dd className="notes">{selected.notes || 'Nenhuma observação informada.'}</dd><dt>Última atualização</dt><dd>{formatDate(selected.updatedAt)} · versão {selected.version}</dd></dl><div className="status-form"><label htmlFor="new-status">Status do atendimento</label><select id="new-status" value={nextStatus} disabled={saving} onChange={e => setNextStatus(e.target.value as Status)}>{Object.entries(STATUSES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><button className="primary" disabled={saving || nextStatus === selected.status} onClick={saveStatus}>{saving ? <><LoaderCircle className="spin" size={16}/> Salvando…</> : 'Salvar status'}</button></div></>}</section></div>}
  </div>;
}
