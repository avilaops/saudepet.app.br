import type { Request, Response } from 'express';
import prisma from '../config/database';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/error.middleware';

/**
 * Endereços salvos do tutor.
 *
 * Mesmo com o mapa no passo do endereço, escolher o local do zero a cada chamado
 * é atrito no pior momento possível: o pet passando mal e a pessoa procurando a
 * própria casa no mapa. Endereço salvo é o que permite "Casa" em um toque, com a
 * coordenada já confirmada uma vez.
 */

/** O que a tela manda no corpo. Nada aqui é validado por schema: cada campo é conferido à mão. */
type CorpoDeEndereco = {
  rotulo?: unknown;
  endereco?: unknown;
  complemento?: unknown;
  cidade?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  principal?: unknown;
};

const corpoDe = (req: Request): CorpoDeEndereco => (req.body || {}) as CorpoDeEndereco;

// `tenantContext` e `authMiddleware` já rodaram nesta rota: os dois campos
// existem. `String()` é o que o resto da casa faz para dizer isso ao compilador.
const tenantDe = (req: Request) => String(req.tenantId);
const usuarioDe = (req: Request) => String(req.userId);

class EnderecoController {
  listar = asyncHandler(async (req: Request, res: Response) => {
    const enderecos = await prisma.enderecoTutor.findMany({
      where: { tutor_id: usuarioDe(req), tenant_id: tenantDe(req) },
      // O principal primeiro; depois o que a pessoa realmente usa. Ordenar por
      // data de cadastro deixaria o endereço de uma viagem antiga no topo.
      orderBy: [{ principal: 'desc' }, { usado_em: 'desc' }, { criado_em: 'desc' }]
    });

    return res.json({ enderecos });
  });

  criar = asyncHandler(async (req: Request, res: Response) => {
    const { rotulo, endereco, complemento, cidade, latitude, longitude, principal } = corpoDe(req);

    if (!endereco || String(endereco).trim().length < 5) {
      throw new ValidationError('Informe o endereço.');
    }
    // `Number(null)` é 0, que é finito — e 0/0 é um ponto no golfo da Guiné.
    // Coordenada ausente precisa ser recusada explicitamente.
    const numero = (valor: unknown): number | null => {
      if (valor === null || valor === undefined || valor === '') return null;
      const convertido = Number(valor);
      return Number.isFinite(convertido) ? convertido : null;
    };
    const lat = numero(latitude);
    const lng = numero(longitude);

    if (lat === null || lng === null) {
      throw new ValidationError('Confirme o ponto no mapa antes de salvar.');
    }

    // Primeiro endereço é o principal por definição: sem isso a pessoa salvaria
    // um endereço e ele não seria sugerido em lugar nenhum.
    const jaTem = await prisma.enderecoTutor.count({
      where: { tutor_id: usuarioDe(req), tenant_id: tenantDe(req) }
    });
    const viraPrincipal = principal === true || jaTem === 0;

    const criado = await prisma.$transaction(async (tx) => {
      if (viraPrincipal) {
        await tx.enderecoTutor.updateMany({
          where: { tutor_id: usuarioDe(req), tenant_id: tenantDe(req) },
          data: { principal: false }
        });
      }

      return tx.enderecoTutor.create({
        data: {
          tenant_id: tenantDe(req),
          tutor_id: usuarioDe(req),
          rotulo: String(rotulo || 'Meu endereço').trim().slice(0, 40),
          endereco: String(endereco).trim().slice(0, 300),
          complemento: complemento ? String(complemento).trim().slice(0, 200) : null,
          cidade: cidade ? String(cidade).trim().slice(0, 120) : null,
          latitude: lat,
          longitude: lng,
          principal: viraPrincipal
        }
      });
    });

    return res.status(201).json({ endereco: criado });
  });

  atualizar = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { rotulo, endereco, complemento, cidade, latitude, longitude, principal } = corpoDe(req);

    const atual = await prisma.enderecoTutor.findFirst({
      where: { id, tutor_id: usuarioDe(req), tenant_id: tenantDe(req) }
    });

    if (!atual) throw new NotFoundError('Endereço não encontrado');

    const atualizado = await prisma.$transaction(async (tx) => {
      if (principal === true) {
        await tx.enderecoTutor.updateMany({
          where: { tutor_id: usuarioDe(req), tenant_id: tenantDe(req) },
          data: { principal: false }
        });
      }

      return tx.enderecoTutor.update({
        where: { id },
        data: {
          ...(rotulo !== undefined && { rotulo: String(rotulo).trim().slice(0, 40) }),
          ...(endereco !== undefined && { endereco: String(endereco).trim().slice(0, 300) }),
          ...(complemento !== undefined && { complemento: complemento ? String(complemento).trim().slice(0, 200) : null }),
          ...(cidade !== undefined && { cidade: cidade ? String(cidade).trim().slice(0, 120) : null }),
          ...(latitude !== undefined && latitude !== null && Number.isFinite(Number(latitude)) && { latitude: Number(latitude) }),
          ...(longitude !== undefined && longitude !== null && Number.isFinite(Number(longitude)) && { longitude: Number(longitude) }),
          ...(principal !== undefined && { principal: Boolean(principal) })
        }
      });
    });

    return res.json({ endereco: atualizado });
  });

  remover = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const atual = await prisma.enderecoTutor.findFirst({
      where: { id, tutor_id: usuarioDe(req), tenant_id: tenantDe(req) }
    });

    if (!atual) throw new NotFoundError('Endereço não encontrado');

    await prisma.enderecoTutor.delete({ where: { id } });

    // Apagar o principal não pode deixar a lista órfã: o próximo assume.
    if (atual.principal) {
      const proximo = await prisma.enderecoTutor.findFirst({
        where: { tutor_id: usuarioDe(req), tenant_id: tenantDe(req) },
        orderBy: [{ usado_em: 'desc' }, { criado_em: 'desc' }]
      });
      if (proximo) {
        await prisma.enderecoTutor.update({ where: { id: proximo.id }, data: { principal: true } });
      }
    }

    return res.json({ success: true });
  });
}

const enderecoController = new EnderecoController();

// A rota faz `require('../controllers/endereco.controller')` e lê os handlers
// direto da instância — a forma exportada precisa continuar a mesma.
module.exports = enderecoController;

export default enderecoController;
