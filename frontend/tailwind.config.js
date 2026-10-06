/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#159fa3',
        secondary: '#f58235',
        accent: '#2fc1c9',
        ink: '#15343a',
        // Superfícies: um único off-white de página para todo o app (tutor, vet,
        // admin, loja, auth). Antes eram quatro quase iguais (#f6f9f9, #f7fbfa,
        // #f7f8fa, slate-50) e a diferença aparecia como faixa no login.
        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          muted: 'var(--surface-muted)',
        },
      },
    },
  },
  plugins: [],
}
