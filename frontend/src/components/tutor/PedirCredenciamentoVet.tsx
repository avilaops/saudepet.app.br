import type { ApiPayload } from '../../types/api'
import { useState } from 'react';
import api from '../../services/api';
import { Eyebrow, Icon, Panel } from '../ui/AppKit';

/**
 * "Sou veterinário(a)" dentro da conta de tutor.
 *
 * Até 26/08/2026 o papel era decidido no primeiro segundo de vida da conta, na
 * tela de cadastro, e nunca mais mudava: não havia nenhuma rota no backend que
 * promovesse alguém. Quem entrou com o Google virou tutor sem ser perguntado —
 * o `AUTH_DEFAULT_ROLE` decide por você — e a única saída era criar uma segunda
 * conta com outro e-mail.
 *
 * O pedido não muda o papel na hora, e isso é proposital: CRMV é documento
 * profissional, e liberar a área de atendimento por causa de um campo digitado
 * seria confiar num número que ninguém conferiu. A conta segue funcionando como
 * tutor enquanto a equipe analisa — quem tem pet em casa não fica sem o app
 * esperando aprovação.
 */
export default function PedirCredenciamentoVet() {
  const [aberto, setAberto] = useState(false);
  const [crmv, setCrmv] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ApiPayload | null>(null); // { ok, texto }

  const enviar = async (e: any) => {
    e.preventDefault();
    if (!crmv.trim()) {
      setResultado({ ok: false, texto: 'Informe seu CRMV para continuar.' });
      return;
    }

    setEnviando(true);
    setResultado(null);
    try {
      const { data } = await api.post('/v1/veterinarios/credenciamento', {
        crmv: crmv.trim(),
        especialidade: especialidade.trim() || undefined
      });
      setResultado({ ok: true, texto: data.message });
      setAberto(false);
    } catch (err: any) {
      setResultado({
        ok: false,
        texto: err.response?.data?.error || err.response?.data?.message
          || 'Não foi possível enviar seu pedido agora. Tente de novo em instantes.'
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Panel className="overflow-hidden">
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name="shield" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.85rem] font-semibold text-ink">Sou veterinário(a)</span>
            <span className="mt-0.5 block text-[0.72rem] text-slate-400">
              Peça seu credenciamento para atender pelo Saúde PET
            </span>
          </span>
          <Icon name="chevron" size={16} className="shrink-0 text-slate-300" />
        </button>
      )}

      {aberto && (
        <form onSubmit={enviar} className="space-y-3 p-4">
          <div>
            <span className="block text-[0.85rem] font-semibold text-ink">Pedir credenciamento</span>
            <p className="mt-1 text-[0.72rem] leading-relaxed text-slate-400">
              A equipe confere seu CRMV e avisa por e-mail. Sua conta continua
              funcionando normalmente enquanto isso — inclusive para cuidar dos
              seus próprios pets.
            </p>
          </div>

          <label className="block">
            <Eyebrow className="text-slate-400">CRMV</Eyebrow>
            <input
              type="text"
              value={crmv}
              onChange={(e) => setCrmv(e.target.value)}
              maxLength={20}
              required
              className="input mt-1.5 text-[0.8rem] text-ink"
              placeholder="SP-12345"
            />
          </label>

          <label className="block">
            <Eyebrow className="text-slate-400">Especialidade</Eyebrow>
            <input
              type="text"
              value={especialidade}
              onChange={(e) => setEspecialidade(e.target.value)}
              maxLength={100}
              className="input mt-1.5 text-[0.8rem] text-ink"
              placeholder="Clínica geral"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setAberto(false); setResultado(null); }}
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-[0.8rem] font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Agora não
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 rounded-2xl bg-primary px-4 py-2.5 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </div>
        </form>
      )}

      {resultado && (
        <p
          role="status"
          className={`px-4 pb-4 text-[0.75rem] font-semibold leading-relaxed ${resultado.ok ? 'text-primary' : 'text-red-600'}`}
        >
          {resultado.texto}
        </p>
      )}
    </Panel>
  );
}
