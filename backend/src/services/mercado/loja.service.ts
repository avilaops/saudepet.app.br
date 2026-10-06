import prisma from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middleware/error.middleware';
import { apenasDigitos, cnpjValido, DISPONIVEL, gerarSlug, LOJA_PUBLICA, SLUGS_RESERVADOS } from './comum';
import type { Prisma, StatusLojaMercado } from '@prisma/client';

const geocoding = require('../geocoding.service');

/**
 * A loja do Saúde Pet Mercado.
 *
 * O vendedor aqui não é a plataforma: é uma empresa de fora — petshop,
 * agropecuária, distribuidora — que cadastra a própria loja pela TELA, na conta
 * que ela já usa. Não existe "mande um e-mail para a equipe cadastrar": um
 * serviço sem fluxo completo na interface não está entregue.
 *
 * O que ela NÃO faz sozinha é entrar na vitrine. A loja nasce em `rascunho`,
 * envia para conferência e espera aprovação — pelo mesmo motivo que o
 * veterinário espera: parte do catálogo é medicamento de uso animal, e liberar
 * a venda por causa de um formulário preenchido seria confiar num CNPJ que
 * ninguém olhou.
 */

/** Campos da loja que o público pode ver. O resto é interno. */
const CAMPOS_PUBLICOS = {
  id: true,
  nome_fantasia: true,
  slug: true,
  descricao: true,
  logo_url: true,
  telefone: true,
  whatsapp: true,
  endereco: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  estado: true,
  latitude: true,
  longitude: true,
  aceita_retirada: true,
  aceita_combinar: true,
  prazo_preparo_min: true,
  pedido_minimo: true,
  // A política de entrega é pública de propósito: o tutor decide se vale
  // encher o carrinho sabendo o raio e o piso do frete grátis ANTES.
  aceita_entrega: true,
  entrega_raio_km: true,
  frete_base: true,
  frete_por_km: true,
  frete_gratis_acima: true,
  entrega_prazo_horas: true,
  aceita_transportadora: true,
  // Assinatura: o tutor precisa ver o desconto ANTES de assinar.
  aceita_assinatura: true,
  assinatura_desconto_pct: true,
  assinatura_frete_gratis: true
} satisfies Prisma.LojaMercadoSelect;

/** Tudo que o dono da loja vê da própria loja — inclusive o que está pendente. */
const CAMPOS_DO_DONO = {
  ...CAMPOS_PUBLICOS,
  razao_social: true,
  cnpj: true,
  email: true,
  cep: true,
  embalagem_altura_cm: true,
  embalagem_largura_cm: true,
  embalagem_comprimento_cm: true,
  status: true,
  demonstracao: true,
  motivo_recusa: true,
  enviada_em: true,
  aprovada_em: true,
  comissao_pct: true,
  criado_em: true
} satisfies Prisma.LojaMercadoSelect;

/**
 * Slug livre dentro do tenant. Duas "Petshop do Bairro" na mesma cidade não é
 * hipótese remota — é o nome mais comum que existe.
 */
async function slugDisponivel(tenantId: string, base: string, ignorarId?: string): Promise<string> {
  const raiz = gerarSlug(base) || 'loja';
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const candidato = tentativa === 0 ? raiz : `${raiz}-${tentativa + 1}`;
    // `/mercado/loja` é o painel do lojista: uma loja com esse slug ficaria sem
    // vitrine pública e ninguém saberia por quê.
    if (SLUGS_RESERVADOS.has(candidato)) continue;
    const existente = await prisma.lojaMercado.findFirst({
      where: { tenant_id: tenantId, slug: candidato },
      select: { id: true }
    });
    if (!existente || existente.id === ignorarId) return candidato;
  }
  throw new ConflictError('Não foi possível gerar um endereço para esta loja. Mude o nome fantasia.');
}

type DadosDaLoja = {
  nome_fantasia?: unknown;
  razao_social?: unknown;
  cnpj?: unknown;
  descricao?: unknown;
  logo_url?: unknown;
  email?: unknown;
  telefone?: unknown;
  whatsapp?: unknown;
  cep?: unknown;
  endereco?: unknown;
  numero?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  cidade?: unknown;
  estado?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  aceita_retirada?: unknown;
  aceita_combinar?: unknown;
  prazo_preparo_min?: unknown;
  pedido_minimo?: unknown;
  aceita_entrega?: unknown;
  entrega_raio_km?: unknown;
  frete_base?: unknown;
  frete_por_km?: unknown;
  frete_gratis_acima?: unknown;
  entrega_prazo_horas?: unknown;
  aceita_transportadora?: unknown;
  aceita_assinatura?: unknown;
  assinatura_desconto_pct?: unknown;
  assinatura_frete_gratis?: unknown;
  embalagem_altura_cm?: unknown;
  embalagem_largura_cm?: unknown;
  embalagem_comprimento_cm?: unknown;
};

const texto = (valor: unknown): string => String(valor ?? '').trim();
const textoOuNulo = (valor: unknown): string | null => (texto(valor) === '' ? null : texto(valor));

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function validarObrigatorios(dados: DadosDaLoja) {
  if (texto(dados.nome_fantasia).length < 2) {
    throw new ValidationError('Informe o nome fantasia da loja.');
  }
  if (!texto(dados.email).includes('@')) {
    throw new ValidationError('Informe um e-mail de contato válido.');
  }
  if (apenasDigitos(dados.telefone).length < 10) {
    throw new ValidationError('Informe um telefone com DDD.');
  }
  if (texto(dados.endereco).length < 5) {
    throw new ValidationError('Informe o endereço da loja — é onde o tutor vai buscar o pedido.');
  }
  if (texto(dados.cidade).length < 2) {
    throw new ValidationError('Informe a cidade da loja.');
  }
  if (texto(dados.estado).length !== 2) {
    throw new ValidationError('Informe o estado com duas letras (ex.: SP).');
  }
  if (texto(dados.cnpj) && !cnpjValido(texto(dados.cnpj))) {
    throw new ValidationError('O CNPJ informado não é válido.');
  }

  if (dados.aceita_transportadora) {
    if (apenasDigitos(dados.cep).length !== 8) {
      throw new ValidationError('Para enviar pela transportadora, informe o CEP da loja com 8 dígitos.');
    }
    if (texto(dados.numero).length < 1) {
      throw new ValidationError('Para enviar pela transportadora, informe o número do endereço da loja.');
    }
    if (!texto(dados.cnpj) || !cnpjValido(texto(dados.cnpj))) {
      throw new ValidationError('Para emitir etiquetas, informe um CNPJ válido da loja.');
    }
    for (const [campo, rotulo, minimo] of [
      ['embalagem_altura_cm', 'altura', 2],
      ['embalagem_largura_cm', 'largura', 11],
      ['embalagem_comprimento_cm', 'comprimento', 16]
    ] as const) {
      const valor = numeroOuNulo(dados[campo]);
      if (valor === null || valor < minimo || valor > 100) {
        throw new ValidationError(`A ${rotulo} da caixa de envio precisa ficar entre ${minimo} e 100 cm.`);
      }
    }
    const soma = ['embalagem_altura_cm', 'embalagem_largura_cm', 'embalagem_comprimento_cm']
      .reduce((total, campo) => total + Number(dados[campo as keyof DadosDaLoja] || 0), 0);
    if (soma > 200) throw new ValidationError('A soma das medidas da caixa não pode passar de 200 cm.');
  }

  // Desconto de assinante entre 0 e 50%: acima disso é erro de digitação, não
  // política. Zero é permitido — a loja pode vender recorrência só pela
  // comodidade da entrega programada.
  if (dados.aceita_assinatura) {
    const desconto = numeroOuNulo(dados.assinatura_desconto_pct);
    if (desconto !== null && (desconto < 0 || desconto > 50)) {
      throw new ValidationError('O desconto de assinante precisa ficar entre 0% e 50%.');
    }
  }

  // Entregar sem raio é prometer o que não se sabe se cumpre. O teto de 200 km
  // é sanidade: acima disso não é entrega de petshop, é transportadora.
  if (dados.aceita_entrega) {
    const raio = numeroOuNulo(dados.entrega_raio_km);
    if (raio === null || raio <= 0 || raio > 200) {
      throw new ValidationError('Para entregar, informe até quantos km sua loja leva (entre 0,5 e 200).');
    }
  }
  for (const [campo, rotulo] of [
    ['frete_base', 'O frete fixo'],
    ['frete_por_km', 'O frete por km'],
    ['frete_gratis_acima', 'O valor para frete grátis']
  ] as const) {
    const informado = dados[campo];
    if (informado === undefined || informado === null || informado === '') continue;
    const valor = numeroOuNulo(informado);
    if (valor === null || valor < 0) {
      throw new ValidationError(`${rotulo} precisa ser um número igual ou maior que zero.`);
    }
  }
}

/**
 * Onde a loja fica, em coordenada.
 *
 * O cadastro pede endereço em texto; a entrega precisa de ponto. Quando a loja
 * não informou coordenada, perguntamos ao geocodificador — em silêncio, porque
 * a falha dele não pode impedir alguém de salvar o próprio cadastro. Só vira
 * erro quando a loja QUER entregar e continua sem ponto: aí a promessa é
 * impossível de cumprir, e recusar é o honesto.
 */
async function localizarLoja(campos: {
  endereco: string;
  bairro: string | null;
  cidade: string;
  estado: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<{ latitude: number | null; longitude: number | null }> {
  if (campos.latitude !== null && campos.longitude !== null) {
    return { latitude: campos.latitude, longitude: campos.longitude };
  }

  const termo = [campos.endereco, campos.bairro, campos.cidade, campos.estado].filter(Boolean).join(', ');
  try {
    const resultados: Array<{ latitude: number; longitude: number }> = await geocoding.buscar({ termo, limite: 1 });
    const primeiro = resultados?.[0];
    if (primeiro && Number.isFinite(primeiro.latitude) && Number.isFinite(primeiro.longitude)) {
      return { latitude: primeiro.latitude, longitude: primeiro.longitude };
    }
  } catch (erro) {
    console.error('[mercado] geocodificação da loja falhou:', (erro as Error).message);
  }
  return { latitude: null, longitude: null };
}

function exigirPontoParaEntregar(campos: { aceita_entrega: boolean; latitude: number | null; longitude: number | null }) {
  if (campos.aceita_entrega && (campos.latitude === null || campos.longitude === null)) {
    throw new ValidationError(
      'Para entregar, precisamos localizar sua loja no mapa e não conseguimos. Confira rua, número, bairro e cidade.'
    );
  }
}

function camposEditaveis(dados: DadosDaLoja) {
  return {
    nome_fantasia: texto(dados.nome_fantasia),
    razao_social: textoOuNulo(dados.razao_social),
    cnpj: textoOuNulo(dados.cnpj) ? apenasDigitos(dados.cnpj) : null,
    descricao: textoOuNulo(dados.descricao),
    logo_url: textoOuNulo(dados.logo_url),
    email: texto(dados.email).toLowerCase(),
    telefone: texto(dados.telefone),
    whatsapp: textoOuNulo(dados.whatsapp),
    cep: textoOuNulo(dados.cep) ? apenasDigitos(dados.cep) : null,
    endereco: texto(dados.endereco),
    numero: textoOuNulo(dados.numero),
    complemento: textoOuNulo(dados.complemento),
    bairro: textoOuNulo(dados.bairro),
    cidade: texto(dados.cidade),
    estado: texto(dados.estado).toUpperCase(),
    latitude: numeroOuNulo(dados.latitude),
    longitude: numeroOuNulo(dados.longitude),
    aceita_retirada: dados.aceita_retirada === undefined ? true : Boolean(dados.aceita_retirada),
    aceita_combinar: dados.aceita_combinar === undefined ? true : Boolean(dados.aceita_combinar),
    prazo_preparo_min: Math.max(0, Math.min(2880, Number(dados.prazo_preparo_min ?? 60) || 60)),
    pedido_minimo: Math.max(0, Number(dados.pedido_minimo ?? 0) || 0),
    aceita_entrega: Boolean(dados.aceita_entrega),
    entrega_raio_km: numeroOuNulo(dados.entrega_raio_km),
    frete_base: Math.max(0, numeroOuNulo(dados.frete_base) ?? 0),
    frete_por_km: Math.max(0, numeroOuNulo(dados.frete_por_km) ?? 0),
    frete_gratis_acima: numeroOuNulo(dados.frete_gratis_acima),
    entrega_prazo_horas: (() => {
      const horas = numeroOuNulo(dados.entrega_prazo_horas);
      return horas === null ? null : Math.max(1, Math.min(720, Math.round(horas)));
    })(),
    aceita_transportadora: Boolean(dados.aceita_transportadora),
    aceita_assinatura: Boolean(dados.aceita_assinatura),
    assinatura_desconto_pct: (() => {
      const pct = numeroOuNulo(dados.assinatura_desconto_pct);
      return pct === null ? 5 : Math.max(0, Math.min(50, pct));
    })(),
    assinatura_frete_gratis: Boolean(dados.assinatura_frete_gratis),
    embalagem_altura_cm: numeroOuNulo(dados.embalagem_altura_cm),
    embalagem_largura_cm: numeroOuNulo(dados.embalagem_largura_cm),
    embalagem_comprimento_cm: numeroOuNulo(dados.embalagem_comprimento_cm)
  };
}

/** A loja da pessoa logada, se existir. Uma conta responde por uma loja só. */
export async function minhaLoja(tenantId: string, usuarioId: string) {
  return prisma.lojaMercado.findFirst({
    where: { tenant_id: tenantId, responsavel_id: usuarioId },
    select: CAMPOS_DO_DONO
  });
}

export async function criarLoja(params: { tenantId: string; usuarioId: string; dados: DadosDaLoja }) {
  const { tenantId, usuarioId, dados } = params;

  const jaTem = await prisma.lojaMercado.findFirst({
    where: { tenant_id: tenantId, responsavel_id: usuarioId },
    select: { id: true }
  });
  if (jaTem) {
    throw new ConflictError('Esta conta já responde por uma loja. Edite a que existe.');
  }

  validarObrigatorios(dados);

  const campos = { ...camposEditaveis(dados) };
  Object.assign(campos, await localizarLoja(campos));
  exigirPontoParaEntregar(campos);
  const slug = await slugDisponivel(tenantId, campos.nome_fantasia);

  // Duas lojas com o mesmo CNPJ no mesmo tenant seriam a mesma empresa
  // cadastrada duas vezes — e dois repasses para conferir no fim do mês.
  if (campos.cnpj) {
    const mesmoCnpj = await prisma.lojaMercado.findFirst({
      where: { tenant_id: tenantId, cnpj: campos.cnpj },
      select: { id: true }
    });
    if (mesmoCnpj) throw new ConflictError('Já existe uma loja cadastrada com este CNPJ.');
  }

  return prisma.lojaMercado.create({
    data: { ...campos, slug, tenant_id: tenantId, responsavel_id: usuarioId, status: 'rascunho' },
    select: CAMPOS_DO_DONO
  });
}

export async function atualizarLoja(params: { tenantId: string; usuarioId: string; dados: DadosDaLoja }) {
  const { tenantId, usuarioId, dados } = params;

  const loja = await prisma.lojaMercado.findFirst({
    where: { tenant_id: tenantId, responsavel_id: usuarioId },
    select: {
      id: true,
      status: true,
      nome_fantasia: true,
      slug: true,
      endereco: true,
      cidade: true,
      latitude: true,
      longitude: true
    }
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');

  validarObrigatorios(dados);
  const campos = { ...camposEditaveis(dados) };

  // Coordenada guardada só continua valendo para o MESMO endereço. Mudou a rua
  // ou a cidade, o ponto antigo é de outro lugar — e o frete sairia errado.
  const mesmoEndereco = campos.endereco === loja.endereco && campos.cidade === loja.cidade;
  if (campos.latitude === null && mesmoEndereco) {
    campos.latitude = loja.latitude ?? null;
    campos.longitude = loja.longitude ?? null;
  }
  Object.assign(campos, await localizarLoja(campos));
  exigirPontoParaEntregar(campos);

  // O endereço da vitrine muda quando o nome muda — mas só antes de a loja ser
  // aprovada. Depois disso o link já foi compartilhado, e trocá-lo por baixo
  // quebraria o que os clientes salvaram.
  const slug = loja.status === 'aprovada'
    ? loja.slug
    : await slugDisponivel(tenantId, campos.nome_fantasia, loja.id);

  // Loja recusada que corrige o cadastro volta para a fila em vez de ficar presa
  // no estado de recusa sem ter o que fazer.
  const status: StatusLojaMercado | undefined = loja.status === 'recusada' ? 'pendente' : undefined;

  return prisma.lojaMercado.update({
    where: { id: loja.id },
    data: {
      ...campos,
      slug,
      ...(status ? { status, motivo_recusa: null, enviada_em: new Date() } : {})
    },
    select: CAMPOS_DO_DONO
  });
}

/**
 * Enviar para conferência.
 *
 * Só sai do rascunho quem tem CNPJ e ao menos um produto: uma loja aprovada com
 * a prateleira vazia é um link para lugar nenhum na vitrine.
 */
export async function enviarParaAnalise(params: { tenantId: string; usuarioId: string }) {
  const loja = await prisma.lojaMercado.findFirst({
    where: { tenant_id: params.tenantId, responsavel_id: params.usuarioId },
    select: { id: true, status: true, cnpj: true }
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');
  if (loja.status === 'aprovada') throw new ConflictError('Esta loja já está aprovada.');
  if (loja.status === 'pendente') throw new ConflictError('O cadastro já está em análise.');
  if (loja.status === 'suspensa') {
    throw new ForbiddenError('Esta loja está suspensa. Fale com o suporte antes de reenviar.');
  }
  if (!loja.cnpj) {
    throw new ValidationError('Informe o CNPJ da empresa antes de enviar para análise.');
  }

  const produtos = await prisma.produtoMercado.count({ where: { loja_id: loja.id } });
  if (produtos === 0) {
    throw new ValidationError('Cadastre pelo menos um produto antes de enviar a loja para análise.');
  }

  return prisma.lojaMercado.update({
    where: { id: loja.id },
    data: { status: 'pendente', enviada_em: new Date(), motivo_recusa: null },
    select: CAMPOS_DO_DONO
  });
}

// ── Vitrine (leitura pública, dentro do tenant) ───────────────────────────────

export async function listarLojasDaVitrine(params: {
  tenantId: string;
  cidade?: string | null;
  busca?: string | null;
  limite?: number;
}) {
  const limite = Math.min(Math.max(Number(params.limite) || 30, 1), 60);

  const where: Prisma.LojaMercadoWhereInput = {
    tenant_id: params.tenantId,
    ...LOJA_PUBLICA,
    // Vitrine sem produto disponível é prateleira vazia com placa. Só entra na
    // lista a loja que tem ao menos um item à venda de verdade — e "à venda" não
    // é `estoque > 0`: quem não faz contagem vende igual (ver `DISPONIVEL`).
    produtos: { some: { ativo: true, ...DISPONIVEL } }
  };

  if (params.cidade) {
    where.cidade = { equals: String(params.cidade), mode: 'insensitive' };
  }
  if (params.busca) {
    where.OR = [
      { nome_fantasia: { contains: String(params.busca), mode: 'insensitive' } },
      { descricao: { contains: String(params.busca), mode: 'insensitive' } }
    ];
  }

  const lojas = await prisma.lojaMercado.findMany({
    where,
    select: {
      ...CAMPOS_PUBLICOS,
      _count: { select: { produtos: { where: { ativo: true, ...DISPONIVEL } } } }
    },
    orderBy: { nome_fantasia: 'asc' },
    take: limite
  });

  return lojas.map(({ _count, ...loja }) => ({ ...loja, total_produtos: _count.produtos }));
}

export async function lojaDaVitrine(params: { tenantId: string; slugOuId: string }) {
  const loja = await prisma.lojaMercado.findFirst({
    where: {
      tenant_id: params.tenantId,
      ...LOJA_PUBLICA,
      OR: [{ slug: params.slugOuId }, { id: params.slugOuId }]
    },
    select: CAMPOS_PUBLICOS
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');
  return loja;
}

// ── Painel administrativo ─────────────────────────────────────────────────────

export async function listarLojasParaAdmin(params: { tenantId: string; status?: string | null }) {
  const where: Prisma.LojaMercadoWhereInput = { tenant_id: params.tenantId };
  if (params.status) where.status = params.status as StatusLojaMercado;

  return prisma.lojaMercado.findMany({
    where,
    select: {
      ...CAMPOS_DO_DONO,
      responsavel: { select: { id: true, nome: true, email: true } },
      _count: { select: { produtos: true, pedidos: true } }
    },
    orderBy: [{ status: 'asc' }, { enviada_em: 'asc' }, { criado_em: 'desc' }]
  });
}

/**
 * Decisão da equipe sobre uma loja.
 *
 * `recusada` e `suspensa` exigem motivo por escrito. Barrar o ganha-pão de
 * alguém sem dizer por quê transforma o suporte num jogo de adivinhação — e a
 * loja recusada precisa saber o que corrigir para reenviar.
 */
export async function decidirSobreLoja(params: {
  tenantId: string;
  lojaId: string;
  decisao: 'aprovada' | 'recusada' | 'suspensa';
  motivo?: string | null;
  adminId: string;
  comissaoPct?: number | null;
}) {
  const loja = await prisma.lojaMercado.findFirst({
    where: { id: params.lojaId, tenant_id: params.tenantId },
    select: { id: true, status: true, nome_fantasia: true, responsavel_id: true, demonstracao: true }
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');

  // Loja de demonstração não passa deste ponto. O filtro público já a esconde;
  // recusar aqui é para o painel não gravar 'aprovada' numa loja que nunca vai
  // aparecer — e para quem clicou saber por quê, em vez de procurar a loja na
  // vitrine e não achar.
  if (params.decisao === 'aprovada' && loja.demonstracao) {
    throw new ValidationError('Esta loja é de demonstração e não pode ser aprovada nem aparecer na vitrine.');
  }

  if (params.decisao !== 'aprovada' && !texto(params.motivo)) {
    throw new ValidationError('Escreva o motivo — a loja precisa saber o que corrigir.');
  }

  const comissao = numeroOuNulo(params.comissaoPct);
  if (comissao !== null && (comissao < 0 || comissao > 50)) {
    throw new ValidationError('A comissão precisa ficar entre 0% e 50%.');
  }

  const atualizada = await prisma.lojaMercado.update({
    where: { id: loja.id },
    data: {
      status: params.decisao,
      motivo_recusa: params.decisao === 'aprovada' ? null : texto(params.motivo),
      aprovada_em: params.decisao === 'aprovada' ? new Date() : null,
      aprovada_por: params.decisao === 'aprovada' ? params.adminId : null,
      ...(comissao !== null ? { comissao_pct: comissao } : {})
    },
    select: CAMPOS_DO_DONO
  });

  // Loja suspensa ou recusada some da vitrine na hora — mas o catálogo dela
  // continua no banco. Desativar produto por produto apagaria a configuração
  // do lojista, que ele teria de refazer na volta.
  return { loja: atualizada, responsavelId: loja.responsavel_id, nome: loja.nome_fantasia };
}

/**
 * A comissão que vale para esta loja: a negociada com ela, ou a do tenant.
 *
 * O mesmo desenho do atendimento — o número mora na configuração, não no
 * código, para mudar o corte comercial sem deploy.
 */
export async function comissaoDaLoja(params: { tenantId: string; comissaoDaLoja?: unknown }): Promise<number> {
  const propria = numeroOuNulo(params.comissaoDaLoja);
  if (propria !== null) return propria;

  const config = await prisma.configuracaoTenant
    .findUnique({
      where: { tenant_id: params.tenantId },
      select: { comissao_plataforma_pct: true }
    })
    .catch(() => null);

  return config?.comissao_plataforma_pct != null ? Number(config.comissao_plataforma_pct) : 15;
}

export { CAMPOS_PUBLICOS, CAMPOS_DO_DONO };
export { apenasDigitos, cnpjValido, gerarSlug };
