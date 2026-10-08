const express = require('express');
const request = require('supertest');
const upload = require('../../../src/middleware/upload.middleware');

// Guarda da migração Multer 1.x → 2.x: os três uploaders continuam aceitando
// multipart em memória, aplicando filtro de tipo e limite de tamanho.
function appCom(middleware, campo = 'arquivo') {
  const app = express();
  app.post('/upload', middleware.single(campo), (req, res) => {
    res.json({
      ok: true,
      nome: req.file?.originalname,
      bytes: req.file?.size,
      temBuffer: Buffer.isBuffer(req.file?.buffer)
    });
  });
  // Mesma tradução de erro usada nas rotas reais
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 400).json({ error: error.message });
  });
  return app;
}

describe('upload.middleware (Multer 2.x)', () => {
  it('aceita imagem e entrega o buffer em memória', async () => {
    const res = await request(appCom(upload, 'foto'))
      .post('/upload')
      .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]), { filename: 'perfil.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.temBuffer).toBe(true);
    expect(res.body.nome).toBe('perfil.jpg');
  });

  it('recusa arquivo que não é imagem no uploader de fotos', async () => {
    const res = await request(appCom(upload, 'foto'))
      .post('/upload')
      .attach('foto', Buffer.from('%PDF-1.4'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/imagens/i);
  });

  it('aceita PDF no uploader de documentos', async () => {
    const res = await request(appCom(upload.uploadDocumento, 'documento'))
      .post('/upload')
      .attach('documento', Buffer.from('%PDF-1.4'), { filename: 'crmv.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  /**
   * Vídeo curto no chat: 25MB, sem transcodificação e sem thumbnail no servidor,
   * só os três formatos que celular grava. Imagem e PDF seguem presos a 10MB — o
   * teto do multer subiu para 25MB e é a conferência por tipo que os segura.
   */
  describe('anexo de vídeo no chat', () => {
    it.each([
      ['video/mp4', 'sintoma.mp4'],
      ['video/webm', 'sintoma.webm'],
      ['video/quicktime', 'sintoma.mov']
    ])('aceita %s, que é o que o celular grava', async (contentType, filename) => {
      const res = await request(appCom(upload.uploadAnexoChat, 'anexo'))
        .post('/upload')
        .attach('anexo', Buffer.from('clipe-falso-de-teste'), { filename, contentType });

      expect(res.status).toBe(200);
      expect(res.body.temBuffer).toBe(true);
      expect(res.body.nome).toBe(filename);
    });

    it('recusa formato de vídeo fora da lista, dizendo quais valem', async () => {
      const res = await request(appCom(upload.uploadAnexoChat, 'anexo'))
        .post('/upload')
        .attach('anexo', Buffer.from('000'), { filename: 'sintoma.avi', contentType: 'video/x-msvideo' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/vídeo/i);
      expect(res.body.error).toMatch(/MP4/);
    });

    it('recusa vídeo acima de 25MB', async () => {
      const grande = Buffer.alloc(25 * 1024 * 1024 + 1024, 1);
      const res = await request(appCom(upload.uploadAnexoChat, 'anexo'))
        .post('/upload')
        .attach('anexo', grande, { filename: 'longo.mp4', contentType: 'video/mp4' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/25MB/);
    });

    it('vídeo logo abaixo de 25MB passa', async () => {
      const quaseNoTeto = Buffer.alloc(25 * 1024 * 1024 - 4096, 1);
      const res = await request(appCom(upload.uploadAnexoChat, 'anexo'))
        .post('/upload')
        .attach('anexo', quaseNoTeto, { filename: 'convulsao.mp4', contentType: 'video/mp4' });

      expect(res.status).toBe(200);
      expect(res.body.bytes).toBe(25 * 1024 * 1024 - 4096);
    });

    it('imagem continua presa aos 10MB de antes, mesmo com o teto do vídeo aberto', async () => {
      const grande = Buffer.alloc(10 * 1024 * 1024 + 1024, 1);
      const res = await request(appCom(upload.uploadAnexoChat, 'anexo'))
        .post('/upload')
        .attach('anexo', grande, { filename: 'raio-x.png', contentType: 'image/png' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/10MB/);
      expect(res.body.error).not.toMatch(/25MB\. Grave/);
    });

    it('PDF dentro dos 10MB continua passando', async () => {
      const res = await request(appCom(upload.uploadAnexoChat, 'anexo'))
        .post('/upload')
        .attach('anexo', Buffer.from('%PDF-1.4'), { filename: 'exame.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(200);
    });

    it('anexo que não é imagem, PDF nem vídeo continua recusado', async () => {
      const res = await request(appCom(upload.uploadAnexoChat, 'anexo'))
        .post('/upload')
        .attach('anexo', Buffer.from('MZ'), { filename: 'programa.exe', contentType: 'application/octet-stream' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/imagem/i);
    });
  });

  it('recusa arquivo acima do limite de 5MB no uploader de fotos', async () => {
    const grande = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await request(appCom(upload, 'foto'))
      .post('/upload')
      .attach('foto', grande, { filename: 'grande.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });
});

export {};
