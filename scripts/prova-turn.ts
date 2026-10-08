/**
 * Prova que o TURN aloca um relay — de fora do servidor.
 *
 * `turnutils_uclient` rodando NA propria maquina do coturn nao prova nada util:
 * ele nunca sai para a internet e os peers dele caem nas faixas privadas que a
 * config bloqueia de proposito. O que importa e a pergunta que o navegador do
 * tutor vai fazer: "deste lado do mundo, com esta credencial, voce me da um
 * endereco de retransmissao?".
 *
 * Entao isto fala STUN/TURN cru por UDP, do zero:
 *   1. Allocate sem credencial  -> espera 401 com REALM e NONCE
 *   2. Allocate com MESSAGE-INTEGRITY -> espera 0x0103 com XOR-RELAYED-ADDRESS
 *
 * Se o passo 2 devolve um IP:porta, a retransmissao existe e e alcancavel.
 */
const dgram = require('node:dgram');
const crypto = require('node:crypto');

const HOST = process.argv[2];
const PORTA = 3478;
const USUARIO = process.env.TURN_USER;
const SENHA = process.env.TURN_PASS;

const COOKIE = 0x2112a442;
const METODO_ALLOCATE = 0x0003;

const ATTR = {
  USERNAME: 0x0006,
  MESSAGE_INTEGRITY: 0x0008,
  ERROR_CODE: 0x0009,
  REALM: 0x0014,
  NONCE: 0x0015,
  XOR_RELAYED_ADDRESS: 0x0016,
  REQUESTED_TRANSPORT: 0x0019,
};

const alinhar4 = (n) => (n + 3) & ~3;

function atributo(tipo, valor) {
  const cabecalho = Buffer.alloc(4);
  cabecalho.writeUInt16BE(tipo, 0);
  cabecalho.writeUInt16BE(valor.length, 2);
  // O padding entra no buffer mas NAO conta no comprimento declarado.
  const recheio = Buffer.alloc(alinhar4(valor.length) - valor.length);
  return Buffer.concat([cabecalho, valor, recheio]);
}

function montar(metodo, classe, transactionId, atributos) {
  const corpo = Buffer.concat(atributos);
  const cabecalho = Buffer.alloc(20);
  // Tipo = metodo + classe, entrelacados como manda o RFC 5389.
  const tipo = ((metodo & 0x0f80) << 2) | ((metodo & 0x0070) << 1) | (metodo & 0x000f) | classe;
  cabecalho.writeUInt16BE(tipo, 0);
  cabecalho.writeUInt16BE(corpo.length, 2);
  cabecalho.writeUInt32BE(COOKIE, 4);
  transactionId.copy(cabecalho, 8);
  return Buffer.concat([cabecalho, corpo]);
}

/**
 * MESSAGE-INTEGRITY e um HMAC-SHA1 sobre a mensagem INTEIRA — mas com o campo
 * de comprimento ja contando os 24 bytes do proprio atributo, que ainda nao
 * foi anexado. Errar isso e o motivo classico de "401 eterno".
 */
function comIntegridade(mensagem, chave) {
  const comprimentoFinal = mensagem.length - 20 + 24;
  const paraAssinar = Buffer.from(mensagem);
  paraAssinar.writeUInt16BE(comprimentoFinal, 2);
  const hmac = crypto.createHmac('sha1', chave).update(paraAssinar).digest();
  const final = Buffer.concat([mensagem, atributo(ATTR.MESSAGE_INTEGRITY, hmac)]);
  final.writeUInt16BE(comprimentoFinal, 2);
  return final;
}

function lerAtributos(msg) {
  const attrs = {};
  let i = 20;
  while (i + 4 <= msg.length) {
    const tipo = msg.readUInt16BE(i);
    const tam = msg.readUInt16BE(i + 2);
    attrs[tipo] = msg.subarray(i + 4, i + 4 + tam);
    i += 4 + alinhar4(tam);
  }
  return attrs;
}

/** O endereco vem embaralhado com o magic cookie para atravessar NAT burro. */
function lerEnderecoXor(buf) {
  const porta = buf.readUInt16BE(2) ^ (COOKIE >>> 16);
  const ip = [];
  for (let i = 0; i < 4; i += 1) ip.push(buf[4 + i] ^ ((COOKIE >>> (24 - 8 * i)) & 0xff));
  return `${ip.join('.')}:${porta}`;
}

function enviar(socket, mensagem) {
  return new Promise((ok, erro) => {
    const prazo = setTimeout(() => erro(new Error('sem resposta em 6s — porta fechada ou servidor fora')), 6000);
    socket.once('message', (resposta) => { clearTimeout(prazo); ok(resposta); });
    socket.send(mensagem, PORTA, HOST, (e) => e && (clearTimeout(prazo), erro(e)));
  });
}

(async () => {
  const socket = dgram.createSocket('udp4');
  const tid = crypto.randomBytes(12);
  const transporteUdp = Buffer.from([17, 0, 0, 0]);

  try {
    // ── 1. Sem credencial: o servidor tem que RECUSAR e dizer o realm.
    const semAuth = montar(METODO_ALLOCATE, 0x0000, tid, [atributo(ATTR.REQUESTED_TRANSPORT, transporteUdp)]);
    const desafio = lerAtributos(await enviar(socket, semAuth));

    const codigo = desafio[ATTR.ERROR_CODE];
    const realm = desafio[ATTR.REALM];
    const nonce = desafio[ATTR.NONCE];

    if (!realm || !nonce) {
      console.log('FALHOU: o servidor respondeu sem realm/nonce — nao esta pedindo credencial.');
      process.exit(1);
    }

    const numeroDoErro = codigo ? codigo[2] * 100 + codigo[3] : 0;
    console.log(`1. Allocate sem credencial -> ${numeroDoErro} (esperado 401), realm "${realm.toString()}"`);
    if (numeroDoErro !== 401) {
      console.log('   ATENCAO: um TURN que aloca sem credencial e proxy aberto para o mundo.');
    }

    // ── 2. Com credencial: a chave e MD5("usuario:realm:senha").
    const chave = crypto.createHash('md5').update(`${USUARIO}:${realm.toString()}:${SENHA}`).digest();
    const tid2 = crypto.randomBytes(12);
    const comAuth = comIntegridade(
      montar(METODO_ALLOCATE, 0x0000, tid2, [
        atributo(ATTR.REQUESTED_TRANSPORT, transporteUdp),
        atributo(ATTR.USERNAME, Buffer.from(USUARIO)),
        atributo(ATTR.REALM, realm),
        atributo(ATTR.NONCE, nonce),
      ]),
      chave,
    );

    const resposta = await enviar(socket, comAuth);
    const tipo = resposta.readUInt16BE(0);
    const attrs = lerAtributos(resposta);

    if (tipo === 0x0103) {
      const relay = attrs[ATTR.XOR_RELAYED_ADDRESS];
      console.log(`2. Allocate com credencial -> SUCESSO, relay em ${lerEnderecoXor(relay)}`);
      console.log('\nRESULTADO: o TURN aloca retransmissao para quem vem de fora, com credencial.');
    } else {
      const erro = attrs[ATTR.ERROR_CODE];
      const n = erro ? erro[2] * 100 + erro[3] : tipo;
      console.log(`2. Allocate com credencial -> RECUSADO (${n}): ${erro ? erro.subarray(4).toString() : 'sem detalhe'}`);
      console.log('\nRESULTADO: FALHOU — a credencial nao foi aceita.');
    }
  } catch (e) {
    console.log('RESULTADO: FALHOU —', e.message);
  } finally {
    socket.close();
  }
})();

export {};
