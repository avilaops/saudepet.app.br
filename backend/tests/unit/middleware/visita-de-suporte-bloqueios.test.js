// Atos irreversíveis não podem acontecer em nome de outra pessoa.
const { bloquearVisitaDeSuporte } = require('../../../src/middleware/auth.middleware');

const res = () => {
  const r = { statusCode: null, body: null };
  r.status = (code) => { r.statusCode = code; return r; };
  r.json = (payload) => { r.body = payload; return r; };
  return r;
};

describe('Bloqueio durante visita de suporte', () => {
  it('barra a ação quando a sessão é de suporte', () => {
    // Ver a conta de alguém para entender um problema é uma coisa; trocar a
    // senha dessa pessoa ou encerrar a conta dela é outra. O registro de "quem
    // fez" não desfaz o estrago.
    const r = res();
    const next = jest.fn();

    bloquearVisitaDeSuporte({ impersonadoPor: 'admin-1' }, r, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(403);
    expect(r.body.error).toMatch(/visita de suporte/i);
  });

  it('deixa passar a sessão normal da própria pessoa', () => {
    const next = jest.fn();
    bloquearVisitaDeSuporte({ impersonadoPor: null }, res(), next);
    expect(next).toHaveBeenCalled();
  });
});
