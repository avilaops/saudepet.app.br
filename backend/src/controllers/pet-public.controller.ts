import type { PetTagScan } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import prisma from '../config/database';
import { NotFoundError, asyncHandler } from '../middleware/error.middleware';
import { enviarParaUsuario } from '../services/push.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O recorte do pet que o aviso ao tutor precisa. */
type PetDaLeitura = { id: string; nome: string; tenant_id: string; tutor_id: string };

/** Socket.IO registrado em `global.io` pelo server (caminho legado). */
const socketGlobal = (): SocketServer | undefined => (globalThis as { io?: SocketServer }).io;

class PetPublicController {
  // Obter Perfil Público do Pet escaneado via QR Code
  getPublicTag = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // QR amassado, lido torto ou digitado à mão chega aqui como qualquer
    // coisa. Sem esta guarda, o Postgres recusa o valor e quem escaneou a
    // coleira de um animal perdido recebe erro 500 em vez de "não
    // encontrada" — e a rota pública ainda registra um erro no log a cada
    // leitura inválida.
    if (!UUID.test(id)) {
      throw new NotFoundError('Identificação do pet não encontrada.');
    }

    const pet = await prisma.pet.findUnique({
      where: { id },
      include: {
        tutor: {
          select: {
            nome: true,
            telefone: true,
            cidade: true
          }
        },
        // `ativo: false` é registro removido da ficha por um veterinário — ele
        // continua no banco para a auditoria, mas quem escaneia a tag não pode
        // continuar lendo uma vacina que foi lançada no pet errado.
        vacinas: {
          where: { ativo: true },
          orderBy: { data_aplicacao: 'desc' },
          take: 5
        },
        alergias: { where: { ativo: true } }
      }
    });

    if (!pet) {
      throw new NotFoundError('Identificação do pet não encontrada.');
    }

    // Esta resposta é pública: qualquer pessoa que escaneie a coleira a
    // recebe, sem login. Por isso publica só o que serve para (a) devolver o
    // animal e (b) socorrê-lo — e nada além disso.
    //
    // Ficam de fora, de propósito:
    //   • `microchip` — é o identificador que prova posse; exibi-lo a quem
    //     achou o animal facilita reivindicação fraudulenta, e quem precisa
    //     dele de verdade (clínica) lê o chip no próprio bicho.
    //   • `observacoes` — texto livre do tutor, pode conter qualquer coisa.
    //   • sobrenome do tutor — o primeiro nome basta para iniciar o contato.
    const primeiroNome = (pet.tutor?.nome || '').trim().split(/\s+/)[0] || null;

    return res.json({
      success: true,
      pet: {
        id: pet.id,
        nome: pet.nome,
        especie: pet.especie || pet.tipo,
        raca: pet.raca,
        sexo: pet.sexo,
        porte: pet.porte,
        foto: pet.foto,
        castrado: pet.castrado,
        alergias: pet.alergias,
        vacinas: pet.vacinas,
        tutor: {
          nome: primeiroNome,
          telefone: pet.tutor?.telefone,
          cidade: pet.tutor?.cidade
        }
      }
    });
  });

  /**
   * Registrar a leitura da coleira e avisar o tutor
   * POST /api/v1/public/pet-tag/:id/scan
   *
   * O botão "Achei este Pet! Alertar Tutor" era apenas um deeplink de WhatsApp:
   * o sistema NUNCA ficava sabendo que a coleira tinha sido lida. Quem achasse
   * o animal e não quisesse mandar mensagem sumia do mapa, e o tutor não tinha
   * nenhum sinal de que o pet havia sido visto — que é justamente a informação
   * que ele mais quer nesse momento.
   */
  registrarLeitura = asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Rota pública, sem `validate(...)`: o corpo é o que o navegador mandou.
    const { latitude, longitude, mensagem, contato, deliberado } =
      (req.body || {}) as Record<string, unknown>;

    if (!UUID.test(id)) {
      throw new NotFoundError('Identificação do pet não encontrada.');
    }

    const pet = await prisma.pet.findUnique({
      where: { id },
      select: { id: true, nome: true, tenant_id: true, tutor_id: true }
    });

    if (!pet) {
      throw new NotFoundError('Identificação do pet não encontrada.');
    }

    // `Number(null)` é 0, e 0/0 é um ponto no golfo da Guiné. Uma leitura com
    // só uma das coordenadas viraria "seu pet foi visto na África" — por isso o
    // par só entra se as DUAS vierem como número de verdade.
    const numeroOuNulo = (valor: unknown): number | null => {
      if (valor === null || valor === undefined || valor === '') return null;
      const numero = Number(valor);
      return Number.isFinite(numero) ? numero : null;
    };
    const lat = numeroOuNulo(latitude);
    const lng = numeroOuNulo(longitude);
    const temPar = lat !== null && lng !== null;

    const leitura = await prisma.petTagScan.create({
      data: {
        tenant_id: pet.tenant_id,
        pet_id: pet.id,
        latitude: temPar ? lat : null,
        longitude: temPar ? lng : null,
        // Texto de estranho na internet: limitado e guardado como veio, sem
        // interpretar. O tutor lê e decide.
        mensagem: mensagem ? String(mensagem).trim().slice(0, 500) : null,
        contato: contato ? String(contato).trim().slice(0, 120) : null,
        ip: req.ip || null,
        user_agent: req.headers['user-agent'] || null,
        deliberado: Boolean(deliberado)
      }
    });

    void this.avisarTutorDaLeitura({ pet, leitura });

    return res.status(201).json({ success: true, registrada_em: leitura.criado_em });
  });

  /**
   * Aviso ao tutor, com antirrepetição.
   *
   * A página registra a abertura sozinha; sem um intervalo mínimo, um tutor
   * cujo QR fosse compartilhado receberia uma enxurrada de alertas e passaria a
   * ignorar todos — inclusive o que importava. Toque deliberado em "Achei este
   * pet" fura o silêncio: ali tem gente com o animal na mão.
   */
  async avisarTutorDaLeitura({ pet, leitura }: { pet: PetDaLeitura; leitura: PetTagScan }): Promise<void> {
    const SILENCIO_MINUTOS = 60;

    try {
      if (!leitura.deliberado) {
        const recente = await prisma.petTagScan.findFirst({
          where: {
            pet_id: pet.id,
            id: { not: leitura.id },
            criado_em: { gte: new Date(Date.now() - SILENCIO_MINUTOS * 60 * 1000) }
          },
          select: { id: true }
        });
        if (recente) return;
      }

      const ondeMapa = leitura.latitude != null && leitura.longitude != null
        ? `https://www.google.com/maps?q=${leitura.latitude},${leitura.longitude}`
        : null;

      await enviarParaUsuario(pet.tutor_id, {
        title: leitura.deliberado
          ? `Alguém está com ${pet.nome}!`
          : `A coleira de ${pet.nome} foi lida`,
        body: leitura.mensagem
          || (leitura.deliberado
            ? 'A pessoa que encontrou seu pet acionou o alerta. Abra para ver os detalhes.'
            : 'Alguém abriu a identificação do seu pet agora há pouco.'),
        url: `/tutor/pets`,
        tag: `pet-tag-${pet.id}`
      });

      const io = socketGlobal();
      if (io) {
        io.to(`user:${pet.tutor_id}`).emit('pet:tag_lida', {
          petId: pet.id,
          petNome: pet.nome,
          deliberado: leitura.deliberado,
          mensagem: leitura.mensagem,
          contato: leitura.contato,
          mapa: ondeMapa,
          criado_em: leitura.criado_em
        });
      }
    } catch (erro) {
      // Avisar é best-effort: registrar a leitura é o que não pode falhar.
      const mensagemDoErro = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  [PET TAG] Aviso ao tutor falhou (ignorado):', mensagemDoErro);
    }
  }

  /**
   * Leituras da coleira de um pet, para o tutor
   * GET /api/v1/pets/:id/leituras-da-tag
   */
  listarLeituras = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const pet = await prisma.pet.findFirst({
      where: { id, tutor_id: req.userId, tenant_id: req.tenantId as string },
      select: { id: true, nome: true }
    });

    if (!pet) {
      throw new NotFoundError('Pet não encontrado');
    }

    const leituras = await prisma.petTagScan.findMany({
      where: { pet_id: pet.id },
      orderBy: { criado_em: 'desc' },
      take: 50,
      select: {
        id: true, latitude: true, longitude: true, mensagem: true,
        contato: true, deliberado: true, criado_em: true
      }
    });

    return res.json({ pet, leituras });
  });
}

const controller = new PetPublicController();

module.exports = controller;
export default controller;
