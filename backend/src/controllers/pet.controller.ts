import crypto from 'crypto';
import type { z } from 'zod';
import prisma from '../config/database';
import {
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/error.middleware';
import { uploadBuffer, deleteObject, keyFromUrl } from '../config/r2';
import type { createPetSchema, updatePetSchema } from '../schemas/pet.schema';

// O corpo já passou pelo `validate(...)` da rota: é o que o Zod devolveu.
type CriarPetBody = z.infer<typeof createPetSchema>;
type AtualizarPetBody = z.infer<typeof updatePetSchema>;

class PetController {
  // Criar pet (dados já validados pelo Zod)
  create = asyncHandler(async (req, res) => {
    console.log('🔵 [PET] Criando novo pet');
    // O cadastro gravava cinco campos e o banco tem quinze: sexo, porte,
    // castração, data de nascimento e microchip eram digitados (ou nem isso) e
    // descartados em silêncio. O porte chegava vazio até na tag da coleira, que
    // é o que ajuda a devolver um animal perdido.
    const {
      nome, tipo, raca, idade, peso, foto,
      especie, sexo, data_nascimento, porte, cor, pedigree,
      castrado, microchip, condicoes_preexistentes, observacoes
    } = req.body as CriarPetBody;
    const tutorId = req.userId as string;

    const pet = await prisma.pet.create({
      data: {
        tenant_id: req.tenantId as string,
        tutor_id: tutorId,
        nome,
        tipo,
        // Sem espécie informada, o tipo serve: em cão e gato os dois são a
        // mesma palavra, e é o que o veterinário lê na ficha.
        especie: especie || tipo || null,
        raca: raca || null,
        idade: idade ?? null,
        peso: peso ?? null,
        foto: foto || null,
        sexo: sexo || null,
        data_nascimento: data_nascimento || null,
        porte: porte || null,
        cor: cor || null,
        pedigree: pedigree || null,
        castrado: castrado ?? false,
        microchip: microchip || null,
        condicoes_preexistentes: condicoes_preexistentes || null,
        observacoes: observacoes || null
      }
    });
    console.log('✅ [PET] Pet criado:', pet.id);

    return res.status(201).json({ pet });
  });

  // Listar pets do tutor logado
  list = asyncHandler(async (req, res) => {
    const tutorId = req.userId;

    const pets = await prisma.pet.findMany({
      where: { tenant_id: req.tenantId as string, tutor_id: tutorId },
      orderBy: { criado_em: 'desc' }
    });

    return res.json({ pets });
  });

  // Obter pet por ID
  getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tutorId = req.userId;

    const pet = await prisma.pet.findFirst({
      where: {
        id,
        tenant_id: req.tenantId as string,
        tutor_id: tutorId
      },
      include: {
        // Só o que vale hoje: registro corrigido aparece corrigido, registro
        // removido não aparece (ver ficha-clinica.controller).
        vacinas: { where: { ativo: true }, orderBy: { data_aplicacao: 'desc' } },
        medicamentos: { where: { ativo: true }, orderBy: { data_inicio: 'desc' } },
        alergias: { where: { ativo: true }, orderBy: { criado_em: 'desc' } }
      }
    });

    if (!pet) {
      throw new NotFoundError('Pet não encontrado');
    }

    return res.json({ pet });
  });

  // Atualizar pet (dados já validados pelo Zod)
  update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tutorId = req.userId;
    const {
      nome, tipo, raca, idade, peso, foto,
      especie, sexo, data_nascimento, porte, cor, pedigree,
      castrado, microchip, condicoes_preexistentes, observacoes
    } = req.body as AtualizarPetBody;

    // Verificar se o pet pertence ao tutor
    const petExiste = await prisma.pet.findFirst({
      where: {
        id,
        tenant_id: req.tenantId as string,
        tutor_id: tutorId
      }
    });

    if (!petExiste) {
      throw new NotFoundError('Pet não encontrado');
    }

    const pet = await prisma.pet.update({
      where: { id },
      // `!== undefined` e não truthy: limpar um campo (mandar `null`) é uma
      // edição legítima, e com truthy o tutor não conseguiria apagar o que
      // digitou errado.
      data: {
        ...(nome ? { nome } : {}),
        ...(tipo ? { tipo } : {}),
        ...(especie !== undefined && { especie }),
        ...(raca !== undefined && { raca }),
        ...(idade !== undefined && { idade }),
        ...(peso !== undefined && { peso }),
        ...(foto !== undefined && { foto }),
        ...(sexo !== undefined && { sexo }),
        ...(data_nascimento !== undefined && { data_nascimento }),
        ...(porte !== undefined && { porte }),
        ...(cor !== undefined && { cor }),
        ...(pedigree !== undefined && { pedigree }),
        ...(castrado !== undefined && { castrado }),
        ...(microchip !== undefined && { microchip }),
        ...(condicoes_preexistentes !== undefined && { condicoes_preexistentes }),
        ...(observacoes !== undefined && { observacoes })
      }
    });

    return res.json({ pet });
  });

  // Upload de foto do pet (multipart/form-data, campo "foto")
  uploadFoto = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tutorId = req.userId;

    if (!req.file) {
      throw new ValidationError('Nenhum arquivo enviado');
    }

    const petExiste = await prisma.pet.findFirst({
      where: { id, tenant_id: req.tenantId as string, tutor_id: tutorId }
    });

    if (!petExiste) {
      throw new NotFoundError('Pet não encontrado');
    }

    const ext = req.file.originalname.split('.').pop();
    const key = `pets/${id}/foto-${crypto.randomUUID()}.${ext}`;
    const url = await uploadBuffer(req.file.buffer, key, req.file.mimetype);

    const pet = await prisma.pet.update({
      where: { id },
      data: { foto: url }
    });

    const oldKey = petExiste.foto ? keyFromUrl(petExiste.foto) : null;
    if (oldKey) {
      await deleteObject(oldKey).catch(() => {});
    }

    return res.json({ pet });
  });

  // Deletar pet
  delete = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tutorId = req.userId;

    const petExiste = await prisma.pet.findFirst({
      where: {
        id,
        tenant_id: req.tenantId as string,
        tutor_id: tutorId
      }
    });

    if (!petExiste) {
      throw new NotFoundError('Pet não encontrado');
    }

    await prisma.pet.delete({
      where: { id }
    });

    return res.json({ message: 'Pet removido com sucesso' });
  });
}

const controller = new PetController();

module.exports = controller;
export default controller;
