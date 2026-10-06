import prisma from '../config/database';
import { graphGet } from './meta-graph.service';
import { resolvePublicTenant } from './public-tenant.service';

// Mapa dos nomes de campo mais comuns em formulários de Lead Ads da Meta
// pros campos que o nosso modelo Lead já usa. Nomes fora dessa lista caem em `notes`.
const FIELD_MAP: Record<string, CampoMapeado> = {
  full_name: 'name',
  nome: 'name',
  first_name: 'name',
  phone_number: 'phone',
  telefone: 'phone',
  email: 'email',
  city: 'city',
  cidade: 'city',
  state: 'state',
  estado: 'state',
  pet_name: 'pet_name',
  nome_do_pet: 'pet_name',
  pet_type: 'pet_type',
  tipo_de_pet: 'pet_type'
};

type CampoMapeado = 'name' | 'phone' | 'email' | 'city' | 'state' | 'pet_name' | 'pet_type';

interface CampoDoFormulario {
  name: string;
  values?: string[];
}

interface LeadDaMeta {
  field_data?: CampoDoFormulario[];
  campaign_name?: string;
  ad_name?: string;
  form_name?: string;
  created_time?: string;
}

function mapFieldData(fieldData: CampoDoFormulario[] = []): { mapped: Record<CampoMapeado, string | null>; extras: string[] } {
  const mapped: Record<CampoMapeado, string | null> = { name: null, phone: null, email: null, city: null, state: null, pet_name: null, pet_type: null };
  const extras: string[] = [];
  for (const field of fieldData) {
    const key = FIELD_MAP[field.name];
    const value = field.values?.[0];
    if (!value) continue;
    if (key) {
      mapped[key] = value;
    } else {
      extras.push(`${field.name}: ${value}`);
    }
  }
  return { mapped, extras };
}

/**
 * Busca os dados completos de um lead do Lead Ads (o webhook só manda o id) e
 * grava/atualiza na mesma tabela Lead usada pelo formulário do site.
 * Idempotente: se o leadgenId já foi processado, não duplica.
 */
async function fetchAndStoreLead(leadgenId: string, pageAccessToken: string): Promise<{ id: string; created_at?: Date }> {
  const tenant = await resolvePublicTenant();

  const existing = await prisma.lead.findUnique({
    where: { tenant_id_external_id: { tenant_id: tenant.id, external_id: leadgenId } },
    select: { id: true }
  });
  if (existing) {
    console.log(`ℹ️  [META_LEADS] Lead ${leadgenId} já processado, ignorando`);
    return existing;
  }

  const leadData = await graphGet<LeadDaMeta>(leadgenId, pageAccessToken, {
    fields: 'field_data,campaign_name,ad_name,form_name,created_time'
  });

  const { mapped, extras } = mapFieldData(leadData.field_data);

  if (!mapped.phone) {
    console.warn(`⚠️  [META_LEADS] Lead ${leadgenId} sem telefone, gravando mesmo assim com placeholder`);
  }

  const lead = await prisma.lead.create({
    data: {
      tenant_id: tenant.id,
      external_id: leadgenId,
      name: mapped.name || 'Lead do Facebook/Instagram',
      phone: mapped.phone || 'não informado',
      email: mapped.email,
      city: mapped.city,
      state: mapped.state?.toUpperCase(),
      pet_name: mapped.pet_name,
      pet_type: mapped.pet_type,
      interest: leadData.ad_name || leadData.form_name || 'Lead Ads',
      privacy_accepted: true, // aceite já ocorreu dentro do formulário nativo da Meta
      privacy_accepted_at: new Date(leadData.created_time || Date.now()),
      privacy_purpose: 'Contato comercial via formulário de anúncio (Meta Lead Ads)',
      source_page: 'meta_lead_ads',
      utm_campaign: leadData.campaign_name || null,
      notes: extras.length ? `Campos adicionais do formulário Meta:\n${extras.join('\n')}` : null
    },
    select: { id: true, created_at: true }
  });

  console.log(`✅ [META_LEADS] Lead ${leadgenId} gravado como ${lead.id}`);
  return lead;
}

export { fetchAndStoreLead, mapFieldData };
