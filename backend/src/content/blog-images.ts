/** Texto alternativo da capa de cada artigo, por slug. */
export const BLOG_IMAGES: Record<string, string> = {
  'atendimento-domiciliar-ou-hospital-veterinario-quando-cada-um-e-indicado': 'Veterinária examina um cachorro durante atendimento domiciliar, acompanhada pela tutora.',
  'como-funciona-uma-consulta-veterinaria-em-domicilio': 'Veterinária examina um gato tranquilo sobre uma manta durante uma consulta em casa.',
  'quando-levar-o-pet-ao-veterinario-mesmo-sem-sintomas': 'Tutor leva seu cachorro saudável para uma consulta veterinária preventiva.',
  'pulgas-e-carrapatos-como-identificar-prevenir-e-proteger': 'Veterinária examina cuidadosamente a pelagem de um cachorro para identificar parasitas.',
  'calendario-de-vacinacao-para-gatos': 'Gato recebe cuidados durante uma consulta veterinária de vacinação.',
  'calendario-de-vacinacao-para-cachorros': 'Filhote de cachorro é acolhido pela veterinária durante uma consulta de vacinação.',
  'como-saber-se-o-pet-esta-com-dor': 'Tutora observa com atenção o comportamento de seu cachorro em casa.',
  'cachorro-ou-gato-intoxicado-o-que-fazer': 'Tutora protege cachorro e gato de produtos domésticos potencialmente tóxicos.',
  'pet-com-dificuldade-para-respirar-sinais-de-emergencia': 'Veterinária avalia a respiração de um cachorro durante atendimento de urgência.',
  'cachorro-com-diarreia-causas-e-sinais-de-emergencia': 'Tutor conforta um cachorro indisposto enquanto busca orientação veterinária.',
  'gato-parou-de-comer-quanto-tempo-pode-esperar': 'Tutora oferece alimento úmido e observa o apetite de seu gato.',
  'cachorro-vomitando-quando-e-preocupante': 'Tutor cuida de um cachorro indisposto em um ambiente doméstico tranquilo.',
  'primeira-consulta-do-filhote-o-que-o-tutor-precisa-preparar': 'Veterinária conversa com a tutora durante a primeira consulta de um filhote.',
  'como-cuidar-de-um-cachorro-ou-gato-idoso': 'Tutora oferece carinho e conforto a um cachorro idoso em casa.',
  'mau-halito-em-caes-e-gatos-e-normal': 'Veterinária realiza uma avaliação cuidadosa da saúde bucal de um cachorro.',
  'como-saber-se-o-pet-esta-acima-do-peso': 'Veterinária acompanha a pesagem de um cachorro com sua tutora.',
  'queda-de-pelo-quando-e-normal-e-quando-pode-indicar-um-problema': 'Tutora escova suavemente a pelagem de seu cachorro em casa.',
  'coceira-constante-no-cachorro-alergia-pulga-ou-problema-de-pele': 'Veterinária examina a pele de um cachorro que apresenta coceira constante.',
  'cachorro-pode-comer-comida-humana-alimentos-permitidos-e-perigosos': 'Tutor prepara alimentos adequados para o cachorro e mantém itens perigosos fora do alcance.',
  'por-que-manter-vacinas-alergias-e-medicamentos-do-pet-registrados': 'Tutora organiza no tablet os registros de saúde do cachorro durante uma consulta.',
  'plantas-toxicas-para-caes-e-gatos': 'Tutora mantém uma planta potencialmente tóxica fora do alcance de seu gato.',
  'chocolate-faz-mal-para-cachorro-entenda-o-risco': 'Tutora guarda chocolate em um armário alto, longe do alcance do cachorro.',
  'como-proteger-caes-e-gatos-do-calor-excessivo': 'Cachorro e gato descansam à sombra com água fresca e ventilação em um dia quente.',
  'fogos-de-artificio-como-reduzir-o-medo-e-a-ansiedade-do-pet': 'Tutora acolhe seu cachorro em um ambiente protegido durante uma noite de fogos de artifício.',
  'frio-em-curitiba-quais-pets-sofrem-mais': 'Tutora aquece um cachorro idoso de pelo curto em uma cama elevada durante o inverno de Curitiba.',
  'emergencia-veterinaria-em-curitiba-o-plano-antes-de-precisar': 'Tutor prepara a caixa de transporte e os itens essenciais para uma emergência com seu gato.',
  'passeio-no-inverno-de-curitiba-o-que-muda': 'Tutora seca a pata do cachorro após um passeio em uma manhã fria de Curitiba.',
  'casa-fechada-no-inverno-pele-e-respiracao-do-pet': 'Tutora abre a janela e troca a roupa da cama dos pets para ventilar a casa no inverno.'
}

export function getBlogImage(slug: string) {
  const alt = BLOG_IMAGES[slug]
  return alt ? {
    cover_image: `/blog-media/${slug}.webp`,
    cover_image_alt: alt,
    social_image: `/blog-media/social/${slug}.jpg`
  } : {}
}
