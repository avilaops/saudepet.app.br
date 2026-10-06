/**
 * Endereço público do Saúde Pet, num lugar só.
 *
 * Até 04/10/2026 cada e-mail e cada worker montava o próprio endereço, uns com
 * `FRONTEND_URL`, outros com `PUBLIC_SITE_URL`, outros com o domínio escrito à
 * mão — e metade dos botões de e-mail apontava para rotas que nunca existiram
 * (`/app/vet/chamados`, `/app/vacinas`, `/admin/vets`, `/suporte`...), que o
 * nginx responde com 404. Quem monta link para uma tela do app usa `urlDoSite`;
 * `scripts/verificar-rotas.mjs` reprova o build quando o caminho passado aqui
 * não é uma rota do React.
 */
const PADRAO = 'https://saudepet.app.br';

export function baseDoSite(): string {
  return (process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || PADRAO).replace(/\/$/, '');
}

/** `urlDoSite('/tutor/agenda')` → `https://saudepet.app.br/tutor/agenda`. */
export function urlDoSite(caminho = '/'): string {
  return `${baseDoSite()}${caminho.startsWith('/') ? caminho : `/${caminho}`}`;
}
