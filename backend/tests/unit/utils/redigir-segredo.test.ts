/**
 * Prova que segredo não chega ao log, e que diagnóstico chega.
 *
 * Os dois lados importam igualmente. Um teste que só verificasse "a senha
 * sumiu" passaria com uma função que apaga a mensagem inteira, e log mudo é
 * pior que log cuidadoso: é justamente no erro de produção que se precisa
 * saber qual host, qual usuário e o que a biblioteca disse.
 */
import { redigirSegredo, redigirObjeto } from '../../../src/utils/redigir-segredo';

// Valores inventados só para o teste. Nenhum é credencial real.
const SENHA = 'S3nh4Sup3rSecreta';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789';

describe('redação de segredo no log', () => {
  describe('o segredo sai', () => {
    it('apaga a senha da string de conexão', () => {
      const saida = redigirSegredo(
        `Can't reach database server at postgresql://saudepet:${SENHA}@db.interno:5432/saudepet`
      );

      expect(saida).not.toContain(SENHA);
      expect(saida).toContain('***');
    });

    it('apaga o token do cabeçalho de autorização', () => {
      expect(redigirSegredo(`Authorization: Bearer ${TOKEN}`)).not.toContain(TOKEN);
      expect(redigirSegredo(`Basic ${TOKEN}`)).not.toContain(TOKEN);
    });

    it('apaga valor de campo cujo nome denuncia segredo', () => {
      for (const campo of ['senha', 'password', 'secret', 'api_key', 'apiKey', 'token']) {
        const saida = redigirSegredo(`${campo}=${SENHA}`);
        expect(saida).not.toContain(SENHA);
      }
    });

    it('apaga chave com prefixo conhecido solta no meio do texto', () => {
      const chave = 'sk-proj-ABCDEFGHIJKLMNOP123456';
      expect(redigirSegredo(`falha usando ${chave} na chamada`)).not.toContain('ABCDEFGHIJKLMNOP');
    });

    it('apaga JWT solto', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
      expect(redigirSegredo(`token invalido: ${jwt}`)).not.toContain('dBjftJeZ4CVPmB92K27uhbUJU1p1r');
    });
  });

  describe('o diagnóstico fica', () => {
    it('preserva host, porta, banco e usuário da string de conexão', () => {
      const saida = redigirSegredo(
        `Can't reach database server at postgresql://saudepet:${SENHA}@db.interno:5432/saudepet`
      );

      expect(saida).toContain('db.interno');
      expect(saida).toContain('5432');
      expect(saida).toContain('saudepet');
      expect(saida).toContain("Can't reach database server");
    });

    it('não mexe em mensagem que não tem segredo nenhum', () => {
      const mensagem = 'Atendimento não pode ser finalizado no status atual';
      expect(redigirSegredo(mensagem)).toBe(mensagem);
    });

    it('não estraga texto com dois-pontos que não é credencial', () => {
      const mensagem = 'Erro na linha 42: campo obrigatório ausente';
      expect(redigirSegredo(mensagem)).toBe(mensagem);
    });
  });

  describe('entrada que não é texto', () => {
    it('devolve como veio, sem estourar', () => {
      // O tratador de erro é o pior lugar para lançar exceção: um erro
      // malformado chega com `message` indefinido.
      expect(redigirSegredo(undefined)).toBeUndefined();
      expect(redigirSegredo(null)).toBeNull();
      expect(redigirSegredo(42)).toBe(42);
    });
  });

  describe('objeto inteiro', () => {
    it('mascara campo sensível pelo nome, sem depender do formato do valor', () => {
      const saida = redigirObjeto({
        usuario: 'nicolas',
        senha: SENHA,
        headers: { authorization: `Bearer ${TOKEN}`, 'user-agent': 'curl/8' }
      }) as Record<string, unknown>;

      expect(saida.usuario).toBe('nicolas');
      expect(saida.senha).toBe('***');
      const cabecalhos = saida.headers as Record<string, unknown>;
      expect(cabecalhos.authorization).toBe('***');
      expect(cabecalhos['user-agent']).toBe('curl/8');
    });

    it('não trava em estrutura profunda ou cíclica', () => {
      const ciclico: Record<string, unknown> = { nome: 'x' };
      ciclico.eu = ciclico;

      expect(() => redigirObjeto(ciclico)).not.toThrow();
    });
  });
});
