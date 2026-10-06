import prisma from '../config/database';

/**
 * Quem é avisado, de quê, e por qual canal.
 *
 * O briefing exige que tutor e veterinário recebam notificação de CADA mudança
 * do atendimento — quinze avisos do lado do tutor, onze do lado do profissional.
 * Isso só era verdade para agendamento: nas transições do atendimento o aviso
 * era ad-hoc, escrito dentro de cada endpoint, e por isso alguns simplesmente
 * não aconteciam. Quem estava com o aplicativo fechado não recebia nada.
 *
 * Aqui a regra vira tabela, e a tabela é consumida pela máquina de estados —
 * que já é o funil único por onde toda mudança passa. Duas consequências
 * práticas: um status novo não entra em produção mudo, porque o teste de
 * cobertura falha; e mudar o texto de um aviso deixa de exigir caçar o endpoint
 * que o disparava.
 *
 * Silêncio também é decisão, e por isso é declarado. `SILENCIOSOS` guarda os
 * status que de propósito não avisam ninguém, com o motivo escrito ao lado.
 */

const pushService = require('./push.service');
const emailService = require('./email.service');

export type Canal = 'push' | 'email';

export type Aviso = {
  titulo: string;
  corpo: (pet: string) => string;
  /** Push sempre; e-mail só onde a pessoa precisa do registro depois. */
  canais: Canal[];
  /**
   * Quando existe um template desenhado para este momento, ele é usado no lugar
   * do e-mail genérico. A casa tem vinte e poucos templates prontos; mandar
   * texto solto quando existe um deles é desperdiçar trabalho já feito.
   */
  template?: 'veterinario_a_caminho';
};

export type LinhaDaMatriz = {
  tutor?: Aviso;
  veterinario?: Aviso;
};

/**
 * Status que não avisam ninguém, e por quê. Estar nesta lista é uma escolha
 * registrada — não um esquecimento.
 */
export const SILENCIOSOS: Record<string, string> = {
  criado: 'O tutor acabou de criar o chamado; avisá-lo do que ele mesmo fez é ruído.',
  procurando_veterinario:
    'A tela já mostra a busca em andamento, e o chamado nasce aqui: um push por chamado criado seria eco.',
  oferta_enviada: 'Fluxo de oferta dirigida, hoje inativo — a fila aberta é o modelo oficial.',
  aceito: 'Coberto por `veterinario_encontrado`, que é a mesma notícia para o tutor.',
  contestado: 'A contestação é aberta pela equipe, que já sabe; o desfecho é que avisa.'
};

export const MATRIZ: Record<string, LinhaDaMatriz> = {
  veterinario_encontrado: {
    tutor: {
      titulo: 'Veterinário encontrado! 🐾',
      corpo: (pet) => `Encontramos um veterinário para ${pet}. Acompanhe pelo app.`,
      canais: ['push']
    },
    veterinario: {
      titulo: 'Atendimento confirmado',
      corpo: (pet) => `Você aceitou o atendimento de ${pet}.`,
      canais: ['push']
    }
  },

  a_caminho: {
    tutor: {
      titulo: 'Veterinário a caminho 🚗',
      corpo: (pet) => `O veterinário saiu para atender ${pet}.`,
      // E-mail aqui porque é o aviso que a pessoa procura depois ("a que horas
      // ele saiu?") e o único com hora de saída registrada.
      canais: ['push', 'email'],
      // Existe template para exatamente este momento, com nome, CRMV e
      // especialidade do profissional. Usar texto solto aqui seria jogar fora
      // um trabalho que já estava pronto.
      template: 'veterinario_a_caminho'
    }
  },

  chegou: {
    tutor: {
      titulo: 'Veterinário chegou',
      corpo: (pet) => `O veterinário chegou para o atendimento de ${pet}.`,
      canais: ['push']
    }
  },

  atendimento_em_andamento: {
    tutor: {
      titulo: 'Atendimento iniciado',
      corpo: (pet) => `O atendimento de ${pet} começou.`,
      canais: ['push']
    }
  },

  finalizado: {
    tutor: {
      titulo: 'Atendimento finalizado ✅',
      corpo: (pet) => `Receita e orientações de ${pet} já estão disponíveis no app.`,
      // Só push: o fechamento JÁ manda o e-mail com a receita e o prontuário em
      // anexo (`enviarEmailReceitaEProntuario`). Somar um genérico aqui daria
      // dois e-mails no mesmo minuto sobre a mesma coisa — e o pior deles seria
      // o meu.
      canais: ['push']
    },
    veterinario: {
      titulo: 'Atendimento registrado',
      corpo: (pet) => `O atendimento de ${pet} foi finalizado e gravado no prontuário.`,
      canais: ['push']
    }
  },

  concluido: {
    tutor: {
      titulo: 'Atendimento finalizado ✅',
      corpo: (pet) => `Receita e orientações de ${pet} já estão disponíveis no app.`,
      canais: ['push']
    }
  },

  encaminhado: {
    tutor: {
      titulo: '🚨 Procure um serviço de emergência',
      corpo: (pet) =>
        `O caso de ${pet} exige atendimento de emergência. Abra o app para ver as orientações do veterinário.`,
      // Os dois canais, sem hesitar: é o aviso mais grave que o produto emite.
      canais: ['push', 'email']
    }
  },

  recusado: {
    tutor: {
      titulo: 'Atendimento não aceito',
      corpo: (pet) => `Estamos procurando outro veterinário para ${pet}.`,
      canais: ['push']
    }
  },

  sem_veterinario: {
    tutor: {
      titulo: 'Nenhum veterinário disponível',
      corpo: (pet) =>
        `Não encontramos veterinário disponível para ${pet} agora. Abra o app para procurar de novo.`,
      canais: ['push', 'email']
    }
  },

  expirado: {
    tutor: {
      titulo: 'Solicitação expirada',
      corpo: (pet) => `A solicitação para ${pet} expirou. Você pode pedir um novo atendimento.`,
      canais: ['push']
    }
  },

  cancelado: {
    tutor: {
      titulo: 'Atendimento cancelado',
      corpo: (pet) => `O atendimento de ${pet} foi cancelado.`,
      canais: ['push']
    },
    veterinario: {
      titulo: 'Atendimento cancelado',
      corpo: (pet) => `O atendimento de ${pet} foi cancelado.`,
      canais: ['push']
    }
  },

  cancelado_tutor: {
    // O tutor não precisa ser avisado do que ele mesmo fez; o profissional, sim,
    // e com urgência: ele pode estar dirigindo para lá.
    veterinario: {
      titulo: 'Chamado cancelado pelo tutor',
      corpo: (pet) => `O tutor cancelou o atendimento de ${pet}. Não é mais necessário ir.`,
      canais: ['push', 'email']
    }
  },

  cancelado_vet: {
    tutor: {
      titulo: 'Atendimento cancelado pelo veterinário',
      corpo: (pet) => `Estamos procurando outro profissional para ${pet}.`,
      canais: ['push', 'email']
    }
  },

  cancelado_admin: {
    tutor: {
      titulo: 'Atendimento cancelado',
      corpo: (pet) => `O atendimento de ${pet} foi cancelado pela nossa equipe. Fale conosco.`,
      canais: ['push', 'email']
    },
    veterinario: {
      titulo: 'Atendimento cancelado pela equipe',
      corpo: (pet) => `O atendimento de ${pet} foi cancelado pela administração.`,
      canais: ['push']
    }
  },

  pagamento_falhou: {
    tutor: {
      titulo: 'Pagamento não aprovado',
      corpo: (pet) =>
        `O pagamento do atendimento de ${pet} não foi aprovado. Abra o app para tentar de novo.`,
      canais: ['push', 'email']
    }
  }
};

type Destinatario = {
  usuarioId: string;
  email: string | null;
  nome: string | null;
  papel: 'tutor' | 'veterinario';
};

async function enviarEmail(
  destinatario: Destinatario,
  aviso: Aviso,
  pet: string,
  url: string,
  contexto: { veterinario?: { nome?: string | null; crmv?: string | null; especialidade?: string | null } } = {}
) {
  if (!destinatario.email) return;

  // Template desenhado para este momento vence o texto genérico.
  if (aviso.template === 'veterinario_a_caminho') {
    return emailService.enviarEmailVeterinarioACaminho(destinatario.email, {
      nomeTutor: destinatario.nome || 'tutor',
      nomePet: pet,
      nomeVet: contexto.veterinario?.nome || 'O veterinário',
      crmvVet: contexto.veterinario?.crmv || '',
      especialidadeVet: contexto.veterinario?.especialidade || '',
      chatUrl: url
    });
  }

  await emailService.sendMail({
    to: destinatario.email,
    subject: aviso.titulo,
    // Texto curto de propósito: o e-mail aqui é registro e atalho, não relatório.
    html: `<p>Olá, ${destinatario.nome || 'tudo bem'}?</p>
<p>${aviso.corpo(pet)}</p>
<p><a href="${url}">Abrir no aplicativo</a></p>`
  });
}

/**
 * Dispara o que a matriz manda para um status.
 *
 * Nunca lança: notificação é acessório da transição, e derrubar a mudança de
 * status porque um push falhou seria trocar um problema pequeno por um grave.
 */
export async function notificarTransicao({
  id,
  tenantId,
  para,
  baseUrl = process.env.FRONTEND_URL || 'https://saudepet.app.br'
}: {
  id: string;
  tenantId: string;
  para: string;
  baseUrl?: string;
}) {
  const linha = MATRIZ[para];
  if (!linha) return { enviados: 0 };

  const solicitacao = await prisma.solicitacao.findFirst({
    where: { id, tenant_id: tenantId },
    select: {
      tutor_id: true,
      pet: { select: { nome: true } },
      tutor: { select: { email: true, nome: true } },
      veterinario: {
        select: {
          usuario_id: true,
          crmv: true,
          especialidade: true,
          usuario: { select: { email: true, nome: true } }
        }
      }
    }
  });
  if (!solicitacao) return { enviados: 0 };

  const pet = solicitacao.pet?.nome || 'seu pet';

  const destinos: Array<{ aviso: Aviso; quem: Destinatario; url: string }> = [];

  if (linha.tutor && solicitacao.tutor_id) {
    destinos.push({
      aviso: linha.tutor,
      quem: {
        usuarioId: solicitacao.tutor_id,
        email: solicitacao.tutor?.email ?? null,
        nome: solicitacao.tutor?.nome ?? null,
        papel: 'tutor'
      },
      url: `${baseUrl}/tutor/acompanhar/${id}`
    });
  }

  if (linha.veterinario && solicitacao.veterinario?.usuario_id) {
    destinos.push({
      aviso: linha.veterinario,
      quem: {
        usuarioId: solicitacao.veterinario.usuario_id,
        email: solicitacao.veterinario.usuario?.email ?? null,
        nome: solicitacao.veterinario.usuario?.nome ?? null,
        papel: 'veterinario'
      },
      url: `${baseUrl}/veterinario/atendimento/${id}`
    });
  }

  let enviados = 0;

  for (const destino of destinos) {
    const tarefas: Array<Promise<unknown>> = [];

    if (destino.aviso.canais.includes('push') && pushService.estaConfigurado()) {
      tarefas.push(
        pushService.enviarParaUsuario(destino.quem.usuarioId, {
          title: destino.aviso.titulo,
          body: destino.aviso.corpo(pet),
          // Caminho relativo: o service worker abre dentro do próprio app.
          url: destino.url.replace(/^https?:\/\/[^/]+/, ''),
          tag: `atendimento-${id}`
        })
      );
    }

    if (destino.aviso.canais.includes('email')) {
      tarefas.push(
        enviarEmail(destino.quem, destino.aviso, pet, destino.url, {
          veterinario: solicitacao.veterinario
            ? {
                nome: solicitacao.veterinario.usuario?.nome,
                crmv: solicitacao.veterinario.crmv,
                especialidade: solicitacao.veterinario.especialidade
              }
            : undefined
        })
      );
    }

    // Um canal que falha não pode calar o outro.
    const resultados = await Promise.allSettled(tarefas);
    enviados += resultados.filter((item) => item.status === 'fulfilled').length;

    for (const resultado of resultados) {
      if (resultado.status === 'rejected') {
        const mensagem = resultado.reason instanceof Error ? resultado.reason.message : String(resultado.reason);
        console.error(`⚠️  [Aviso] ${para} → ${destino.quem.papel} falhou (ignorado):`, mensagem);
      }
    }
  }

  return { enviados };
}
