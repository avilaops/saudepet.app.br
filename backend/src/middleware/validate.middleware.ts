import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware de validação centralizado usando Zod
 *
 * Valida o corpo da requisição, parâmetros ou query strings
 * contra um schema Zod fornecido
 */

type Fonte = 'body' | 'params' | 'query';

/** Só o que o middleware usa de um schema Zod: `parse`. Vale para Zod 3 e 4. */
interface SchemaValidavel {
  parse(dados: unknown): unknown;
}

interface ErroDeValidacao extends Error {
  issues?: Array<{ path: Array<string | number>; message: string }>;
  errors?: Array<{ path: Array<string | number>; message: string }>;
}

const validate = (schema: SchemaValidavel, source: Fonte = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Determina a fonte dos dados a validar
      const dataToValidate = source === 'body' ? req.body
        : source === 'params' ? req.params
        : source === 'query' ? req.query
        : req.body;

      // Valida os dados contra o schema
      const validated = schema.parse(dataToValidate);

      // Substitui os dados originais pelos dados validados e sanitizados
      if (source === 'body') {
        req.body = validated;
      } else if (source === 'params') {
        req.params = validated as Request['params'];
      } else if (source === 'query') {
        req.query = validated as Request['query'];
      }

      next();
    } catch (error) {
      // Zod 4 renomeou `error.errors` para `error.issues`. Enquanto a checagem
      // olhava só o nome antigo, toda falha de validação caía no bloco genérico
      // abaixo e o app recebia `{ error, message }` em vez de `{ error, details }` —
      // por isso os formulários mostravam "Erro ao validar dados" no lugar da
      // mensagem do campo que o usuário precisava corrigir.
      const erro = error as ErroDeValidacao;
      const issues = erro.issues || erro.errors;

      // Se for erro de validação do Zod
      if (issues) {
        const errorMessages = issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }));

        res.status(400).json({
          error: 'Erro de validação',
          details: errorMessages
        });
        return;
      }

      // Outros erros
      res.status(400).json({
        error: 'Erro ao validar dados',
        message: erro.message
      });
    }
  };
};

export = validate;
