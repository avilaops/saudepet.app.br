// Mock único do `email.service`.
//
// Antes, cada arquivo de teste escrevia a própria lista de métodos, e todas
// estavam incompletas: o código chamava um método que o mock não tinha, a
// chamada estourava e o `catch` de best-effort engolia o erro. O teste passava
// verde sem nunca ter exercitado o envio.
//
// A lista abaixo espelha os métodos públicos do serviço. Quando um novo e-mail
// entrar no serviço, ele entra aqui também.
const METODOS = [
  'enviarEmailAgendamentoTutor',
  'enviarEmailAgendamentoVet',
  'enviarEmailAlertaNpsRuimAdmin',
  'enviarEmailAlertaSlaAdmin',
  'enviarEmailAlertaVacina',
  'enviarEmailAprovacao',
  'enviarEmailAvaliacaoNps',
  'enviarEmailBoasVindasTutor',
  'enviarEmailChamadoUrgenteVet',
  'enviarEmailConfirmacaoMudancaSenha',
  'enviarEmailExtratoMensalVet',
  'enviarEmailLembreteMedicamento',
  'enviarEmailLembreteRetorno',
  'enviarEmailNovoVetAdmin',
  'enviarEmailPendenciaAprovacao',
  'enviarEmailProntuarioPrescricao',
  'enviarEmailReceitaEProntuario',
  'enviarEmailRejeicao',
  'enviarEmailResetSenha',
  'enviarEmailSolicitacaoRecebida',
  'enviarEmailTeste',
  'enviarEmailVerificacao',
  'enviarEmailVeterinarioACaminho',
  'sendMail',
  'testarConexao'
];

/** Objeto de mock novo, com todos os métodos resolvendo `{ success: true }`. */
const criarMockDoEmailService = () => Object.fromEntries(
  METODOS.map((nome) => [nome, jest.fn().mockResolvedValue({ success: true })])
);

module.exports = { METODOS, criarMockDoEmailService };
