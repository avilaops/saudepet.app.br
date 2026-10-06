import crypto from 'crypto';

/**
 * Cifra simétrica das credenciais que o produto precisa guardar e reler:
 * chaves de gateway de pagamento e os dados bancários do veterinário.
 *
 * AES-256-GCM, e o GCM importa: além de cifrar, ele AUTENTICA. Um ciphertext
 * adulterado falha na `authTag` em vez de decifrar para lixo silencioso — que
 * é a diferença entre recusar um dado corrompido e gravar uma chave Pix errada
 * na conta de alguém.
 *
 * O formato guardado é `iv:authTag:encrypted`, os três em hex. O IV é sorteado
 * por chamada: cifrar o mesmo texto duas vezes precisa dar resultados
 * diferentes, senão dá para saber que dois veterinários usam o mesmo banco só
 * comparando as colunas.
 */
class CryptoService {
  private readonly algorithm = 'aes-256-gcm' as const;
  private readonly key: Buffer;

  constructor() {
    this.key = CryptoService.lerChaveDoAmbiente();
  }

  /**
   * A chave vem do ambiente e é conferida AGORA, na importação do módulo.
   *
   * Falhar aqui é proposital: uma chave ausente ou de tamanho errado descoberta
   * só na hora de salvar dados bancários significaria um formulário preenchido
   * que morre no submit. Melhor o servidor não subir.
   */
  private static lerChaveDoAmbiente(): Buffer {
    const chave = process.env.ENCRYPTION_KEY;

    if (!chave) {
      throw new Error('ENCRYPTION_KEY não definida nas variáveis de ambiente');
    }

    if (chave.length !== 64) {
      throw new Error('ENCRYPTION_KEY deve ter 64 caracteres (32 bytes em hex)');
    }

    return Buffer.from(chave, 'hex');
  }

  /**
   * @returns `iv:authTag:encrypted`, ou `null` quando não há o que cifrar —
   *          campo opcional vazio não vira string cifrada de nada.
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext) return null;

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * @throws quando o dado foi adulterado, truncado ou cifrado com outra chave.
   *         A mensagem é genérica de propósito: detalhe de falha de decifragem
   *         é informação útil para quem está tentando adivinhar a chave.
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;

    try {
      const partes = ciphertext.split(':');

      if (partes.length !== 3) {
        throw new Error('Formato inválido de ciphertext');
      }

      const [ivHex, authTagHex, encrypted] = partes;
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('❌ Erro ao descriptografar:', mensagem);
      throw new Error('Falha ao descriptografar dados');
    }
  }
}

/**
 * Gera uma ENCRYPTION_KEY nova. Usada uma vez, no preparo do ambiente.
 *
 * Era um `static` da classe, e o único chamador alcançava por
 * `CryptoService.constructor.generateKey()` — porque o módulo exporta uma
 * INSTÂNCIA, não a classe. Funcionava por acidente do JavaScript e o
 * TypeScript recusa. Agora é uma função exportada à parte, que é o que ela
 * sempre foi: não depende de instância nenhuma.
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

const cryptoService = new CryptoService();

// A exportação continua sendo a INSTÂNCIA: quatro arquivos já fazem
// `require('../services/crypto.service')` e chamam `.encrypt()` direto.
module.exports = cryptoService;
module.exports.generateKey = generateKey;

export default cryptoService;
