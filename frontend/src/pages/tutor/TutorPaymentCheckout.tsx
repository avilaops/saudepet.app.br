import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CreditCard, QrCode, Copy, CheckCircle2, Clock, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../services/api';
import { tokenizarCartao, tokenizarCartaoSalvo, formatarNumeroCartao } from '../../lib/mercadopago';

export default function TutorPaymentCheckout() {
  const { id: atendimentoId } = useParams();
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [method, setMethod] = useState('PIX');
  const [loading, setLoading] = useState(false);
  const [carregandoCobranca, setCarregandoCobranca] = useState(true);
  const [payment, setPayment] = useState<ApiPayload | null>(null);
  // Cobrança gerada pelo veterinário: quando existe, o valor é dele, não o padrão
  const [cobrancaDoVet, setCobrancaDoVet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);
  const [erroCheckout, setErroCheckout] = useState('');
  // O cartão só aparece quando há chave pública para tokenizar no navegador.
  const [gateway, setGateway] = useState<ApiPayload>({ public_key: null, cartao_disponivel: false });
  // Benefício do plano. A vitrine promete "10% de desconto em todas as
  // consultas" e o tutor não tinha onde ver se o desconto estava valendo, nem
  // quanto do benefício ainda restava no mês.
  const [beneficio, setBeneficio] = useState<ApiPayload | null>(null);

  // O preço é decidido no servidor (cobrança do vet ou tabela da cidade) —
  // antes existia um VALOR_PADRAO de R$ 150 fixado aqui e enviado no body.
  const valorDevido = payment?.amount != null ? Number(payment.amount) : null;
  const valorFormatado = valorDevido != null
    ? valorDevido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'definido pela tabela da sua cidade';

  // A carteira: na segunda emergência, digitar dezesseis dígitos com o animal
  // passando mal na frente é atrito no pior momento possível.
  const [cartoes, setCartoes] = useState<ApiPayload[]>([]);
  const [cartaoEscolhido, setCartaoEscolhido] = useState<ApiPayload | null>(null);
  const [cvvDoSalvo, setCvvDoSalvo] = useState('');
  const [salvarCartao, setSalvarCartao] = useState(true);

  useEffect(() => {
    api.get('/v1/payments/cartoes')
      .then(({ data }) => {
        const lista = data.cartoes || [];
        setCartoes(lista);
        // Pré-escolhe o principal: quem já guardou cartão espera pagar com ele.
        const principal = lista.find((item: ApiPayload) => item.principal) || lista[0];
        if (principal) setCartaoEscolhido(principal.id);
      })
      .catch(() => setCartoes([]));
  }, []);

  // Cartão Form
  const [cardDetails, setCardDetails] = useState<ApiPayload>({
    holderName: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: ''
  });

  useEffect(() => {
    api.get('/v1/payments/meu-beneficio')
      .then(({ data }) => setBeneficio(data.plano || null))
      .catch(() => {
        // Sem benefício a tela funciona igual: é informação a mais, não
        // requisito para pagar.
      });
  }, []);

  useEffect(() => {
    if (socket && atendimentoId) {
      socket.emit('join:atendimento', atendimentoId);
      socket.on('pagamento:aprovado', () => setPaidSuccess(true));

      return () => {
        socket.off('pagamento:aprovado');
      };
    }
  }, [socket, atendimentoId]);

  useEffect(() => {
    if (!gateway.cartao_disponivel && method === 'CREDIT_CARD') setMethod('PIX');
  }, [gateway.cartao_disponivel, method]);

  useEffect(() => {
    let ativo = true;
    api.get('/v1/payments/chave-publica')
      .then(({ data }) => { if (ativo) setGateway(data || { cartao_disponivel: false }); })
      .catch(() => { if (ativo) setGateway({ public_key: null, cartao_disponivel: false }); });
    return () => { ativo = false; };
  }, []);

  // Antes de oferecer "gerar PIX", checa se o veterinário já cobrou este atendimento
  useEffect(() => {
    let ativo = true;

    const buscarCobrancaExistente = async () => {
      if (!atendimentoId) return setCarregandoCobranca(false);
      try {
        const { data } = await api.get(`/v1/payments/atendimento/${atendimentoId}`);
        if (!ativo) return;

        if (data.payment) {
          setPayment(data.payment);
          setCobrancaDoVet(true);
          setMethod(data.payment.method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX');
          if (data.payment.status === 'PAID') setPaidSuccess(true);
        }
      } catch (err: any) {
        console.error('Erro ao consultar cobrança do atendimento:', err);
      } finally {
        if (ativo) setCarregandoCobranca(false);
      }
    };

    buscarCobrancaExistente();
    return () => { ativo = false; };
  }, [atendimentoId]);

  const handleGenerateCheckout = async (e: any) => {
    if (e) e.preventDefault();
    try {
      setLoading(true);
      setErroCheckout('');
      let cardToken;
      if (method === 'CREDIT_CARD') {
        const salvo = cartoes.find((item) => item.id === cartaoEscolhido);

        if (salvo) {
          // Cartão guardado: o número não é digitado de novo, mas o gateway
          // continua exigindo token novo a cada cobrança — ele sai do
          // identificador do cartão mais o código de segurança de agora.
          cardToken = await tokenizarCartaoSalvo({
            chavePublica: gateway.public_key,
            cardId: salvo.card_id,
            cvv: cvvDoSalvo
          });
        } else {
          // Número e CVV vão do navegador DIRETO para o Mercado Pago; daqui em
          // diante só o token de uso único circula. Nada disso toca a nossa API.
          cardToken = await tokenizarCartao({
            chavePublica: gateway.public_key,
            numero: cardDetails.number,
            nome: cardDetails.holderName,
            mes: cardDetails.expiryMonth,
            ano: cardDetails.expiryYear,
            cvv: cardDetails.ccv
          });

          // Guardar é um segundo token, gerado antes do pagamento: o do
          // pagamento é de uso único e queima na cobrança. Falhar aqui não pode
          // derrubar o atendimento — quem está pagando quer pagar, não cadastrar.
          if (salvarCartao) {
            await tokenizarCartao({
              chavePublica: gateway.public_key,
              numero: cardDetails.number,
              nome: cardDetails.holderName,
              mes: cardDetails.expiryMonth,
              ano: cardDetails.expiryYear,
              cvv: cardDetails.ccv
            })
              .then((tokenParaGuardar) => api.post('/v1/payments/cartoes', { card_token: tokenParaGuardar }))
              .catch(() => {});
          }
        }
      }

      const { data } = await api.post('/v1/payments/checkout', {
        atendimentoId,
        method,
        cardToken
      });

      // O cartão sai da memória assim que vira token.
      if (method === 'CREDIT_CARD') {
        setCardDetails({ holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '' });
      }
      if (data.payment) {
        setPayment(data.payment);
        if (data.payment.status === 'PAID') setPaidSuccess(true);
      } else {
        setErroCheckout('Não foi possível gerar o checkout de pagamento.');
      }
    } catch (err: any) {
      setErroCheckout(
        err.response?.data?.error
        || err.response?.data?.message
        // Erro do SDK (cartão inválido, sem conexão) chega como Error comum.
        || err.message
        || 'Não foi possível gerar o checkout. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!payment || paidSuccess || !atendimentoId) return undefined;
    const intervalo = setInterval(async () => {
      try {
        const { data } = await api.get(`/v1/payments/atendimento/${atendimentoId}`);
        if (data?.payment?.status === 'PAID') setPaidSuccess(true);
      } catch { /* segue tentando no próximo ciclo */ }
    }, 15000);
    return () => clearInterval(intervalo);
  }, [payment, paidSuccess, atendimentoId]);

  const handleCopyPix = () => {
    if (payment?.pix_copy_paste) {
      navigator.clipboard.writeText(payment.pix_copy_paste);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-surface-page py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-white rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="flex items-center gap-1.5 text-emerald-600 font-extrabold text-xs">
            <ShieldCheck className="w-4 h-4" /> Checkout Seguro
          </div>
        </div>

        {/* Card Principal */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xl space-y-6">
          {erroCheckout && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700" role="alert">
              {erroCheckout}
            </p>
          )}
          
          {paidSuccess ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">Pagamento Confirmado!</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Seu atendimento presencial foi confirmado e o veterinário já está com o chamado liberado.
              </p>
              <button
                onClick={() => navigate(`/tutor/acompanhar/${atendimentoId}`)}
                className="mt-4 py-3.5 px-6 bg-teal-600 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-slate-900/20"
              >
                Ir para o Rastreamento Live
              </button>
            </div>
          ) : (
            <>
              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Finalizar Solicitação</span>
                <h1 className="text-2xl font-black text-slate-900 mt-1">Pagamento da Consulta Veterinária</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cobrancaDoVet
                    ? `Cobrança enviada pelo veterinário • ${valorFormatado}`
                    : `Atendimento domiciliar / emergência • valor ${valorFormatado}`}
                </p>
              </div>

              {/* O desconto do plano é aplicado no servidor, no momento de gerar
                  a cobrança. Aqui a tela só conta o que está acontecendo — e
                  avisa quando o benefício do mês acabou, porque a diferença de
                  preço sem explicação parece erro. */}
              {beneficio && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-extrabold text-emerald-800">
                    {beneficio.nome} · {beneficio.desconto_pct}% de desconto
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                    {beneficio.limite_mensal == null
                      ? 'Vale para todos os atendimentos do mês.'
                      : beneficio.restantes > 0
                        ? `${beneficio.restantes} de ${beneficio.limite_mensal} atendimentos com desconto ainda neste mês.`
                        : `Você já usou os ${beneficio.limite_mensal} atendimentos com desconto deste mês. O atendimento continua disponível pelo preço normal.`}
                  </p>
                </div>
              )}

              {payment?.desconto_valor > 0 && (
                <p className="text-[11px] font-bold text-emerald-700">
                  Preço de tabela {Number(payment.preco_cheio).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ·
                  desconto do plano −{Number(payment.desconto_valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              )}

              {carregandoCobranca && (
                <p className="text-xs font-bold text-slate-400">Verificando cobranças deste atendimento…</p>
              )}

              {/* Seletor de Métodos — travado quando a cobrança já veio do veterinário */}
              <div className={`grid grid-cols-2 gap-3 ${cobrancaDoVet ? 'hidden' : ''}`}>
                <button
                  type="button"
                  onClick={() => { setMethod('PIX'); setPayment(null); }}
                  className={`p-4 rounded-2xl border font-bold text-xs flex flex-col items-center gap-2 transition ${method === 'PIX' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-md' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                >
                  <QrCode className="w-6 h-6 text-emerald-600" /> PIX Instantâneo
                </button>
                {/* Sem chave pública não há como tokenizar o cartão, e o
                    gateway recusaria o pagamento no fim. Melhor não oferecer
                    o caminho do que deixar o tutor preencher para nada. */}
                {gateway.cartao_disponivel && (
                  <button
                    type="button"
                    onClick={() => { setMethod('CREDIT_CARD'); setPayment(null); }}
                    className={`p-4 rounded-2xl border font-bold text-xs flex flex-col items-center gap-2 transition ${method === 'CREDIT_CARD' ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-md' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                  >
                    <CreditCard className="w-6 h-6 text-emerald-600" /> Cartão de Crédito
                  </button>
                )}
              </div>

              {/* Conteúdo PIX */}
              {method === 'PIX' && (
                <div className="space-y-4 pt-2">
                  {!payment ? (
                    <button
                      onClick={handleGenerateCheckout}
                      disabled={loading}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                    >
                      {loading ? 'Gerando QR Code PIX...' : payment?.amount != null ? `Gerar chave PIX de ${valorFormatado}` : 'Gerar chave PIX'}
                    </button>
                  ) : (
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-4">
                      <div className="inline-block p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        {payment.pix_qr_code_ref ? (
                          <img
                            src={payment.pix_qr_code_ref.startsWith('data:') ? payment.pix_qr_code_ref : `data:image/png;base64,${payment.pix_qr_code_ref}`}
                            alt="QR Code PIX"
                            className="w-48 h-48 mx-auto"
                          />
                        ) : (
                          <div className="w-48 h-48 bg-slate-100 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
                            <AlertCircle className="w-5 h-5" />
                            QR Code indisponível no momento — use o PIX copia e cola abaixo.
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">PIX Copia e Cola</span>
                        <div className="flex gap-2 max-w-md mx-auto">
                          <input
                            type="text"
                            readOnly
                            value={payment.pix_copy_paste || ''}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-[10px] text-slate-700"
                          />
                          <button
                            onClick={handleCopyPix}
                            className="px-4 py-2.5 bg-teal-600 text-white font-bold text-xs rounded-xl hover:bg-teal-700 transition flex items-center gap-1.5 shrink-0"
                          >
                            <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
                        <Clock className="w-4 h-4 text-amber-500 animate-pulse" /> Aguardando pagamento pelo banco (confirmação instantânea)...
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Conteúdo Cartão */}
              {method === 'CREDIT_CARD' && (
                <form onSubmit={handleGenerateCheckout} className="space-y-4 pt-2">
                  {/* A carteira. Guardamos referência, nunca o cartão: o número
                      não passa por este servidor nem na primeira vez. */}
                  {cartoes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700">Pagar com</p>
                      {cartoes.map((cartao) => (
                        <label
                          key={cartao.id}
                          className={`flex items-center gap-3 rounded-2xl border p-3 text-xs transition ${cartaoEscolhido === cartao.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}
                        >
                          <input
                            type="radio"
                            name="cartao"
                            className="h-4 w-4"
                            checked={cartaoEscolhido === cartao.id}
                            onChange={() => setCartaoEscolhido(cartao.id)}
                          />
                          <span className="flex-1 font-semibold text-slate-800">
                            {cartao.bandeira || 'Cartão'} •••• {cartao.ultimos_digitos}
                            {cartao.validade_mes && cartao.validade_ano && (
                              <span className="ml-2 font-normal text-slate-500">
                                {String(cartao.validade_mes).padStart(2, '0')}/{String(cartao.validade_ano).slice(-2)}
                              </span>
                            )}
                          </span>
                          {cartao.principal && <span className="text-[0.65rem] font-bold text-emerald-700">principal</span>}
                        </label>
                      ))}

                      <label
                        className={`flex items-center gap-3 rounded-2xl border p-3 text-xs transition ${cartaoEscolhido === null ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}
                      >
                        <input
                          type="radio"
                          name="cartao"
                          className="h-4 w-4"
                          checked={cartaoEscolhido === null}
                          onChange={() => setCartaoEscolhido(null)}
                        />
                        <span className="flex-1 font-semibold text-slate-800">Usar outro cartão</span>
                      </label>
                    </div>
                  )}

                  {/* Cartão guardado: só o código de segurança. O gateway exige
                      token novo a cada cobrança, e é dele que o token sai. */}
                  {cartaoEscolhido && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Código de segurança</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        placeholder="CVV"
                        maxLength={4}
                        value={cvvDoSalvo}
                        onChange={(e) => setCvvDoSalvo(e.target.value.replace(/\D/g, ''))}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                        required
                      />
                      <p className="mt-1 text-[0.68rem] text-slate-400">
                        Pedimos o código a cada pagamento — é o que o banco exige, e é o que
                        impede alguém com o seu celular na mão de cobrar no seu cartão.
                      </p>
                    </div>
                  )}

                  {!cartaoEscolhido && (
                  <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome no Cartão</label>
                    <input
                      type="text"
                      placeholder="Como impresso no cartão"
                      value={cardDetails.holderName}
                      onChange={(e) => setCardDetails({ ...cardDetails, holderName: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Número do Cartão</label>
                    <input
                      type="text"
                      placeholder="0000 0000 0000 0000"
                      value={cardDetails.number}
                      onChange={(e) => setCardDetails({ ...cardDetails, number: formatarNumeroCartao(e.target.value) })}
                      inputMode="numeric"
                      autoComplete="cc-number"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mês (MM)</label>
                      <input
                        type="text"
                        placeholder="12"
                        value={cardDetails.expiryMonth}
                        onChange={(e) => setCardDetails({ ...cardDetails, expiryMonth: e.target.value })}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Ano (AA)</label>
                      <input
                        type="text"
                        placeholder="28"
                        value={cardDetails.expiryYear}
                        onChange={(e) => setCardDetails({ ...cardDetails, expiryYear: e.target.value })}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">CVV</label>
                      <input
                        type="password"
                        placeholder="123"
                        maxLength={4}
                        value={cardDetails.ccv}
                        onChange={(e) => setCardDetails({ ...cardDetails, ccv: e.target.value })}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                        required
                      />
                    </div>
                  </div>

                  {/* Guardar é opção, não padrão silencioso: a pessoa vê a
                      caixa marcada e pode desmarcar antes de pagar. */}
                  <label className="flex items-start gap-2.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={salvarCartao}
                      onChange={(e) => setSalvarCartao(e.target.checked)}
                    />
                    <span>
                      Guardar este cartão para os próximos atendimentos.
                      <span className="block text-[0.68rem] text-slate-400">
                        O número fica no banco processador, não conosco — aqui ficam só a
                        bandeira e os quatro últimos dígitos.
                      </span>
                    </span>
                  </label>
                  </>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                  >
                    {loading ? 'Processando pagamento…' : payment?.amount != null ? `Pagar ${valorFormatado} no cartão` : 'Pagar no cartão'}
                  </button>
                </form>
              )}

            </>
          )}

        </div>
      </div>
    </div>
  );
}
