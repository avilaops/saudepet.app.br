import type { ApiPayload } from '../../types/api'
import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// O Saúde Pet opera exclusivamente com o Mercado Pago — a tela não oferece
// escolha de gateway de propósito.
const GATEWAY = 'mercado_pago';

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

export default function AdminPagamentos() {
  const { user } = useAuth();
  const tenantSlug = user?.tenant_slug || (user as any)?.tenant?.slug || 'saudepet';
  const webhookUrl = `${window.location.origin}/api/v1/webhooks/mercadopago/${tenantSlug}`;

  const [config, setConfig] = useState<ApiPayload | null>(null); // registro mercado_pago, se existir
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testResult, setTestResult] = useState<ApiPayload | null>(null); // { success, message, error? }
  const [feedback, setFeedback] = useState<ApiPayload | null>(null); // { tone: 'ok'|'erro', text }
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<ApiPayload>({
    ambiente: 'production',
    public_key: '',
    secret_key: '',
    webhook_secret: '',
  });

  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/v1/gateways`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const atual = (data.gateways || []).find((g: ApiPayload) => g.gateway === GATEWAY) || null;
      setConfig(atual);
      if (atual?.ambiente) setForm((f: ApiPayload) => ({ ...f, ambiente: atual.ambiente }));
    } catch {
      notify('erro', 'Não foi possível carregar a configuração do gateway.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvar = async (event: any) => {
    event.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/v1/gateways/configure`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          gateway: GATEWAY,
          ambiente: form.ambiente,
          public_key: form.public_key.trim() || undefined,
          secret_key: form.secret_key.trim(),
          webhook_secret: form.webhook_secret.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('erro', data.error || data.message || 'Não foi possível salvar as credenciais.');
        return;
      }
      // Credenciais nunca ficam na tela depois de salvas.
      setForm((f: ApiPayload) => ({ ...f, public_key: '', secret_key: '', webhook_secret: '' }));
      await load();
      notify('ok', 'Credenciais salvas e criptografadas. Rode o teste de conexão para validar.');
    } finally {
      setSaving(false);
    }
  };

  const testar = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/v1/gateways/${GATEWAY}/test`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: 'Falha na conexão', error: 'Serviço indisponível.' });
    } finally {
      setTesting(false);
    }
  };

  const alternar = async () => {
    if (!config) return;
    setToggling(true);
    try {
      const res = await fetch(`${API_URL}/v1/gateways/${config.id}/toggle`, {
        method: 'PATCH',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('erro', data.error || 'Não foi possível alterar o status.');
        return;
      }
      await load();
      notify('ok', data.message);
    } finally {
      setToggling(false);
    }
  };

  const remover = async () => {
    if (!config) return;
    const confirmado = window.confirm(
      'Remover a configuração do Mercado Pago? Cobranças novas deixarão de funcionar até novas credenciais serem salvas.'
    );
    if (!confirmado) return;
    setRemoving(true);
    try {
      const res = await fetch(`${API_URL}/v1/gateways/${config.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('erro', data.error || 'Não foi possível remover a configuração.');
        return;
      }
      setTestResult(null);
      await load();
      notify('ok', 'Configuração removida.');
    } finally {
      setRemoving(false);
    }
  };

  const copiarWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      notify('erro', 'Não foi possível copiar. Selecione a URL manualmente.');
    }
  };

  return (
    // Coluna estreita de propósito: formulário longo de credenciais de pagamento.
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-sky-600" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-sky-600">Pagamentos</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Gateway Mercado Pago</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          O Saúde Pet opera exclusivamente com o Mercado Pago. As credenciais são criptografadas no servidor e
          nunca voltam para esta tela.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.tone === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
          role="status"
        >
          {feedback.tone === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      {/* Situação atual */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Situação atual</span>
            {loading ? (
              <div className="mt-2 text-xs font-bold text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            ) : config ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                    config.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {config.ativo ? 'Ativo' : 'Desativado'}
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-extrabold uppercase tracking-wider">
                  {config.ambiente === 'production' ? 'Produção' : 'Sandbox'}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  atualizado em {new Date(config.atualizado_em || config.criado_em).toLocaleString('pt-BR')}
                </span>
              </div>
            ) : (
              <p className="mt-2 text-xs font-bold text-amber-600">
                Nenhuma credencial configurada — cobranças estão inoperantes.
              </p>
            )}
          </div>

          {config && (
            <div className="flex gap-2">
              <button
                onClick={testar}
                disabled={testing}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                Testar conexão
              </button>
              <button
                onClick={alternar}
                disabled={toggling}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                {config.ativo ? 'Desativar' : 'Ativar'}
              </button>
              <button
                onClick={remover}
                disabled={removing}
                className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
                title="Remover configuração"
              >
                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {testResult && (
          <div
            className={`mt-4 p-4 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>
              {testResult.message}
              {testResult.error ? ` — ${testResult.error}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Formulário de credenciais */}
      <form onSubmit={salvar} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {config ? 'Substituir credenciais' : 'Cadastrar credenciais'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Ambiente</span>
            <select
              value={form.ambiente}
              onChange={(e) => setForm({ ...form, ambiente: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            >
              <option value="production">Produção</option>
              <option value="sandbox">Sandbox (testes)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">Public key</span>
            <input
              type="text"
              value={form.public_key}
              onChange={(e) => setForm({ ...form, public_key: e.target.value })}
              placeholder="APP_USR-..."
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">
              Access token <span className="text-red-500">*</span>
            </span>
            <input
              type="password"
              required
              value={form.secret_key}
              onChange={(e) => setForm({ ...form, secret_key: e.target.value })}
              placeholder="APP_USR-... (credencial secreta)"
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">Assinatura secreta do webhook (opcional)</span>
            <input
              type="password"
              value={form.webhook_secret}
              onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
              placeholder="Chave usada para validar o x-signature das notificações"
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Encontrada no painel do Mercado Pago em Suas integrações → Webhooks. Sem ela, notificações não passam
              na validação de assinatura.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {config ? 'Substituir credenciais' : 'Salvar credenciais'}
        </button>
      </form>

      {/* Webhook */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notificações (webhook)</span>
        <p className="mt-1 text-xs text-slate-500">
          Cadastre esta URL no painel do Mercado Pago (Suas integrações → Webhooks → modo produção, evento
          <span className="font-bold"> payment</span>):
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded-xl bg-slate-900 text-slate-100 px-4 py-3 text-xs font-mono break-all">
            {webhookUrl}
          </code>
          <button
            onClick={copiarWebhook}
            className="p-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
            title="Copiar URL"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
