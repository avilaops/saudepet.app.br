/** Contratos centrais retornados pela API do Saude Pet. */

/**
 * Escape hatch restrito aos endpoints legados cuja resposta ainda não possui
 * schema compartilhado. Ele deixa a ausência de contrato visível no código,
 * sem desligar o compilador para o arquivo inteiro. Não usar em endpoint novo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiPayload = any;

export type PapelUsuario = 'tutor' | 'veterinario' | 'admin' | 'super_admin';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  tipo_usuario: PapelUsuario;
  tenant_id?: string | null;
  foto_perfil?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  sobre?: string | null;
  email_verificado?: boolean;
  [campo: string]: unknown;
}

export interface Pet {
  id: string;
  nome: string;
  tipo?: string | null;
  especie?: string | null;
  raca?: string | null;
  idade?: number | null;
  peso?: number | null;
  foto?: string | null;
  foto_url?: string | null;
  tutor_id?: string;
  [campo: string]: unknown;
}

export interface Veterinario {
  id: string;
  usuario_id?: string;
  crmv?: string | null;
  especialidade?: string | null;
  online?: boolean;
  usuario?: Usuario;
  [campo: string]: unknown;
}

export interface Solicitacao {
  id: string;
  status: string;
  tipo?: string | null;
  tipo_atendimento?: string | null;
  tutor_id?: string;
  veterinario_id?: string | null;
  pet_id?: string;
  pet?: Pet;
  tutor?: Usuario;
  veterinario?: Veterinario | null;
  criado_em?: string;
  atualizado_em?: string;
  [campo: string]: unknown;
}

export type Atendimento = Solicitacao;

export interface Mensagem {
  id: string;
  tipo: string;
  conteudo?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  arquivo_url?: string | null;
  arquivo_nome?: string | null;
  arquivo_tamanho?: number | null;
  remetente_id?: string;
  destinatario_id?: string | null;
  atendimento_id?: string | null;
  criado_em?: string;
  [campo: string]: unknown;
}

export interface Prontuario {
  id: string;
  solicitacao_id?: string;
  diagnostico?: string | null;
  prescricao?: string | null;
  observacoes?: string | null;
  [campo: string]: unknown;
}
