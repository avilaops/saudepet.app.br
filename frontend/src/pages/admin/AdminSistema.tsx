import type { ApiPayload } from '../../types/api'
import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Send,
  ServerCog,
  Wifi,
  XCircle,
} from 'lucide-react';
import { API_URL } from '../../services/api'

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

// Os interruptores de SMS saíram: não existe uma linha de código de envio de SMS
// no produto (zero ocorrências de Twilio ou equivalente). Um interruptor que não
// pode fazer nada é pior do que a ausência dele — sugere um canal que a operação
// acha que tem e não tem.
const ROTULOS_NOTIFICACAO = {
  notificacao_email: 'Notificações por e-mail',
  notificacao_popup: 'Notificações em tela (popup)',
  email_novo_veterinario: 'E-mail quando um veterinário se credencia',
  popup_novo_veterinario: 'Popup quando um veterinário se credencia',
};

export default function AdminSistema() {
  const [smtp, setSmtp] = useState<ApiPayload | null>(null);
  const [smtpTeste, setSmtpTeste] = useState<ApiPayload | null>(null);
  const [testando, setTestando] = useState(false);
  const [destinatario, setDestinatario] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [notif, setNotif] = useState<ApiPayload | null>(null);
  const [salvandoNotif, setSalvandoNotif] = useState(false);
  const [chave, setChave] = useState<ApiPayload | null>(null);
  const [gerandoChave, setGerandoChave] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null);
  const [erroCarga, setErroCarga] = useState(false);

  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const carregar = () => {
    setErroCarga(false);
    fetch(`${API_URL}/v1/config/smtp`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('smtp'))))
      .then(setSmtp)
      .catch(() => setErroCarga(true));
    fetch(`${API_URL}/v1/notificacoes/configuracoes`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('notif'))))
      .then(setNotif)
      .catch(() => setErroCarga(true));
  };

  useEffect(() => {
    carregar();
  }, []);

  const testarSmtp = async () => {
    setTestando(true);
    setSmtpTeste(null);
    try {
      const r = await fetch(`${API_URL}/v1/config/smtp/testar`, { method: 'POST', headers: authHeaders() });
      setSmtpTeste(await r.json());
    } catch {
      setSmtpTeste({ success: false, message: 'Serviço indisponível.' });
    } finally {
      setTestando(false);
    }
  };

  const enviarTeste = async () => {
    setEnviandoEmail(true);
    try {
      const r = await fetch(`${API_URL}/v1/config/smtp/email-teste`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ destinatario: destinatario.trim() }),
      });
      const d = await r.json();
      notify(r.ok && d.success ? 'ok' : 'erro', d.message || d.error || 'Falha ao enviar.');
    } catch {
      notify('erro', 'Falha de conexão ao enviar o e-mail de teste. Tente novamente.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const alternarNotif = async (campo: string) => {
    const novo = { ...notif, [campo]: !notif[campo] };
    setNotif(novo);
    setSalvandoNotif(true);
    try {
      const corpo = Object.fromEntries(Object.keys(ROTULOS_NOTIFICACAO).map((k) => [k, novo[k]]));
      const r = await fetch(`${API_URL}/v1/notificacoes/configuracoes`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(corpo),
      });
      if (!r.ok) {
        setNotif(notif); // desfaz
        notify('erro', 'Não foi possível salvar a configuração.');
      }
    } catch {
      setNotif(notif); // desfaz o update otimista em falha de rede
      notify('erro', 'Falha de conexão — a configuração não foi salva.');
    } finally {
      setSalvandoNotif(false);
    }
  };

  const gerarChave = async () => {
    setGerandoChave(true);
    setChave(null);
    try {
      const r = await fetch(`${API_URL}/v1/gateways/generate-key`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || d.message || 'Geração indisponível (bloqueada em produção).');
        return;
      }
      setChave(d.key);
    } catch {
      notify('erro', 'Falha de conexão ao gerar a chave. Tente novamente.');
    } finally {
      setGerandoChave(false);
    }
  };

  const copiarChave = async () => {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiada(true);
      window.setTimeout(() => setCopiada(false), 2500);
    } catch {
      notify('erro', 'Não foi possível copiar — selecione manualmente.');
    }
  };

  return (
    // Coluna estreita de propósito: painel de configuração é formulário, não tabela.
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <ServerCog className="w-5 h-5 text-slate-700" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Sistema</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Configurações do sistema</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          SMTP, notificações administrativas e chave de criptografia. Área exclusiva do super admin.
        </p>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${feedback.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`} role="status">
          {feedback.tone === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      {/* SMTP */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-sky-600" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Servidor de e-mail (SMTP)</span>
        </div>
        {smtp ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div><span className="text-slate-400 font-bold block">Host</span><span className="font-mono text-slate-800">{smtp.host || '— não configurado'}</span></div>
            <div><span className="text-slate-400 font-bold block">Porta</span><span className="font-mono text-slate-800">{smtp.port || '—'}</span></div>
            <div><span className="text-slate-400 font-bold block">TLS/SSL</span><span className="font-mono text-slate-800">{smtp.secure ? 'sim' : 'não'}</span></div>
            <div><span className="text-slate-400 font-bold block">Usuário</span><span className="font-mono text-slate-800 break-all">{smtp.user || '—'}</span></div>
          </div>
        ) : erroCarga ? (
          <div className="text-xs font-bold text-red-600 flex items-center gap-3">
            <span>Não foi possível carregar as configurações.</span>
            <button onClick={carregar} className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs">
              Tentar de novo
            </button>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400">Carregando…</p>
        )}
        {smtp && !smtp.host && (
          <p className="text-xs font-bold text-amber-600">
            SMTP não configurado — verificação de e-mail e recuperação de senha estão inoperantes. Preencha SMTP_* no ambiente do servidor.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={testarSmtp} disabled={testando} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60">
            {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />} Testar conexão
          </button>
          <div className="flex flex-1 gap-2">
            <input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="email@para-teste.com" className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            <button onClick={enviarTeste} disabled={!/\S+@\S+\.\S+/.test(destinatario) || enviandoEmail} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50">
              {enviandoEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar teste
            </button>
          </div>
        </div>
        {smtpTeste && (
          <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${smtpTeste.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {smtpTeste.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {smtpTeste.message || (smtpTeste.success ? 'Conexão bem-sucedida.' : 'Falha na conexão.')}
          </div>
        )}
      </div>

      {/* Notificações */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notificações administrativas</span>
          </div>
          {salvandoNotif && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        <p className="mb-3 text-[11px] font-medium text-slate-400">
          Valem para os avisos que a equipe recebe quando um veterinário se credencia.
        </p>
        {notif ? (
          <div className="divide-y divide-slate-100">
            {Object.entries(ROTULOS_NOTIFICACAO).map(([campo, rotulo]) => (
              <label key={campo} className="flex items-center justify-between py-2.5 cursor-pointer">
                <span className="text-xs font-medium text-slate-700">{rotulo}</span>
                <button
                  onClick={() => alternarNotif(campo)}
                  className={`relative h-5 w-9 rounded-full transition ${notif[campo] ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  role="switch"
                  aria-checked={Boolean(notif[campo])}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${notif[campo] ? 'left-4.5 translate-x-0 right-0.5' : 'left-0.5'}`} style={{ left: notif[campo] ? 'calc(100% - 1.125rem)' : '0.125rem' }} />
                </button>
              </label>
            ))}
          </div>
        ) : erroCarga ? (
          <div className="text-xs font-bold text-red-600 flex items-center gap-3">
            <span>Não foi possível carregar as configurações.</span>
            <button onClick={carregar} className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs">
              Tentar de novo
            </button>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400">Carregando…</p>
        )}
      </div>

      {/* Chave de criptografia */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-violet-600" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chave de criptografia do gateway</span>
        </div>
        <p className="text-xs text-slate-500">
          Gera uma ENCRYPTION_KEY nova para criptografar credenciais de pagamento. Por segurança, o endpoint só
          funciona em ambiente de desenvolvimento — em produção a chave é gerida direto no servidor. Trocar a chave
          invalida as credenciais já salvas.
        </p>
        <button onClick={gerarChave} disabled={gerandoChave} className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60">
          {gerandoChave ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Gerar chave
        </button>
        {chave && (
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-xl bg-slate-900 text-slate-100 px-4 py-3 text-xs font-mono break-all">{chave}</code>
            <button onClick={copiarChave} className="p-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200" title="Copiar">
              {copiada ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
