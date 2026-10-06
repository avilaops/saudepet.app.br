import type { CategoriaCatalogoVeterinario, TipoAtendimento } from '@prisma/client';

export type DefinicaoCatalogoVeterinario = {
  codigo: string;
  nome: string;
  descricao: string;
  categoria: CategoriaCatalogoVeterinario;
  tipo_atendimento: TipoAtendimento | null;
  ordem: number;
};

export const DEFINICOES_CATALOGO_VETERINARIO: DefinicaoCatalogoVeterinario[] = [
  { codigo: 'consulta_domiciliar', nome: 'Consulta domiciliar', descricao: 'Consulta clínica realizada na casa do tutor.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: 'consulta_domiciliar', ordem: 10 },
  { codigo: 'vacinacao', nome: 'Aplicação de vacinas', descricao: 'Valor da aplicação; as vacinas são somadas separadamente.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: 'vacinacao', ordem: 20 },
  { codigo: 'avaliacao', nome: 'Check-up preventivo', descricao: 'Avaliação de saúde marcada com antecedência.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: 'avaliacao', ordem: 30 },
  { codigo: 'coleta_exames', nome: 'Coleta de exames', descricao: 'Coleta domiciliar; o laboratório pode ser cobrado à parte.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: null, ordem: 40 },
  { codigo: 'controle_parasitas', nome: 'Controle de parasitas', descricao: 'Avaliação e orientação antiparasitária.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: null, ordem: 50 },
  { codigo: 'orientacao_nutricional', nome: 'Orientação nutricional', descricao: 'Orientação alimentar individualizada.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: null, ordem: 60 },
  { codigo: 'emissao_receita', nome: 'Emissão de receita veterinária', descricao: 'Quando clinicamente indicada após avaliação.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: null, ordem: 70 },
  { codigo: 'carteira_viagem', nome: 'Carteira de viagem', descricao: 'Documentação e avaliação para deslocamento do pet.', categoria: 'SERVICO_DOMICILIAR', tipo_atendimento: null, ordem: 80 },

  { codigo: 'vacina_antirrabica_gato', nome: 'Antirrábica (gato)', descricao: 'Dose da vacina; aplicação calculada separadamente.', categoria: 'VACINA', tipo_atendimento: null, ordem: 110 },
  { codigo: 'vacina_antirrabica_cachorro', nome: 'Antirrábica (cachorro)', descricao: 'Dose da vacina; aplicação calculada separadamente.', categoria: 'VACINA', tipo_atendimento: null, ordem: 120 },
  { codigo: 'vacina_giardia', nome: 'Giárdia', descricao: 'Dose da vacina contra giardíase.', categoria: 'VACINA', tipo_atendimento: null, ordem: 130 },
  { codigo: 'vacina_gripe_canina', nome: 'Gripe canina', descricao: 'Dose da vacina respiratória canina.', categoria: 'VACINA', tipo_atendimento: null, ordem: 140 },
  { codigo: 'vacina_leptospirose', nome: 'Leptospirose', descricao: 'Dose da vacina contra leptospirose.', categoria: 'VACINA', tipo_atendimento: null, ordem: 150 },
  { codigo: 'vacina_pro_heart', nome: 'ProHeart', descricao: 'Aplicação preventiva conforme avaliação profissional.', categoria: 'VACINA', tipo_atendimento: null, ordem: 160 },
  { codigo: 'vacina_tosse_canis', nome: 'Tosse dos canis', descricao: 'Dose da vacina respiratória canina.', categoria: 'VACINA', tipo_atendimento: null, ordem: 170 },
  { codigo: 'vacina_v10', nome: 'V10', descricao: 'Dose da vacina múltipla canina.', categoria: 'VACINA', tipo_atendimento: null, ordem: 180 },
  { codigo: 'vacina_v8', nome: 'V8', descricao: 'Dose da vacina múltipla canina.', categoria: 'VACINA', tipo_atendimento: null, ordem: 190 },
  { codigo: 'vacina_fiv_felv', nome: 'Teste rápido FIV/FeLV', descricao: 'Teste recomendado antes de determinados protocolos felinos.', categoria: 'VACINA', tipo_atendimento: null, ordem: 200 },
  { codigo: 'vacina_v4', nome: 'V4', descricao: 'Dose da vacina múltipla felina.', categoria: 'VACINA', tipo_atendimento: null, ordem: 210 },

  { codigo: 'consulta_rotina', nome: 'Consulta de rotina', descricao: 'Consulta preventiva marcada com antecedência.', categoria: 'OUTRO_SERVICO', tipo_atendimento: 'consulta_rotina', ordem: 310 },
  { codigo: 'teleorientacao', nome: 'Teleorientação', descricao: 'Orientação remota sem substituir atendimento emergencial.', categoria: 'OUTRO_SERVICO', tipo_atendimento: 'teleorientacao', ordem: 320 },
  { codigo: 'microchipagem', nome: 'Microchipagem', descricao: 'Aplicação e registro do microchip.', categoria: 'OUTRO_SERVICO', tipo_atendimento: null, ordem: 330 },

  { codigo: 'adicional_noturno', nome: 'Adicional noturno', descricao: 'Somado ao serviço entre 20h e 6h.', categoria: 'ADICIONAL_HORARIO', tipo_atendimento: null, ordem: 410 },
  { codigo: 'adicional_fim_semana', nome: 'Adicional de fim de semana', descricao: 'Somado ao serviço aos sábados e domingos.', categoria: 'ADICIONAL_HORARIO', tipo_atendimento: null, ordem: 420 },
];

export const DEFINICAO_POR_CODIGO = new Map(
  DEFINICOES_CATALOGO_VETERINARIO.map((item) => [item.codigo, item])
);
