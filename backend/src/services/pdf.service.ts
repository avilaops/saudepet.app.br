import { uploadBuffer } from '../config/r2';

// `pdfkit` não traz tipos e `@types/pdfkit` não está instalado; o contrato
// abaixo descreve só a fatia da API que os dois documentos da casa usam.
interface DocumentoPdf {
  y: number;
  on(evento: 'data', ouvinte: (chunk: Buffer) => void): this;
  on(evento: 'end', ouvinte: () => void): this;
  fillColor(cor: string): this;
  strokeColor(cor: string): this;
  fontSize(tamanho: number): this;
  font(nome: string): this;
  lineWidth(largura: number): this;
  moveTo(x: number, y: number): this;
  lineTo(x: number, y: number): this;
  stroke(): this;
  roundedRect(x: number, y: number, largura: number, altura: number, raio: number): this;
  fillAndStroke(preenchimento: string, contorno: string): this;
  text(texto: string, x?: number, y?: number, opcoes?: { align?: string; width?: number }): this;
  heightOfString(texto: string, opcoes?: { width?: number }): number;
  addPage(): this;
  end(): void;
}

const PDFDocument = require('pdfkit') as new (opcoes: { size: string; margin: number }) => DocumentoPdf;

/** Valor que vai impresso: o documento aceita o que o banco e o controller mandam. */
type Texto = string | number | null | undefined;

export interface MedicamentoDaReceita {
  nome?: Texto;
  medicamento?: Texto;
  posologia?: Texto;
  instrucoes?: Texto;
}

export interface DadosDoPaciente {
  protocolo?: Texto;
  nomeTutor?: Texto;
  cpfTutor?: Texto;
  nomePet?: Texto;
  especiePet?: Texto;
  racaPet?: Texto;
  pesoPet?: Texto;
  nomeVet?: Texto;
  crmvVet?: Texto;
  ufCrmv?: Texto;
  dataAtendimento?: Texto;
}

export interface DadosDaReceita extends DadosDoPaciente {
  medicamentos?: MedicamentoDaReceita[];
  orientacoes?: string | null;
  versao?: number | string | null;
  motivoRetificacao?: string | null;
}

export interface ExameDoProntuario {
  nome_exame?: Texto;
  nome?: Texto;
  justificativa?: Texto;
}

export interface AlergiaDoProntuario {
  alergia?: Texto;
  nome?: Texto;
  gravidade?: Texto;
  observacoes?: Texto;
}

export interface VacinaDoProntuario {
  nome_vacina?: Texto;
  laboratorio?: Texto;
  lote?: Texto;
  data_aplicacao?: Texto;
  proxima_dose?: Texto;
}

export interface FotoDoProntuario {
  autor_papel?: Texto;
  tipo?: Texto;
  legenda?: Texto;
}

export interface DadosDoProntuario extends DadosDoPaciente {
  idadePet?: Texto;
  temperatura?: Texto;
  frequenciaCardiaca?: Texto;
  frequenciaRespiratoria?: Texto;
  anamnese?: Texto;
  exameFisico?: Texto;
  hipotesesDiagnosticas?: Texto;
  conduta?: Texto;
  exames?: ExameDoProntuario[];
  alergias?: AlergiaDoProntuario[];
  vacinas?: VacinaDoProntuario[];
  fotos?: FotoDoProntuario[];
  retornoSugerido?: Texto;
}

export interface DocumentoGerado {
  cdnUrl: string;
  key: string;
}

class PdfService {
  /**
   * PDF-01: Receita Médica Veterinária Eletrônica
   */
  async gerarReceitaPdf({
    protocolo,
    nomeTutor,
    cpfTutor,
    nomePet,
    especiePet,
    racaPet,
    pesoPet,
    nomeVet,
    crmvVet,
    ufCrmv,
    medicamentos = [],
    orientacoes = '',
    dataAtendimento,
    // Retificação: receita corrigida depois de emitida. O documento novo
    // precisa dizer que substitui o anterior — trocar o arquivo em silêncio
    // deixaria duas receitas válidas circulando com conteúdos diferentes.
    versao = 1,
    motivoRetificacao = null
  }: DadosDaReceita): Promise<DocumentoGerado> {
    return new Promise<DocumentoGerado>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', async () => {
          try {
            const pdfBuffer = Buffer.concat(chunks);
            const key = `receitas/receita_${protocolo || Date.now()}.pdf`;
            const cdnUrl = await uploadBuffer(pdfBuffer, key, 'application/pdf');
            console.log('✅ Receita PDF enviada para Cloudflare R2:', cdnUrl);
            resolve({ cdnUrl, key });
          } catch (uploadError) {
            reject(uploadError);
          }
        });

        // 🎨 CABEÇALHO DA MARCA
        doc.fillColor('#0d9488')
           .fontSize(22)
           .font('Helvetica-Bold')
           .text('SAÚDE PET', 40, 40);

        doc.fillColor('#64748b')
           .fontSize(10)
           .font('Helvetica')
           .text('Cuidado veterinário domiciliar • Atendimento credenciado CFMV', 40, 66);

        doc.strokeColor('#e2e8f0')
           .lineWidth(1)
           .moveTo(40, 85)
           .lineTo(555, 85)
           .stroke();

        // 🏷️ TÍTULO DO DOCUMENTO
        const ehRetificacao = Number(versao) > 1;

        doc.fillColor('#0f172a')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text(ehRetificacao ? 'RECEITA MÉDICA VETERINÁRIA (RETIFICADA)' : 'RECEITA MÉDICA VETERINÁRIA', 40, 105, { align: 'center' });

        doc.fillColor('#94a3b8')
           .fontSize(9)
           .font('Helvetica')
           .text(`Protocolo de Atendimento: #${protocolo || '123456'}${ehRetificacao ? ` • versão ${versao}` : ''}`, 40, 126, { align: 'center' });

        // ⚠️ TARJA DE RETIFICAÇÃO — o tutor precisa saber que a via anterior
        // não vale mais, e por quê.
        if (ehRetificacao) {
          doc.roundedRect(40, 140, 515, 34, 6).fillAndStroke('#fff7ed', '#fdba74');
          doc.fillColor('#9a3412').fontSize(9).font('Helvetica-Bold')
             .text(`Esta receita substitui a versão ${Number(versao) - 1} deste mesmo atendimento.`, 52, 148, { width: 491 });
          doc.fillColor('#9a3412').fontSize(8).font('Helvetica')
             .text(`Motivo da retificação: ${motivoRetificacao || 'não informado'}`, 52, 161, { width: 491 });
          doc.y = 182;
        }

        // 🐶 CARD DADOS DO TUTOR E PET
        const topoPaciente = ehRetificacao ? 184 : 145;
        doc.roundedRect(40, topoPaciente, 515, 80, 8)
           .fillAndStroke('#f8fafc', '#cbd5e1');

        doc.fillColor('#0f766e').fontSize(11).font('Helvetica-Bold').text('PACIENTE & TUTOR', 55, topoPaciente + 12);

        doc.fillColor('#334155').fontSize(10).font('Helvetica')
           .text(`Pet: ${nomePet || 'Pet'} (${especiePet || 'Canina'} / ${racaPet || 'SRD'} • ${pesoPet || 'N/I'} kg)`, 55, topoPaciente + 30)
           .text(`Tutor(a): ${nomeTutor || 'Tutor'} ${cpfTutor ? `(CPF: ${cpfTutor})` : ''}`, 55, topoPaciente + 47)
           .text(`Data da Emissão: ${dataAtendimento || new Date().toLocaleDateString('pt-BR')}`, 55, topoPaciente + 64);

        // 💊 LISTA DE MEDICAMENTOS (POSOLOGIA)
        let currentY = topoPaciente + 100;
        doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text('MEDICAÇÃO E POSOLOGIA', 40, currentY);
        currentY += 25;

        if (medicamentos && medicamentos.length > 0) {
          medicamentos.forEach((item, index) => {
            doc.fillColor('#0d9488').fontSize(11).font('Helvetica-Bold')
               .text(`${index + 1}. ${item.nome || item.medicamento}`, 45, currentY);

            currentY += 16;
            doc.fillColor('#334155').fontSize(10).font('Helvetica')
               .text(`   Dosagem & Instruções: ${item.posologia || item.instrucoes || 'Uso conforme indicação.'}`, 45, currentY);

            currentY += 22;
          });
        } else {
          doc.fillColor('#64748b').fontSize(10).font('Helvetica-Oblique')
             .text('Nenhum medicamento de uso oral/tópico prescrito.', 45, currentY);
          currentY += 25;
        }

        // 📋 ORIENTAÇÕES ADICIONAIS
        if (orientacoes) {
          currentY += 10;
          doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('ORIENTAÇÕES AO TUTOR:', 40, currentY);
          currentY += 18;
          doc.fillColor('#475569').fontSize(10).font('Helvetica').text(orientacoes, 40, currentY, { width: 515 });
        }

        // ✍️ ASSINATURA E CRMV DO VETERINÁRIO (RODAPÉ)
        const footerY = 730;
        doc.strokeColor('#94a3b8')
           .lineWidth(1)
           .moveTo(180, footerY)
           .lineTo(415, footerY)
           .stroke();

        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
           .text(`Dra(o). ${nomeVet || 'Médico Veterinário'}`, 40, footerY + 8, { align: 'center' });

        doc.fillColor('#0f766e').fontSize(10).font('Helvetica')
           .text(`Médico(a) Veterinário(a) • CRMV ${crmvVet || '0000'}/${ufCrmv || 'SP'}`, 40, footerY + 24, { align: 'center' });

        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
           .text('Documento assinado digitalmente através da plataforma Saúde PET. Válido em todo o território nacional.', 40, footerY + 42, { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * PDF-02: Prontuário Clínico do Atendimento Domiciliar
   */
  async gerarProntuarioPdf({
    protocolo,
    nomeTutor,
    nomePet,
    especiePet,
    racaPet,
    idadePet,
    pesoPet,
    temperatura,
    frequenciaCardiaca,
    frequenciaRespiratoria,
    anamnese,
    exameFisico,
    hipotesesDiagnosticas,
    conduta,
    exames = [],
    alergias = [],
    vacinas = [],
    fotos = [],
    retornoSugerido,
    nomeVet,
    crmvVet,
    ufCrmv,
    dataAtendimento
  }: DadosDoProntuario): Promise<DocumentoGerado> {
    return new Promise<DocumentoGerado>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', async () => {
          try {
            const pdfBuffer = Buffer.concat(chunks);
            const key = `prontuarios/prontuario_${protocolo || Date.now()}.pdf`;
            const cdnUrl = await uploadBuffer(pdfBuffer, key, 'application/pdf');
            console.log('✅ Prontuário PDF enviado para Cloudflare R2:', cdnUrl);
            resolve({ cdnUrl, key });
          } catch (uploadError) {
            reject(uploadError);
          }
        });

        // Cabeçalho
        doc.fillColor('#0d9488').fontSize(20).font('Helvetica-Bold').text('SAÚDE PET — PRONTUÁRIO CLÍNICO', 40, 40);
        doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(40, 70).lineTo(555, 70).stroke();

        // Dados Clínicos
        doc.roundedRect(40, 85, 515, 75, 6).fillAndStroke('#f8fafc', '#cbd5e1');
        doc.fillColor('#0f766e').fontSize(11).font('Helvetica-Bold').text('IDENTIFICAÇÃO DO PACIENTE', 50, 95);
        doc.fillColor('#334155').fontSize(10).font('Helvetica')
           .text(`Pet: ${nomePet} (${especiePet} / ${racaPet}) | Idade: ${idadePet || 'N/I'} | Peso: ${pesoPet || 'N/I'} kg`, 50, 113)
           .text(`Tutor: ${nomeTutor} | Data: ${dataAtendimento || new Date().toLocaleDateString('pt-BR')}`, 50, 130);

        // O texto clínico tem tamanho imprevisível, então cada bloco mede a própria
        // altura antes de avançar. Com incrementos fixos, um diagnóstico mais longo
        // escrevia por cima da seção seguinte.
        let y = 175;
        const LARGURA = 515;
        const LIMITE_DA_PAGINA = 700;

        const quebrarPaginaSePreciso = (alturaNecessaria: number): void => {
          if (y + alturaNecessaria <= LIMITE_DA_PAGINA) return;
          doc.addPage();
          y = 50;
        };

        const secao = (titulo: string, corpo: Texto, { obrigatoria = false }: { obrigatoria?: boolean } = {}): void => {
          const texto = (corpo || '').toString().trim();
          if (!texto && !obrigatoria) return;

          const conteudo = texto || 'Não informado.';
          doc.fontSize(10).font('Helvetica');
          const alturaCorpo = doc.heightOfString(conteudo, { width: LARGURA });

          quebrarPaginaSePreciso(alturaCorpo + 32);

          doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(titulo, 40, y);
          y += 18;
          doc.fillColor('#475569').fontSize(10).font('Helvetica').text(conteudo, 40, y, { width: LARGURA });
          y += alturaCorpo + 18;
        };

        const vitaisInformados = [temperatura, frequenciaCardiaca, frequenciaRespiratoria].some(Boolean);
        if (vitaisInformados) {
          secao(
            'PARÂMETROS VITAIS',
            `• Temperatura: ${temperatura || 'N/A'} °C | Freq. Cardíaca: ${frequenciaCardiaca || 'N/A'} bpm | Freq. Respiratória: ${frequenciaRespiratoria || 'N/A'} mpm`
          );
        }

        // Antes da anamnese de propósito: quem lê o documento para medicar precisa
        // esbarrar na alergia antes de chegar à conduta.
        if (alergias && alergias.length > 0) {
          secao(
            'ALERGIAS CONHECIDAS',
            alergias.map((item) => {
              const nome = item.alergia || item.nome;
              const gravidade = item.gravidade ? ` (${item.gravidade})` : '';
              return `• ${nome}${gravidade}${item.observacoes ? ` — ${item.observacoes}` : ''}`;
            }).join('\n')
          );
        }

        secao('ANAMNESE & QUEIXA PRINCIPAL', anamnese, { obrigatoria: true });
        secao('EXAME FÍSICO', exameFisico);
        secao('AVALIAÇÃO & HIPÓTESES DIAGNÓSTICAS', hipotesesDiagnosticas, { obrigatoria: true });
        secao('CONDUTA TERAPÊUTICA & ORIENTAÇÕES', conduta, { obrigatoria: true });

        if (exames && exames.length > 0) {
          secao(
            'EXAMES SOLICITADOS',
            exames.map((exame, indice) => {
              const nome = exame.nome_exame || exame.nome;
              return `${indice + 1}. ${nome}${exame.justificativa ? ` — ${exame.justificativa}` : ''}`;
            }).join('\n')
          );
        }

        // Comprovante da aplicação: é com este documento que o tutor prova a
        // vacinação em viagem, hotel ou creche.
        if (vacinas && vacinas.length > 0) {
          secao(
            'VACINAS APLICADAS NESTE ATENDIMENTO',
            vacinas.map((vacina) => {
              const detalhes = [
                vacina.laboratorio ? `laboratório ${vacina.laboratorio}` : null,
                vacina.lote ? `lote ${vacina.lote}` : null,
                vacina.data_aplicacao ? `aplicada em ${vacina.data_aplicacao}` : null,
                vacina.proxima_dose ? `próxima dose em ${vacina.proxima_dose}` : null
              ].filter(Boolean).join(' | ');
              return `• ${vacina.nome_vacina}${detalhes ? ` — ${detalhes}` : ''}`;
            }).join('\n')
          );
        }

        // O documento REGISTRA a existência da foto; a imagem em si fica no
        // aplicativo. Embutir os binários engordaria o PDF e faria o fechamento
        // do atendimento depender de baixar tudo do armazenamento na hora —
        // exatamente o momento em que nada pode falhar.
        if (fotos && fotos.length > 0) {
          secao(
            'REGISTRO FOTOGRÁFICO',
            [
              `${fotos.length} ${fotos.length === 1 ? 'arquivo anexado' : 'arquivos anexados'} a este atendimento, disponíveis no aplicativo.`,
              ...fotos.map((foto, indice) => {
                // A origem importa na leitura: o arquivo do tutor é relato, o do
                // veterinário é registro clínico. Um laudo não pode confundir os dois.
                const origem = foto.autor_papel === 'veterinario' ? 'registro do profissional' : 'enviado pelo tutor';
                const tipo = foto.tipo && foto.tipo !== 'imagem' ? `${foto.tipo}, ` : '';
                return `${indice + 1}. ${foto.legenda || 'Sem legenda'} (${tipo}${origem})`;
              })
            ].join('\n')
          );
        }

        if (retornoSugerido) {
          secao('RETORNO SUGERIDO', `Reavaliação recomendada para ${retornoSugerido}.`);
        }

        // Rodapé Assinatura
        const footerY = 730;
        doc.strokeColor('#94a3b8').lineWidth(1).moveTo(180, footerY).lineTo(415, footerY).stroke();
        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(`Dra(o). ${nomeVet}`, 40, footerY + 8, { align: 'center' });
        doc.fillColor('#0f766e').fontSize(10).font('Helvetica').text(`CRMV ${crmvVet}/${ufCrmv}`, 40, footerY + 24, { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

const pdfService = new PdfService();

// A exportação continua sendo a INSTÂNCIA: controllers e serviços fazem
// `require('./pdf.service')` e chamam `.gerarReceitaPdf()` direto.
module.exports = pdfService;

export type { PdfService };
export default pdfService;
