import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { redigirSegredo } from '../utils/redigir-segredo';

/**
 * Middleware global de tratamento de erros
 * Captura todos os erros da aplicação e retorna respostas padronizadas
 */

class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  details?: unknown;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

// `BadRequestError` era importado por três controllers (parceiros, indicações e
// comissões) e NUNCA existiu neste módulo: o import trazia `undefined`, e todo
// caminho de validação daqueles arquivos estourava
// "BadRequestError is not a constructor" — ou seja, um dado inválido do
// formulário virava 500 em vez do 400 com a mensagem que o código escreveu.
// É o mesmo 400 do `ValidationError`, com o nome que aqueles controllers usam.
class BadRequestError extends AppError {
  constructor(message = 'Requisição inválida') {
    super(message, 400);
  }
}

/** Qualquer erro que chega ao handler: os da casa, os do multer, os soltos. */
type ErroDaRequisicao = Error & {
  statusCode?: number;
  status?: number;
  isOperational?: boolean;
  code?: string;
  details?: unknown;
};

// Middleware de erro global
const errorHandler = (err: ErroDaRequisicao, req: Request, res: Response, next: NextFunction): void => {
  // A mensagem e a pilha saem do jeito que a biblioteca escreveu, e nem toda
  // biblioteca mascara segredo: string de conexão com senha, cabeçalho de
  // autorização e chave de API já apareceram em log e, de lá, em relatório
  // colado em canal interno. `redigirSegredo` apaga só o VALOR e preserva
  // host, usuário e o resto da mensagem, que é o que serve para depurar.
  console.error('🔴 [ERROR]', {
    message: redigirSegredo(err.message),
    stack: process.env.NODE_ENV === 'development' ? redigirSegredo(err.stack) : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  if (res.headersSent) {
    next(err);
    return;
  }

  // Erro do multer (arquivo acima do limite, campo inesperado) é erro do cliente.
  // Sem este ramo o upload de um anexo grande demais respondia 500.
  if (err.name === 'MulterError') {
    const mensagem = err.code === 'LIMIT_FILE_SIZE'
      ? 'Arquivo acima do limite permitido'
      : `Falha no envio do arquivo: ${err.message}`;
    res.status(400).json({ message: mensagem, error: mensagem, status: 400 });
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.isOperational ? err.message : (err.message || 'Erro interno do servidor');

  const errorResponse: Record<string, unknown> = {
    message,
    error: message,
    status: statusCode
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
};

// Middleware para rotas não encontradas (404)
const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Rota ${req.method} ${req.path} não encontrada`);
  next(error);
};

/** Handler assíncrono: promessa rejeitada vira `next(err)` em vez de request pendurada. */
type HandlerAssincrono = (req: Request, res: Response, next: NextFunction) => unknown;

const asyncHandler = (fn: HandlerAssincrono): RequestHandler => {
  return (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
