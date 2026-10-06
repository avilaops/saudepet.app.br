import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetBottomNav, VetIcon, VetLoading, VetPageHeader, formatDate } from '../../components/veterinario/VetUI'

const TIPOS_CHAVE = [
  ['CPF', 'CPF'],
  ['CNPJ', 'CNPJ'],
  ['EMAIL', 'E-mail'],
  ['PHONE', 'Telefone'],
  ['RANDOM', 'Chave aleatória']
]

const BANCOS = [
  ['001', 'Banco do Brasil'],
  ['033', 'Santander'],
  ['104', 'Caixa Econômica'],
  ['237', 'Bradesco'],
  ['260', 'Nubank'],
  ['341', 'Itaú'],
  ['077', 'Inter'],
  ['336', 'C6 Bank'],
  ['380', 'PicPay'],
  ['756', 'Sicoob'],
  ['748', 'Sicredi']
]

const PLACEHOLDER_CHAVE: Record<string, string> = {
  CPF: '000.000.000-00',
  CNPJ: '00.000.000/0000-00',
  EMAIL: 'voce@exemplo.com.br',
  PHONE: '(41) 90000-0000',
  RANDOM: '00000000-0000-0000-0000-000000000000'
}

const vazio = {
  tipoChavePix: 'CPF',
  chavePix: '',
  banco: '',
  agencia: '',
  conta: '',
  tipoConta: 'corrente',
  titular: '',
  cpfCnpjTitular: ''
}

export default function VetContaBancaria() {
  const navigate = useNavigate()
  const [dados, setDados] = useState<ApiPayload | null>(null)
  const [form, setForm] = useState(vazio)
  const [editando, setEditando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get('/v1/veterinario/financeiro/conta-bancaria')
      setDados(data)
      // Sem conta cadastrada o formulário já abre: não há nada para "ver" antes
      setEditando(!data.conta)
      if (data.conta) {
        setForm({
          ...vazio,
          tipoChavePix: data.conta.tipoChavePix || 'CPF',
          banco: data.conta.banco || '',
          agencia: data.conta.agencia || '',
          tipoConta: data.conta.tipoConta || 'corrente',
          titular: data.conta.titular || ''
        })
      }
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar sua conta bancária.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const alterar = (campo: string) => (event: any) => {
    setForm((atual) => ({ ...atual, [campo]: event.target.value }))
    setErro('')
    setSucesso('')
  }

  const salvar = async (event: any) => {
    event.preventDefault()
    setSalvando(true)
    setErro('')
    setSucesso('')
    try {
      const payload: any = {
        tipoChavePix: form.tipoChavePix,
        chavePix: form.chavePix.trim(),
        banco: form.banco.trim(),
        agencia: form.agencia.trim(),
        conta: form.conta.trim(),
        tipoConta: form.tipoConta
      }
      if (form.titular.trim()) payload.titular = form.titular.trim()
      if (form.cpfCnpjTitular.trim()) payload.cpfCnpjTitular = form.cpfCnpjTitular.trim()

      const { data } = await api.put('/v1/veterinario/financeiro/conta-bancaria', payload)
      setSucesso(data.message || 'Conta bancária salva.')
      setForm((atual) => ({ ...atual, chavePix: '', conta: '', cpfCnpjTitular: '' }))
      setEditando(false)
      await carregar()
    } catch (requestError: any) {
      const resposta = requestError.response?.data
      const detalhe = resposta?.details?.map((item: ApiPayload) => item.message).join(' • ')
      setErro(detalhe || resposta?.error || 'Não foi possível salvar a conta bancária.')
    } finally {
      setSalvando(false)
    }
  }

  const credenciado = dados?.status_credenciamento === 'APPROVED'
  const ativo = dados?.status_financeiro === 'ACTIVE'
  const nomeBanco = (codigo: ApiPayload) => BANCOS.find(([id]) => id === codigo)?.[1]

  if (loading) {
    return (
      <main className="vet-app">
        <VetPageHeader compact title="Conta bancária" onBack={() => navigate('/veterinario/configuracoes')} />
        <VetLoading label="Carregando conta bancária" />
      </main>
    )
  }

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Conta bancária"
        onBack={() => navigate('/veterinario/configuracoes')}
        action={
          <button className="vet-icon-button" type="button" onClick={carregar} aria-label="Atualizar">
            <VetIcon name="refresh" size={18} />
          </button>
        }
      />

      <div className="vet-bank">
        {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}
        {sucesso && <p className="vet-card vet-bank-success" role="status">{sucesso}</p>}

        {/* Sem credenciamento aprovado o cadastro nem começa: antes o formulário
            aparecia inteiro e só o botão do fim ficava travado — oito campos
            preenchidos para descobrir no final que não dava. */}
        {!credenciado && (
          <section className="vet-card vet-bank-status" role="status">
            <span className="vet-bank-status__icon"><VetIcon name="clock" size={20} /></span>
            <div>
              <strong>CRMV em análise</strong>
              <small>
                A conta bancária só pode ser cadastrada depois que seu credenciamento for aprovado.
                Avisamos você assim que isso acontecer — não é preciso preencher nada agora.
              </small>
            </div>
          </section>
        )}

        <section className={`vet-card vet-bank-status ${ativo ? 'is-active' : ''}`}>
          <span className="vet-bank-status__icon">
            <VetIcon name={ativo ? 'check' : 'wallet'} size={20} />
          </span>
          <div>
            <strong>{ativo ? 'Repasses habilitados' : 'Repasses ainda não habilitados'}</strong>
            <small>
              {ativo
                ? 'Cada atendimento pago cai direto na sua conta, já descontada a taxa da plataforma.'
                : 'Cadastre a conta para receber automaticamente o valor dos seus atendimentos.'}
            </small>
          </div>
        </section>

        {dados?.conta && !editando && (
          <section className="vet-card vet-bank-card">
            <h2>Conta cadastrada</h2>
            <dl>
              <div><dt>Chave PIX</dt><dd>{dados.conta.chavePixMascarada} <small>({dados.conta.tipoChavePix})</small></dd></div>
              <div><dt>Banco</dt><dd>{nomeBanco(dados.conta.banco) || dados.conta.banco}</dd></div>
              <div><dt>Agência</dt><dd>{dados.conta.agencia}</dd></div>
              <div><dt>Conta</dt><dd>{dados.conta.contaMascarada} <small>({dados.conta.tipoConta === 'poupanca' ? 'poupança' : 'corrente'})</small></dd></div>
              {dados.conta.titular && <div><dt>Titular</dt><dd>{dados.conta.titular}</dd></div>}
              {dados.conta.atualizado_em && <div><dt>Atualizada em</dt><dd>{formatDate(dados.conta.atualizado_em, true)}</dd></div>}
            </dl>
            <p className="vet-bank-card__note">
              Por segurança, a chave e o número da conta ficam guardados criptografados e só aparecem mascarados aqui.
            </p>
            {credenciado && (
              <button className="vet-button--primary vet-bank-edit" type="button" onClick={() => setEditando(true)}>
                Alterar dados bancários
              </button>
            )}
          </section>
        )}

        {editando && credenciado && (
          <form className="vet-card vet-bank-form" onSubmit={salvar}>
            <h2>{dados?.conta ? 'Alterar dados bancários' : 'Cadastrar conta de recebimento'}</h2>
            <p className="vet-bank-form__hint">
              Preencha novamente todos os campos — por segurança não recuperamos os valores anteriores.
            </p>

            <label>
              Tipo de chave PIX
              <select className="input" value={form.tipoChavePix} onChange={alterar('tipoChavePix')}>
                {TIPOS_CHAVE.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
              </select>
            </label>

            <label>
              Chave PIX
              <input
                className="input"
                value={form.chavePix}
                onChange={alterar('chavePix')}
                placeholder={PLACEHOLDER_CHAVE[form.tipoChavePix]}
                inputMode={['CPF', 'CNPJ', 'PHONE'].includes(form.tipoChavePix) ? 'numeric' : 'text'}
                autoComplete="off"
                required
              />
            </label>

            <label>
              Banco
              <input
                className="input"
                value={form.banco}
                onChange={alterar('banco')}
                list="vet-bancos"
                placeholder="001"
                inputMode="numeric"
                required
              />
              <datalist id="vet-bancos">
                {BANCOS.map(([codigo, nome]) => <option key={codigo} value={codigo}>{nome}</option>)}
              </datalist>
              {nomeBanco(form.banco.padStart(3, '0')) && (
                <small className="vet-bank-form__resolved">{nomeBanco(form.banco.padStart(3, '0'))}</small>
              )}
            </label>

            <div className="vet-bank-form__row">
              <label>
                Agência
                <input className="input" value={form.agencia} onChange={alterar('agencia')} placeholder="0001" required />
              </label>
              <label>
                Conta com dígito
                <input className="input" value={form.conta} onChange={alterar('conta')} placeholder="12345-6" required />
              </label>
            </div>

            <label>
              Tipo de conta
              <select className="input" value={form.tipoConta} onChange={alterar('tipoConta')}>
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
              </select>
            </label>

            <label>
              Titular <small>(opcional — usamos seu nome cadastrado)</small>
              <input className="input" value={form.titular} onChange={alterar('titular')} placeholder="Nome completo do titular" />
            </label>

            <label>
              CPF/CNPJ do titular <small>(opcional)</small>
              <input className="input" value={form.cpfCnpjTitular} onChange={alterar('cpfCnpjTitular')} placeholder="Somente números" inputMode="numeric" />
            </label>

            <div className="vet-bank-form__actions">
              {dados?.conta && (
                <button type="button" className="vet-button--secondary" onClick={() => { setEditando(false); setErro('') }}>
                  Cancelar
                </button>
              )}
              <button type="submit" className="vet-modal__submit" disabled={salvando || !credenciado}>
                {salvando ? 'Salvando…' : dados?.conta ? 'Salvar alterações' : 'Habilitar repasses'}
              </button>
            </div>
          </form>
        )}

        <button className="vet-bank-link" type="button" onClick={() => navigate('/veterinario/repasses')}>
          <span className="vet-setting-row__icon"><VetIcon name="wallet" size={19} /></span>
          <span><strong>Ver meus repasses</strong><small>Saldo, extrato e solicitações de transferência</small></span>
          <VetIcon name="chevron" size={17} />
        </button>
      </div>

      <VetBottomNav />
    </main>
  )
}
