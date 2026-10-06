import baseLayout from './layout.email';

// Auth Templates
import verificacaoEmail from './auth/verificacao-email.template';
import recuperacaoSenha from './auth/recuperacao-senha.template';
import alertaSenhaAlterada from './auth/alerta-senha-alterada.template';

// Tutor Templates
import boasVindasTutor from './tutor/boas-vindas.template';
import solicitacaoRecebida from './tutor/solicitacao-recebida.template';
import veterinarioACaminho from './tutor/veterinario-a-caminho.template';
import prontuarioPrescricao from './tutor/prontuario-prescricao.template';
import avaliacaoNps from './tutor/avaliacao-nps.template';
import lembreteRetorno from './tutor/lembrete-retorno.template';
import alertaVacina from './tutor/alerta-vacina.template';
import lembreteMedicamento from './tutor/lembrete-medicamento.template';
import agendamentoConsultaTutor from './tutor/agendamento-consulta.template';

// Vet Templates
import cadastroRecebidoVet from './vet/cadastro-recebido.template';
import cadastroAprovadoVet from './vet/cadastro-aprovado.template';
import cadastroAjusteVet from './vet/cadastro-ajuste.template';
import chamadoUrgenteVet from './vet/chamado-urgente.template';
import extratoMensalVet from './vet/extrato-mensal.template';
import agendamentoConsultaVet from './vet/agendamento-consulta.template';

// Admin Templates
import novoVetPendenteAdmin from './admin/novo-vet-pendente.template';
import alertaSlaAdmin from './admin/alerta-sla.template';
import alertaNpsRuimAdmin from './admin/alerta-nps-ruim.template';

const templates = {
  baseLayout,
  auth: {
    verificacaoEmail,
    recuperacaoSenha,
    alertaSenhaAlterada
  },
  tutor: {
    boasVindas: boasVindasTutor,
    solicitacaoRecebida,
    veterinarioACaminho,
    prontuarioPrescricao,
    avaliacaoNps,
    lembreteRetorno,
    alertaVacina,
    lembreteMedicamento,
    agendamentoConsulta: agendamentoConsultaTutor
  },
  vet: {
    cadastroRecebido: cadastroRecebidoVet,
    cadastroAprovado: cadastroAprovadoVet,
    cadastroAjuste: cadastroAjusteVet,
    chamadoUrgente: chamadoUrgenteVet,
    extratoMensal: extratoMensalVet,
    agendamentoConsulta: agendamentoConsultaVet
  },
  admin: {
    novoVetPendente: novoVetPendenteAdmin,
    alertaSla: alertaSlaAdmin,
    alertaNpsRuim: alertaNpsRuimAdmin
  }
};

export = templates;
