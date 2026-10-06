// `bcryptjs` 2.x não publica declarações e a casa não instala `@types/bcryptjs`.
// Esta declaração cobre a biblioteca inteira num lugar só: antes, cada
// controller que precisava dela recriava o mesmo recorte de assinaturas à mão.
declare module 'bcryptjs' {
  export function hash(senha: string, saltOuRounds: string | number): Promise<string>;
  export function hashSync(senha: string, saltOuRounds?: string | number): string;
  export function compare(senha: string, hash: string): Promise<boolean>;
  export function compareSync(senha: string, hash: string): boolean;
  export function genSalt(rounds?: number): Promise<string>;
  export function genSaltSync(rounds?: number): string;

  const bcrypt: {
    hash: typeof hash;
    hashSync: typeof hashSync;
    compare: typeof compare;
    compareSync: typeof compareSync;
    genSalt: typeof genSalt;
    genSaltSync: typeof genSaltSync;
  };
  export default bcrypt;
}
