import type { Request, Response } from 'express';
import { permiteEscolha, profissionaisPara } from '../services/escolha-de-veterinario.service';

/**
 * A vitrine de profissionais, para os tipos de atendimento sem pressa.
 */

type RequestAutenticada = Request & { tenantId?: string };

const numero = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

export async function listar(req: RequestAutenticada, res: Response) {
  const tipo = String(req.query.tipo || '');

  if (!permiteEscolha(tipo)) {
    // Não é erro: é a resposta certa para emergência. A tela usa isto para
    // saber que não deve nem mostrar a lista.
    return res.json({ escolha_disponivel: false, profissionais: [] });
  }

  const profissionais = await profissionaisPara({
    tenantId: String(req.tenantId),
    tipo,
    latitude: numero(req.query.latitude),
    longitude: numero(req.query.longitude)
  });

  return res.json({ escolha_disponivel: true, profissionais });
}
