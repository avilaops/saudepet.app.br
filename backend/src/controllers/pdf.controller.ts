import type { Request, Response } from 'express';
import pdfService from '../services/pdf.service';
import type { DadosDaReceita, DadosDoProntuario } from '../services/pdf.service';

// Mesmo valor que `error.message` lia antes: texto para Error, `undefined` para o resto.
const mensagemDe = (error: unknown): string | undefined => (error instanceof Error ? error.message : undefined);

class PdfController {
  async gerarReceita(req: Request, res: Response) {
    try {
      const dados: DadosDaReceita = req.body;
      const resultado = await pdfService.gerarReceitaPdf(dados);
      return res.status(201).json({
        success: true,
        message: 'Receita médica gerada e enviada para Cloudflare R2 com sucesso',
        pdfUrl: resultado.cdnUrl,
        key: resultado.key
      });
    } catch (error: unknown) {
      console.error('❌ Erro ao gerar PDF de receita:', error);
      return res.status(500).json({ success: false, message: 'Erro ao gerar PDF da receita', error: mensagemDe(error) });
    }
  }

  async gerarProntuario(req: Request, res: Response) {
    try {
      const dados: DadosDoProntuario = req.body;
      const resultado = await pdfService.gerarProntuarioPdf(dados);
      return res.status(201).json({
        success: true,
        message: 'Prontuário clínico gerado e enviado para Cloudflare R2 com sucesso',
        pdfUrl: resultado.cdnUrl,
        key: resultado.key
      });
    } catch (error: unknown) {
      console.error('❌ Erro ao gerar PDF de prontuário:', error);
      return res.status(500).json({ success: false, message: 'Erro ao gerar PDF do prontuário', error: mensagemDe(error) });
    }
  }
}

const pdfController = new PdfController();

// As rotas fazem `require('../controllers/pdf.controller')` e leem os métodos
// direto da instância — a forma exportada precisa continuar a mesma.
module.exports = pdfController;

export default pdfController;
