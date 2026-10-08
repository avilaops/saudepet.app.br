import { dataHoraBr } from '../../utils/datas';
import prisma from '../../config/database';

const pushService = require('../push.service');
const emailService = require('../email.service');

/**
 * Avisos do Saúde Pet Mercado.
 *
 * O pedido pago é o momento em que duas pessoas precisam saber de coisas
 * diferentes: a loja precisa saber que TEM TRABALHO — senão o pedido fica
 * parado esperando alguém abrir o painel por acaso — e o tutor precisa saber
 * que o dinheiro entrou e quanto tempo leva.
 *
 * Nada aqui pode derrubar a transição do pedido: aviso é consequência do fato,
 * não condição dele. Por isso todo caminho falha em silêncio registrado, e a
 * função devolve o que conseguiu fazer em vez de estourar.
 */

const dinheiro = (valor: unknown): string =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function empurrar(usuarioId: string, dados: { title: string; body: string; url: string; tag: string }) {
  if (!pushService.estaConfigurado?.()) return;
  await pushService.enviarParaUsuario(usuarioId, dados).catch((erro: Error) => {
    console.error('[mercado] push falhou:', erro.message);
  });
}

async function email(destino: string | null | undefined, assunto: string, html: string) {
  if (!destino) return;
  await emailService
    .sendMail({ to: destino, subject: assunto, html })
    .catch((erro: Error) => console.error('[mercado] e-mail falhou:', erro.message));
}

const moldura = (titulo: string, corpo: string) => `
  <div style="font-family: system-ui, -apple-system, sans-serif; color: #0f343a; line-height: 1.6;">
    <h2 style="color: #159fa3; margin: 0 0 12px;">${titulo}</h2>
    ${corpo}
    <p style="margin-top: 24px; font-size: 12px; color: #64748b;">Saúde Pet Mercado</p>
  </div>
`;

/** Pedido pago: a loja tem trabalho, o tutor tem prazo. */
export async function avisarPedidoPago(pedidoId: string) {
  const pedido = await prisma.pedidoMercado.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      codigo: true,
      total: true,
      frete: true,
      entrega_tipo: true,
      entrega_endereco: true,
      entrega_distancia_km: true,
      exige_receita: true,
      loja: {
        select: {
          nome_fantasia: true,
          email: true,
          prazo_preparo_min: true,
          entrega_prazo_horas: true,
          responsavel_id: true,
          endereco: true,
          bairro: true,
          cidade: true
        }
      },
      tutor: { select: { id: true, nome: true, email: true } },
      itens: { select: { nome: true, quantidade: true } }
    }
  });
  if (!pedido) return { avisou: false };

  const listaDeItens = pedido.itens
    .map((item) => `<li>${item.quantidade}× ${item.nome}</li>`)
    .join('');

  // ── Loja ───────────────────────────────────────────────────────────────────
  await empurrar(pedido.loja.responsavel_id, {
    title: `Pedido ${pedido.codigo} pago`,
    body: `${dinheiro(pedido.total)} · ${pedido.itens.length} item(ns) para separar`,
    url: '/mercado/loja/pedidos',
    tag: `mercado-pedido-${pedido.id}`
  });

  await email(
    pedido.loja.email,
    `Novo pedido pago — ${pedido.codigo}`,
    moldura(
      `Pedido ${pedido.codigo} pago`,
      `<p><strong>${pedido.tutor.nome}</strong> pagou ${dinheiro(pedido.total)}.</p>
       <ul>${listaDeItens}</ul>
       ${
         pedido.exige_receita
           ? '<p style="background:#fef3c7;padding:10px;border-radius:8px;"><strong>Atenção:</strong> este pedido tem item sob prescrição veterinária. Confira a receita antes de separar.</p>'
           : ''
       }
       <p>${
         pedido.entrega_tipo === 'retirada'
           ? 'O tutor vai retirar no balcão.'
           : pedido.entrega_tipo === 'loja'
             ? `<strong>Entrega pela loja</strong> em ${pedido.entrega_endereco}${
                 pedido.entrega_distancia_km != null
                   ? ` (${Number(pedido.entrega_distancia_km).toFixed(1).replace('.', ',')} km)`
                   : ''
               }. Frete cobrado: ${dinheiro(pedido.frete)}.`
             : 'A entrega será combinada direto com o tutor.'
       }</p>`
    )
  );

  // ── Tutor ──────────────────────────────────────────────────────────────────
  const onde =
    pedido.entrega_tipo === 'retirada'
      ? `Retirada em ${[pedido.loja.endereco, pedido.loja.bairro, pedido.loja.cidade].filter(Boolean).join(', ')}.`
      : pedido.entrega_tipo === 'loja'
        ? `A loja entrega em ${pedido.entrega_endereco}${
            pedido.loja.entrega_prazo_horas ? `, em até ${pedido.loja.entrega_prazo_horas} h` : ''
          }.`
        : `A loja vai combinar a entrega com você.`;

  await empurrar(pedido.tutor.id, {
    title: 'Pagamento confirmado',
    body: `${pedido.loja.nome_fantasia} já recebeu seu pedido ${pedido.codigo}`,
    url: `/tutor/mercado/pedidos/${pedido.id}`,
    tag: `mercado-pedido-${pedido.id}`
  });

  await email(
    pedido.tutor.email,
    `Pagamento confirmado — pedido ${pedido.codigo}`,
    moldura(
      'Pagamento confirmado',
      `<p>Olá, <strong>${pedido.tutor.nome}</strong>!</p>
       <p>A <strong>${pedido.loja.nome_fantasia}</strong> já foi avisada e vai separar seu pedido
       <strong>${pedido.codigo}</strong> em cerca de ${pedido.loja.prazo_preparo_min} minutos.</p>
       <ul>${listaDeItens}</ul>
       <p>${onde}</p>`
    )
  );

  return { avisou: true };
}

/** O pedido andou: separando, pronto, concluído ou cancelado. */
export async function avisarMudancaDeStatus(pedidoId: string, status: string) {
  const pedido = await prisma.pedidoMercado.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      codigo: true,
      entrega_tipo: true,
      entrega_endereco: true,
      cancelado_motivo: true,
      loja: { select: { nome_fantasia: true, telefone: true, endereco: true, bairro: true, cidade: true } },
      tutor: { select: { id: true, nome: true, email: true } }
    }
  });
  if (!pedido) return { avisou: false };

  const ondeRetirar = [pedido.loja.endereco, pedido.loja.bairro, pedido.loja.cidade].filter(Boolean).join(', ');

  // Só o que muda a vida de quem espera vira aviso. "Em separação" e "concluído"
  // não pedem ação nenhuma do tutor — avisar de tudo treina a pessoa a ignorar.
  const textos: Record<string, { titulo: string; corpo: string }> = {
    pronto: {
      titulo:
        pedido.entrega_tipo === 'loja' ? `Pedido ${pedido.codigo} saiu para entrega` : `Pedido ${pedido.codigo} pronto`,
      corpo:
        pedido.entrega_tipo === 'retirada'
          ? `Pode buscar na ${pedido.loja.nome_fantasia} — ${ondeRetirar}.`
          : pedido.entrega_tipo === 'loja'
            ? `A ${pedido.loja.nome_fantasia} está levando seu pedido para ${pedido.entrega_endereco}.`
            : `A ${pedido.loja.nome_fantasia} vai entrar em contato para combinar a entrega.`
    },
    cancelado: {
      titulo: `Pedido ${pedido.codigo} cancelado`,
      corpo: pedido.cancelado_motivo || 'Fale com a loja para entender o motivo.'
    },
    reembolsado: {
      titulo: `Pedido ${pedido.codigo} reembolsado`,
      corpo: 'O valor foi devolvido pelo mesmo meio de pagamento.'
    }
  };

  const aviso = textos[status];
  if (!aviso) return { avisou: false };

  await empurrar(pedido.tutor.id, {
    title: aviso.titulo,
    body: aviso.corpo,
    url: `/tutor/mercado/pedidos/${pedido.id}`,
    tag: `mercado-pedido-${pedido.id}`
  });

  await email(
    pedido.tutor.email,
    aviso.titulo,
    moldura(aviso.titulo, `<p>Olá, <strong>${pedido.tutor.nome}</strong>!</p><p>${aviso.corpo}</p>`)
  );

  return { avisou: true };
}

/** Decisão da equipe sobre a loja: aprovada, recusada ou suspensa. */
export async function avisarDecisaoDaLoja(params: {
  responsavelId: string;
  nomeDaLoja: string;
  decisao: 'aprovada' | 'recusada' | 'suspensa';
  motivo?: string | null;
}) {
  const responsavel = await prisma.usuario.findUnique({
    where: { id: params.responsavelId },
    select: { nome: true, email: true }
  });

  const titulos = {
    aprovada: `${params.nomeDaLoja} foi aprovada`,
    recusada: `Cadastro de ${params.nomeDaLoja} precisa de ajustes`,
    suspensa: `${params.nomeDaLoja} foi suspensa`
  } as const;

  const corpos = {
    aprovada: 'Sua loja já aparece na vitrine do Saúde Pet Mercado e pode receber pedidos.',
    recusada: params.motivo || 'Revise o cadastro e envie de novo.',
    suspensa: params.motivo || 'Fale com o suporte para entender os próximos passos.'
  } as const;

  await empurrar(params.responsavelId, {
    title: titulos[params.decisao],
    body: corpos[params.decisao],
    url: '/mercado/loja',
    tag: 'mercado-loja-status'
  });

  await email(
    responsavel?.email,
    titulos[params.decisao],
    moldura(
      titulos[params.decisao],
      `<p>Olá, <strong>${responsavel?.nome || ''}</strong>!</p><p>${corpos[params.decisao]}</p>`
    )
  );

  return { avisou: true };
}

// ── Assinatura ────────────────────────────────────────────────────────────────

/** O ciclo gerou o pedido: o tutor recebe o aviso com o caminho do Pix. */
export async function avisarCicloDaAssinatura(pedidoId: string) {
  const pedido = await prisma.pedidoMercado.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      codigo: true,
      total: true,
      desconto: true,
      expira_em: true,
      loja: { select: { nome_fantasia: true } },
      tutor: { select: { id: true, nome: true, email: true } },
      itens: { select: { nome: true, quantidade: true } }
    }
  });
  if (!pedido) return { avisou: false };

  const itens = pedido.itens.map((item) => `${item.quantidade}× ${item.nome}`).join(', ');
  const titulo = `Sua ração está pronta para pedir — ${pedido.loja.nome_fantasia}`;
  const corpo = `${itens}. ${dinheiro(pedido.total)}${Number(pedido.desconto) > 0 ? ` (já com ${dinheiro(pedido.desconto)} de desconto de assinante)` : ''}. Pague pelo app para a loja separar.`;

  await empurrar(pedido.tutor.id, {
    title: titulo,
    body: corpo,
    url: `/tutor/mercado/pedidos/${pedido.id}`,
    tag: `mercado-assinatura-${pedido.id}`
  });

  const prazo = pedido.expira_em
    ? `<p>O pedido fica reservado até <strong>${dataHoraBr(pedido.expira_em)}</strong>. Depois disso o estoque volta para a loja e o próximo aviso vem no ciclo seguinte.</p>`
    : '';
  await email(
    pedido.tutor.email,
    titulo,
    moldura(
      titulo,
      `<p>Olá, <strong>${pedido.tutor.nome}</strong>!</p><p>Chegou a hora do pedido <strong>${pedido.codigo}</strong> da sua assinatura: ${itens}.</p><p>Total: <strong>${dinheiro(pedido.total)}</strong>.</p>${prazo}`
    )
  );

  return { avisou: true };
}

/** Três ciclos sem pagamento: a assinatura pausou, e a pessoa precisa saber para retomar. */
export async function avisarAssinaturaPausada(assinaturaId: string) {
  const assinatura = await prisma.assinaturaMercado.findUnique({
    where: { id: assinaturaId },
    select: {
      id: true,
      loja: { select: { nome_fantasia: true } },
      tutor: { select: { id: true, nome: true, email: true } }
    }
  });
  if (!assinatura) return { avisou: false };

  const titulo = `Assinatura pausada — ${assinatura.loja.nome_fantasia}`;
  const corpo = 'Três pedidos seguidos venceram sem pagamento, então pausamos para não reservar estoque à toa. Retome quando quiser.';

  await empurrar(assinatura.tutor.id, {
    title: titulo,
    body: corpo,
    url: '/tutor/mercado/assinaturas',
    tag: `mercado-assinatura-pausa-${assinatura.id}`
  });
  await email(
    assinatura.tutor.email,
    titulo,
    moldura(titulo, `<p>Olá, <strong>${assinatura.tutor.nome}</strong>!</p><p>${corpo}</p>`)
  );
  return { avisou: true };
}

