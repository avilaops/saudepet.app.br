import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, Filter, Download, Calendar, User, FileText, CheckCircle2, Clock, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../../services/api'

// A tela lia `total` e mostrava só a primeira página: "1.842 registros
// encontrados" acima de 50 linhas, sem dizer que existiam mais. O backend
// limita a 200 por página.
const POR_PAGINA = 50;

// Nome humano para os `entity_type` que o sistema realmente grava. O que não
// estiver aqui aparece com o próprio valor — melhor um nome técnico do que uma
// opção que não existe.
const ROTULO_ENTIDADE: Record<string, string> = {
  atendimento: 'Atendimento',
  Solicitacao: 'Solicitação',
  usuario: 'Usuário / Perfil',
  payment: 'Pagamento / Split',
  Transacao: 'Transação / Repasse',
  Punicao: 'Moderação (punição)',
  Veterinario: 'Credenciamento de veterinário',
  veterinario_conta_bancaria: 'Conta bancária do veterinário',
  GatewayConfig: 'Gateway de pagamento',
  Tenant: 'Organização',
  Partner: 'Parceiro',
  CommissionRule: 'Regra de comissão',
  configuracao_cidade: 'Cidade e preços',
  landing_banner: 'Banner da landing',
  auditoria: 'Consulta à auditoria',
  PetVacina: 'Vacina do pet',
  PetMedicamento: 'Medicamento do pet',
  PetAlergia: 'Alergia do pet'
};

export default function AdminAuditoriaCentral() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoEvento, setTipoEvento] = useState('');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [paginacao, setPaginacao] = useState<ApiPayload | null>(null);
  // As entidades vêm do próprio log. A lista escrita à mão tinha 4 de 6
  // opções que não casavam com nenhum `entity_type` gravado e devolviam
  // resultado vazio sempre.
  const [entidades, setEntidades] = useState<ApiPayload[]>([]);
  const [exportando, setExportando] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [tipoEvento, periodoInicio, periodoFim, pagina]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (tipoEvento) params.append('tipoEvento', tipoEvento);
      if (periodoInicio) params.append('periodoInicio', periodoInicio);
      if (periodoFim) params.append('periodoFim', periodoFim);
      params.append('page', String(pagina));
      params.append('limit', String(POR_PAGINA));

      const res = await fetch(`${API_URL}/v1/admin/auditoria/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPaginacao(data.paginacao || null);
      if (Array.isArray(data.entidades)) setEntidades(data.entidades);
    } catch (err: any) {
      console.error('Erro ao buscar logs de auditoria:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtro novo recomeça na primeira página: ficar na página 12 de um recorte
  // que passou a ter 3 devolveria tabela vazia sem explicação.
  const aplicarFiltros = () => {
    if (pagina !== 1) {
      setPagina(1); // o efeito recarrega
      return;
    }
    fetchLogs();
  };

  const trocarFiltro = (setter: ApiPayload) => (valor: string) => {
    setPagina(1);
    setter(valor);
  };

  // Monta os mesmos filtros da tela: exportar "o que está na tela" precisa ser
  // literalmente isso. Antes o botão mandava só `format=json` e o relatório saía
  // com os 2 000 últimos registros do tenant, ignorando o recorte do perito.
  const filtrosAtuais = () => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (tipoEvento) params.append('tipoEvento', tipoEvento);
    if (periodoInicio) params.append('periodoInicio', periodoInicio);
    if (periodoFim) params.append('periodoFim', periodoFim);
    return params;
  };

  const exportar = async (formato: string) => {
    setExportando(formato);
    try {
      const token = localStorage.getItem('token');
      const params = filtrosAtuais();
      params.append('format', formato);

      const res = await fetch(`${API_URL}/v1/admin/auditoria/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saudepet-auditoria-${new Date().toISOString().slice(0, 10)}.${formato}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Erro ao exportar logs:', err);
    } finally {
      setExportando('');
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Top Header */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-600">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-xs font-extrabold uppercase tracking-wider">Perícia & Rastreabilidade Imutável</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Central de Auditoria Geral (Append-Only)</h1>
          <p className="text-xs text-slate-500 mt-0.5">Histórico imutável de eventos, acessos, chamados, pagamentos e ações administrativas.</p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex gap-2">
            <button
              onClick={() => exportar('json')}
              disabled={Boolean(exportando)}
              className="py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-slate-900/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {exportando === 'json' ? 'Exportando…' : 'Exportar JSON'}
            </button>
            <button
              onClick={() => exportar('csv')}
              disabled={Boolean(exportando)}
              className="py-3 px-5 border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {exportando === 'csv' ? 'Exportando…' : 'Exportar CSV'}
            </button>
          </div>
          <p className="text-[10px] font-bold text-slate-400 sm:text-right">
            Exporta o recorte filtrado acima, até 2 000 registros por arquivo.
          </p>
        </div>
      </div>

      {/* Filtros Multidimensionais */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Buscar por ID, IP ou Ação</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Pesquisar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full p-3 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Entidade</label>
            <select
              value={tipoEvento}
              onChange={(e) => trocarFiltro(setTipoEvento)(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            >
              <option value="">Todas as Entidades</option>
              {entidades.map((entidade) => (
                <option key={entidade.valor} value={entidade.valor}>
                  {ROTULO_ENTIDADE[entidade.valor] || entidade.valor} ({entidade.total})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Data Início</label>
            <input
              type="date"
              value={periodoInicio}
              onChange={(e) => trocarFiltro(setPeriodoInicio)(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Data Fim</label>
            <input
              type="date"
              value={periodoFim}
              onChange={(e) => trocarFiltro(setPeriodoFim)(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={aplicarFiltros}
            className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition"
          >
            Aplicar Filtros ({total} registros encontrados)
          </button>
        </div>
      </div>

      {/* Tabela Pericial */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400">Carregando registros imutáveis de auditoria...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400">Nenhum evento registrado nesta busca.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">Data / Hora</th>
                  <th className="p-4">Autor (User ID / Role)</th>
                  <th className="p-4">Ação / Evento</th>
                  <th className="p-4">Entidade Afetada</th>
                  <th className="p-4">IP / Origem</th>
                  <th className="p-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 font-mono text-[11px]">
                      {new Date(log.criado_em).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-900">{log.usuario_id ? `#${log.usuario_id.slice(0, 8)}` : 'Sistema / Anônimo'}</span>
                      <div className="text-[10px] text-slate-400 font-mono">{log.actor_role || 'N/A'}</div>
                    </td>
                    <td className="p-4 font-bold text-slate-800">
                      <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg font-mono text-[10px]">
                        {log.action || log.acao}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-slate-900">{log.entity_type || log.recurso || 'N/A'}</span>
                      {log.entity_id && <div className="text-[10px] font-mono text-slate-400">ID: #{log.entity_id.slice(0, 8)}</div>}
                    </td>
                    <td className="p-4 font-mono text-[10px] text-slate-500">
                      {log.ip || 'N/A'}
                    </td>
                    <td className="p-4 text-right">
                      {(log.entity_type === 'atendimento' || log.recurso === 'atendimento') && log.entity_id && (
                        <button
                          onClick={() => navigate(`/admin/atendimentos/${log.entity_id}/auditoria`)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition flex items-center gap-1 ml-auto"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Linha do Tempo
                        </button>
                      )}
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
              Página {paginacao.pagina} de {paginacao.paginas} · exibindo {logs.length} de {paginacao.total} registro(s)
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
  );
}
