// Raças por espécie para o cadastro de pets. "SRD (vira-lata)" vem primeiro
// por ser a resposta mais comum no Brasil; o resto em ordem alfabética.
// "Outra raça" abre um campo livre — a lista orienta, não limita.

export const RACAS_CACHORRO = [
  'SRD (vira-lata)',
  'Akita', 'American Bully', 'Basset Hound', 'Beagle', 'Bichon Frisé',
  'Border Collie', 'Boston Terrier', 'Boxer', 'Buldogue Francês', 'Buldogue Inglês',
  'Bull Terrier', 'Cane Corso', 'Cavalier King Charles', 'Chihuahua', 'Chow Chow',
  'Cocker Spaniel', 'Dachshund (Salsicha)', 'Dálmata', 'Doberman', 'Dogo Argentino',
  'Dogue Alemão', 'Fila Brasileiro', 'Fox Paulistinha', 'Golden Retriever',
  'Husky Siberiano', 'Jack Russell Terrier', 'Labrador', 'Lhasa Apso', 'Maltês',
  'Mastiff', 'Pastor Alemão', 'Pastor Australiano', 'Pastor Belga', 'Pequinês',
  'Pinscher', 'Pit Bull', 'Pomerânia (Spitz Alemão)', 'Poodle', 'Pug',
  'Rottweiler', 'Samoieda', 'São Bernardo', 'Schnauzer', 'Shar Pei',
  'Shiba Inu', 'Shih Tzu', 'Staffordshire Bull Terrier', 'Weimaraner',
  'West Highland White Terrier', 'Whippet', 'Yorkshire Terrier'
]

export const RACAS_GATO = [
  'SRD (vira-lata)',
  'Abissínio', 'Angorá', 'Ashera', 'Bengal', 'Birmanês', 'Bombaim',
  'British Shorthair', 'Burmês', 'Chartreux', 'Cornish Rex', 'Devon Rex',
  'Exótico', 'Himalaio', 'Maine Coon', 'Munchkin', 'Norueguês da Floresta',
  'Oriental', 'Persa', 'Ragdoll', 'Sagrado da Birmânia', 'Savannah',
  'Scottish Fold', 'Siamês', 'Siberiano', 'Sphynx (sem pelo)', 'Tonquinês'
]

export const OPCAO_OUTRA_RACA = 'Outra raça'

export function racasPorTipo(tipo: string): string[] | null {
  if (tipo === 'cachorro') return RACAS_CACHORRO
  if (tipo === 'gato') return RACAS_GATO
  return null // outras espécies: campo livre
}

// Idade em anos como seleção: 0 = menos de 1 ano; 20 = "20 ou mais".
export const OPCOES_IDADE = [
  { valor: 0, rotulo: 'Menos de 1 ano (filhote)' },
  ...Array.from({ length: 19 }, (_, i) => ({ valor: i + 1, rotulo: `${i + 1} ano${i ? 's' : ''}` })),
  { valor: 20, rotulo: '20 anos ou mais' }
]
