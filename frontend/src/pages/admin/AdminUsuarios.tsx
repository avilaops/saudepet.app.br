import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ShieldCheck, LogOut, ArrowLeft, Search, RefreshCw, KeyRound, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_URL } from '../../services/api'

// A tela pedia a rota sem `page` e mostrava a primeira página como se fosse a
// plataforma inteira. O backend limita a 100 por página.
const POR_PAGINA = 20;

export default function AdminUsuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<ApiPayload[]>([]);
  const [filtro, setFiltro] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [paginacao, setPaginacao] = useState<ApiPayload | null>(null);

  // Role Change Modal
  const [selectedUser, setSelectedUser] = useState<ApiPayload | null>(null);
  const [novoTipo, setNovoTipo] = useState('tutor');
  const [motivo, setMotivo] = useState('');
  const [submittingRole, setSubmittingRole] = useState(false);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null); // { tone: 'ok'|'erro', text }
  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };


  useEffect(() => {
    carregarUsuarios();
  }, [filtro, pagina]);

  const carregarUsuarios = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filtro) params.append('tipo', filtro);
      if (search) params.append('search', search);
      params.append('page', String(pagina));
      params.append('limit', String(POR_PAGINA));

      const res = await fetch(`${API_URL}/v1/admin/usuarios-gestao?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUsuarios(data.usuarios || []);
      setPaginacao(data.paginacao || null);
    } catch (error: any) {
      console.error('Erro ao carregar usuários:', error);
    } finally {
      setLoading(false);
    }
  };

  // Trocar de filtro ou de busca invalida a página em que se estava: continuar
  // na página 7 de um recorte que agora tem 2 páginas devolveria tabela vazia.
  const aplicarFiltro = (novoFiltro: ApiPayload) => {
    setPagina(1);
    setFiltro(novoFiltro);
  };

  const buscar = (e: any) => {
    e.preventDefault();
    if (pagina !== 1) {
      setPagina(1); // o efeito recarrega
      return;
    }
    carregarUsuarios();
  };

  const handleRevocarSessoes = async (id: string, nome: ApiPayload) => {
    if (window.confirm(`Deseja revogar imediatamente todas as sessões e tokens ativas do usuário ${nome}?`)) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/v1/admin/usuarios-gestao/${id}/revoke-sessions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          notify('ok', `Sessões do usuário ${nome} revogadas com sucesso.`);
        } else {
          notify('erro', data.message || 'Não foi possível revogar as sessões.');
        }
      } catch (err: any) {
        console.error('Erro ao revogar sessões:', err);
        notify('erro', 'Falha de conexão ao revogar as sessões. Tente novamente.');
      }
    }
  };

  const handleAlterarRole = async (e: any) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      setSubmittingRole(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/usuarios-gestao/${selectedUser.id}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ novoTipo, motivo })
      });

      const data = await res.json();
      if (res.ok) {
        notify('ok', `Privilégios do usuário ${selectedUser.nome} alterados para ${novoTipo} com registro em log de auditoria.`);
        setSelectedUser(null);
        setMotivo('');
        carregarUsuarios();
      } else {
        notify('erro', data.message || 'Não foi possível alterar os privilégios.');
      }
    } catch (err: any) {
      console.error('Erro ao alterar privilégios:', err);
      notify('erro', 'Falha de conexão ao alterar os privilégios. Tente novamente.');
    } finally {
      setSubmittingRole(false);
    }
  };

  return (
    <>
      <div className="space-y-8">
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-xs font-bold ${
              feedback.tone === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
            role="status"
          >
            {feedback.text}
          </div>
        )}


        
        {/* Header Superior */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-600">
              <Users className="w-5 h-5" />
              <span className="text-xs font-extrabold uppercase tracking-wider">Gestão Avançada de Acessos & Sessões</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Usuários, Permissões & Revogação</h1>
            <p className="text-xs text-slate-500 mt-0.5">Gerencie os papéis granulares da plataforma com histórico imutável e proteção contra auto-promoção.</p>
          </div>

          <button
            onClick={() => navigate('/admin')}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao Dashboard Admin
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex flex-wrap gap-2">
            {[
              { id: '', label: 'Todos' },
              { id: 'tutor', label: 'Tutores' },
              { id: 'veterinario', label: 'Veterinários' },
              { id: 'admin', label: 'Administradores' },
              { id: 'super_admin', label: 'Super Admins' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => aplicarFiltro(f.id)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition ${filtro === f.id ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={buscar}
            className="flex gap-2 w-full sm:w-auto"
          >
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 w-full sm:w-64"
            />
            <button type="submit" className="p-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0">
              <Search className="w-4 h-4" /> Buscar
            </button>
          </form>
        </div>

        {/* Tabela de Usuários */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400">Carregando permissões de usuários...</div>
          ) : usuarios.length === 0 ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400">Nenhum usuário encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="p-4">Usuário</th>
                    <th className="p-4">Tipo / Role</th>
                    <th className="p-4">Contato</th>
                    <th className="p-4">Data Cadastro</th>
                    <th className="p-4 text-right">Ações de Segurança</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {usuarios.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition">
                      <td className="p-4">
                        <div className="font-extrabold text-slate-900">{u.nome}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: #{u.id.slice(0, 8)}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase border ${u.tipo_usuario === 'super_admin' ? 'bg-purple-50 text-purple-700 border-purple-200' : u.tipo_usuario === 'admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : u.tipo_usuario === 'veterinario' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {u.tipo_usuario}
                        </span>
                      </td>
                      <td className="p-4">
                        <div>{u.email}</div>
                        <div className="text-[11px] text-slate-400">{u.telefone || 'Sem telefone'}</div>
                      </td>
                      <td className="p-4 font-mono text-[11px]">
                        {new Date(u.criado_em).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => { setSelectedUser(u); setNovoTipo(u.tipo_usuario); }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition inline-flex items-center gap-1"
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Privilégios
                        </button>
                        <button
                          onClick={() => handleRevocarSessoes(u.id, u.nome)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl border border-red-200 transition inline-flex items-center gap-1"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Revogar Sessões
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {paginacao && paginacao.total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs font-bold text-slate-500">
              <span>
                Página {paginacao.pagina} de {paginacao.paginas} · {paginacao.total} usuário(s) no total
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                  disabled={loading || paginacao.pagina <= 1}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </button>
                <button
                  onClick={() => setPagina((atual) => Math.min(paginacao.paginas, atual + 1))}
                  disabled={loading || paginacao.pagina >= paginacao.paginas}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* MODAL DE ALTERAÇÃO DE ROLE / PERMISSÕES */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handleAlterarRole} className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Alterar Privilégios do Usuário</h3>
              <button type="button" onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p>Usuário: <strong>{selectedUser.nome}</strong> ({selectedUser.email})</p>
              <p>Função Atual: <strong className="uppercase font-mono">{selectedUser.tipo_usuario}</strong></p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nova Função / Role *</label>
                <select
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                >
                  <option value="tutor">Tutor</option>
                  <option value="veterinario">Veterinário</option>
                  <option value="admin">Administrador</option>
                  <option value="super_admin">Super Administrador</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motivo / Justificativa Mandatória *</label>
                <textarea
                  rows={3}
                  placeholder="Justificativa formal para alteração de privilégios..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="py-3 px-4 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingRole || !motivo}
                className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-slate-900/20 disabled:opacity-50"
              >
                {submittingRole ? 'Gravando Log...' : 'Confirmar e Auditar'}
              </button>
            </div>
          </form>
        </div>
      )}

    </>
  );
}
