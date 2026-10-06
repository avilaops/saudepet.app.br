/**
 * O que um template de e-mail recebe.
 *
 * Cada template monta HTML a partir de um punhado de campos que o serviço de
 * e-mail passa: nome do tutor, link do aplicativo, valor da cobrança, data do
 * retorno. Os nomes variam de template para template, e amarrar cada um ao seu
 * conjunto exato exigiria 23 interfaces para ganhar quase nada: quem chama é o
 * `email.service`, que já sabe o que envia.
 *
 * O que este tipo entrega é o essencial: os campos são valores simples, não
 * objeto arbitrário, e o `strict` para de recusar o parâmetro por `any`
 * implícito sem que ninguém escreva `any` à mão.
 */
export type DadosDoEmail = Record<string, string | number | boolean | null | undefined>;

export default DadosDoEmail;
