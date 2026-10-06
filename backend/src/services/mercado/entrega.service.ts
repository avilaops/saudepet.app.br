import prisma from '../../config/database';
import { NotFoundError } from '../../middleware/error.middleware';
import { distanciaKm } from '../geo.service';
import { cotarFrete, type CotacaoDeEntrega } from './comum';

/**
 * Entrega pela própria loja.
 *
 * Não é o entregador da plataforma — esse continua reservado no enum e sem
 * ninguém para fazer. É o dono da loja (ou o rapaz da moto dele) levando o
 * pedido dentro do raio que a loja definiu, pelo frete que a loja definiu.
 *
 * O que a plataforma acrescenta é a HONESTIDADE do número: a distância é
 * calculada entre a coordenada da loja e a do endereço do tutor, o frete sai
 * da conta antes de a pessoa escolher, e o que está fora do raio é recusado na
 * hora — não descoberto num telefonema depois do pagamento.
 */

const SELECAO_POLITICA = {
  id: true,
  status: true,
  latitude: true,
  longitude: true,
  aceita_entrega: true,
  entrega_raio_km: true,
  frete_base: true,
  frete_por_km: true,
  frete_gratis_acima: true,
  entrega_prazo_horas: true
} as const;

export type CotacaoDaLoja = CotacaoDeEntrega & { prazo_horas: number | null };

export async function cotarEntregaDaLoja(params: {
  tenantId: string;
  lojaId: string;
  latitude: unknown;
  longitude: unknown;
  subtotal: number;
}): Promise<CotacaoDaLoja> {
  const loja = await prisma.lojaMercado.findFirst({
    where: { id: params.lojaId, tenant_id: params.tenantId },
    select: SELECAO_POLITICA
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');

  // Loja sem coordenada não entrega, mesmo que tenha marcado que entrega: sem
  // o ponto de partida a distância não existe, e frete sem distância é chute.
  if (loja.aceita_entrega && (loja.latitude === null || loja.longitude === null)) {
    return {
      disponivel: false,
      motivo: 'A loja ainda não confirmou a localização dela no mapa.',
      distancia_km: null,
      raio_km: loja.entrega_raio_km === null ? null : Number(loja.entrega_raio_km),
      frete: 0,
      frete_gratis: false,
      falta_para_frete_gratis: null,
      prazo_horas: loja.entrega_prazo_horas
    };
  }

  const distancia = distanciaKm(loja.latitude, loja.longitude, params.latitude, params.longitude);
  const cotacao = cotarFrete(loja, distancia, params.subtotal);

  return { ...cotacao, prazo_horas: loja.entrega_prazo_horas };
}
