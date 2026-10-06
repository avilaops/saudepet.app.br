import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';

type FiltroDeArquivo = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => void;

// Armazena o arquivo em memória (buffer) para envio direto ao Cloudflare R2,
// sem gravar no disco do container
const storage = multer.memoryStorage();

// Filtro para aceitar apenas imagens
const fileFilter: FiltroDeArquivo = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens são permitidas'));
  }
};

// Configuração do multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: fileFilter
});

// Filtro para documentos (imagem ou PDF) - carteira do CRMV, diploma, etc.
const documentoFileFilter: FiltroDeArquivo = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens ou PDF são permitidos'));
  }
};

const uploadDocumento = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB (documentos escaneados costumam ser maiores)
  },
  fileFilter: documentoFileFilter
});

// ─────────────────────────────────────────────────────────────────────────────
// Anexo do chat: imagem, documento ou vídeo curto.
//
// Vídeo entrou porque o caso de uso clínico real é o tutor gravar no celular um
// clipe curto do sintoma (convulsão, claudicação, dificuldade respiratória) —
// coisa que uma foto não mostra. As decisões em volta dele:
//
// • **25 MB.** Cabe um clipe curto de celular; acima disso o envio pelo 4G do
//   tutor já não termina de forma confiável e o custo no R2 deixa de valer.
// • **Sem transcodificação e sem thumbnail no servidor.** Exigiria ffmpeg na
//   imagem e CPU num servidor de 4 GB já apertado; o arquivo é guardado como
//   veio e a tela usa o player nativo do navegador.
// • **Só os três formatos que celular grava** (MP4, WebM, QuickTime/MOV).
//   Qualquer outro vídeo continua recusado, com mensagem dizendo quais valem.
// • **Retenção é a mesma dos demais anexos** — a linha cai em `mensagens_anexos`
//   e o `anexo-retencao.worker.js` (`ANEXO_RETENCAO_DIAS`, 90 dias) varre o
//   binário sem olhar o `tipo`. Vídeo não tem exceção nenhuma.
// ─────────────────────────────────────────────────────────────────────────────
const TIPOS_ANEXO_IMAGEM_DOC = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf'
];

// O que um celular efetivamente produz ao gravar: Android entrega MP4/WebM,
// iPhone entrega QuickTime (.mov). Formatos de edição (AVI, MKV, MPEG) ficam de
// fora de propósito — não aparecem no fluxo do tutor e só ampliariam a superfície.
const TIPOS_ANEXO_VIDEO = [
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

const TIPOS_ANEXO_CHAT = [...TIPOS_ANEXO_IMAGEM_DOC, ...TIPOS_ANEXO_VIDEO];

// Imagem e PDF mantêm o teto de sempre; só vídeo ganha o teto maior.
const LIMITE_ANEXO_CHAT = 10 * 1024 * 1024; // 10MB
const LIMITE_ANEXO_VIDEO_CHAT = 25 * 1024 * 1024; // 25MB

const limiteDoAnexoChat = (mimetype: string): number =>
  TIPOS_ANEXO_VIDEO.includes(mimetype) ? LIMITE_ANEXO_VIDEO_CHAT : LIMITE_ANEXO_CHAT;

const emMegabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024));

// Arquivo recusado é erro de quem enviou, não do servidor. Sem `statusCode` o
// handler global devolveria 500 para um PDF grande demais.
const erroDeUpload = (mensagem: string): Error =>
  Object.assign(new Error(mensagem), { statusCode: 400, isOperational: true });

const anexoChatFileFilter: FiltroDeArquivo = (_req, file, cb) => {
  if (TIPOS_ANEXO_CHAT.includes(file.mimetype)) {
    cb(null, true);
  } else if (file.mimetype.startsWith('video/')) {
    cb(erroDeUpload('Formato de vídeo não aceito. Envie MP4, WebM ou MOV — que é o que o celular grava.'));
  } else {
    cb(erroDeUpload('Anexo deve ser imagem (JPEG, PNG, WEBP, HEIC), PDF ou vídeo (MP4, WebM, MOV)'));
  }
};

const anexoChatMulter = multer({
  storage: storage,
  // O multer só sabe aplicar um teto por instância, e o tipo do arquivo só é
  // conhecido depois de ler o cabeçalho da parte. Então o teto aqui é o maior
  // (vídeo) e o limite por tipo é conferido logo em seguida, com o tamanho real.
  limits: {
    fileSize: LIMITE_ANEXO_VIDEO_CHAT,
    files: 1
  },
  fileFilter: anexoChatFileFilter
});

// Segundo passo: imagem/PDF continuam presos a 10MB mesmo com o multer deixando
// passar até 25MB. Sem isto, abrir o teto para vídeo abriria para todo mundo.
const conferirLimitePorTipoDeAnexo = (req: Request, _res: Response, next: NextFunction): void => {
  const arquivo = req.file;
  if (!arquivo) {
    next();
    return;
  }

  const limite = limiteDoAnexoChat(arquivo.mimetype);
  if (arquivo.size > limite) {
    const alvo = TIPOS_ANEXO_VIDEO.includes(arquivo.mimetype) ? 'Vídeo' : 'Arquivo';
    next(erroDeUpload(`${alvo} acima do limite de ${emMegabytes(limite)}MB. Grave um trecho mais curto e tente de novo.`));
    return;
  }

  next();
};

// Traduz o estouro do teto do multer (25MB) para uma mensagem que diz o número,
// em vez do "File too large" genérico da biblioteca.
const traduzirEstouroDeAnexo = (middlewareDoMulter: RequestHandler): RequestHandler => (req, res, next) =>
  middlewareDoMulter(req, res, (erro?: unknown) => {
    const e = erro as (Error & { code?: string }) | undefined;
    if (e && e.name === 'MulterError' && e.code === 'LIMIT_FILE_SIZE') {
      next(erroDeUpload(`Anexo acima do limite: até ${emMegabytes(LIMITE_ANEXO_CHAT)}MB para imagem e PDF, até ${emMegabytes(LIMITE_ANEXO_VIDEO_CHAT)}MB para vídeo.`));
      return;
    }
    next(erro);
  });

// Mantém a forma de um uploader do multer (`.single(campo)`) para as rotas e os
// testes, mas devolve a dupla "recebe o arquivo" + "confere o limite do tipo".
const uploadAnexoChat = {
  single: (campo: string): RequestHandler[] => [
    traduzirEstouroDeAnexo(anexoChatMulter.single(campo)),
    conferirLimitePorTipoDeAnexo
  ]
};

// Mídia do atendimento: foto, vídeo curto ou áudio. O teto é o do vídeo (25 MB,
// o mesmo do chat); a conferência por tipo, mais estrita, acontece no serviço —
// recusar a foto da lesão porque o celular é bom seria o pior tipo de limite.
const uploadMidiaAtendimento = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const aceito = ['image/', 'video/', 'audio/'].some((prefixo) => file.mimetype.startsWith(prefixo));
    if (aceito) return cb(null, true);
    cb(new Error('Envie uma foto, um vídeo curto ou um áudio'));
  }
});

// Pedaço de gravação de chamada. Chega a cada 15 s enquanto a teleorientação
// acontece, e por isso o teto é apertado: 8 MB cobre com folga um trecho de
// áudio desse tamanho, e recusar acima disso é a primeira barreira contra
// alguém usar a rota como depósito de arquivo.
const uploadGravacaoChamada = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      return cb(null, true);
    }
    cb(new Error('Trecho de gravação inválido'));
  }
});

// Ditado do veterinário para o rascunho do prontuário (ver
// `transcricao.service.ts`). Um ditado de consulta dificilmente passa de
// 3-4 minutos; 15 MB cobre isso com folga sem virar depósito de áudio longo.
const uploadDitadoProntuario = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) return cb(null, true);
    cb(erroDeUpload('Envie um áudio para transcrever'));
  }
});

// O módulo É o uploader de imagem (`require('../middleware/upload.middleware').single('foto')`)
// e carrega os demais como propriedades — a forma que 20 rotas já consomem.
const exportado = Object.assign(upload, {
  uploadGravacaoChamada,
  uploadMidiaAtendimento,
  uploadDocumento,
  uploadAnexoChat,
  uploadDitadoProntuario,
  TIPOS_ANEXO_CHAT,
  TIPOS_ANEXO_VIDEO,
  LIMITE_ANEXO_CHAT,
  LIMITE_ANEXO_VIDEO_CHAT
});

export = exportado;
