/**
 * A avaliação virou duas: a do tutor sobre o veterinário e a do veterinário
 * sobre o tutor. As telas que existiam liam um objeto só, em `avaliacao`, e
 * quase todas querem exatamente a primeira — é a nota que aparece no histórico
 * do tutor, no painel do admin e no CRM.
 *
 * Este ajudante devolve a lista já no formato antigo, para que a mudança de
 * modelo não obrigue a reescrever tela nenhuma. Quem precisa da outra direção
 * pede por ela explicitamente.
 */

type ComAvaliacoes<T> = T & { avaliacoes?: Array<{ autor_papel?: string }> | null };

export function comAvaliacaoDoTutor<T extends object>(registro: ComAvaliacoes<T>) {
  const lista = Array.isArray(registro.avaliacoes) ? registro.avaliacoes : [];
  const { avaliacoes, ...resto } = registro;

  return {
    ...resto,
    avaliacao: lista.find((item) => (item.autor_papel || 'tutor') === 'tutor') || null,
    avaliacao_do_veterinario: lista.find((item) => item.autor_papel === 'veterinario') || null
  };
}

export default { comAvaliacaoDoTutor };
