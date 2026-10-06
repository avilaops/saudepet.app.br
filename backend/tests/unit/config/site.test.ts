/**
 * O endereço do site usado nos e-mails vem de um lugar só, e segue o ambiente.
 *
 * Os botões de e-mail são abertos fora do app, no celular de quem recebeu: se
 * a base sair errada (barra dobrada, `undefined/...`, domínio de outro
 * ambiente), o link quebra sem que nenhuma tela mostre o erro.
 */
import { baseDoSite, urlDoSite } from '../../../src/config/site';
import templates from '../../../src/templates/emails';

const ambiente = { ...process.env };

afterEach(() => {
  process.env = { ...ambiente };
});

describe('endereço público do site', () => {
  it('usa o domínio de produção quando o ambiente não define nada', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.PUBLIC_SITE_URL;
    expect(baseDoSite()).toBe('https://saudepet.app.br');
    expect(urlDoSite('/tutor/agenda')).toBe('https://saudepet.app.br/tutor/agenda');
  });

  it('segue o FRONTEND_URL do ambiente, sem barra dobrada', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173/';
    expect(urlDoSite('/login')).toBe('http://localhost:5173/login');
    expect(urlDoSite('login')).toBe('http://localhost:5173/login');
  });

  it('e-mail sem link explícito aponta para uma tela que existe', () => {
    process.env.FRONTEND_URL = 'https://saudepet.app.br';
    const html = templates.tutor.alertaVacina({ nomeTutor: 'Ana', nomePet: 'Rex', nomeVacina: 'V10' });
    expect(html).toContain('href="https://saudepet.app.br/tutor/solicitar"');
    expect(html).not.toContain('/app/vacinas');
  });
});
