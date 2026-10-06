import { useState } from 'react'
import { TAMANHOS, salvarTamanho, tamanhoSalvo } from '../lib/acessibilidade'
import { Panel, PanelTitle } from './ui/AppKit'

/**
 * Escolha do tamanho da letra.
 *
 * O app foi desenhado com texto pequeno e não havia como aumentar sem usar o
 * pinch-zoom, que desloca a tela e faz quem não tem intimidade com celular se
 * perder no meio do formulário. Aqui a pessoa escolhe uma vez e o app inteiro
 * cresce em proporção — texto, espaçamento e área de toque.
 */
export default function TamanhoDaLetra({ className = '' }) {
  const [atual, setAtual] = useState(tamanhoSalvo)

  const escolher = (chave: string) => setAtual(salvarTamanho(chave))

  return (
    <Panel className={`space-y-3 px-4 py-4 ${className}`}>
      <PanelTitle
        title="Tamanho da letra"
        hint="Aumenta o aplicativo inteiro, não só esta tela. Fica salvo neste aparelho."
      />

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tamanho da letra">
        {Object.entries(TAMANHOS).map(([chave, opcao]) => {
          const ativo = atual === chave
          return (
            <button
              key={chave}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => escolher(chave)}
              className={`rounded-xl border px-2 py-3 transition ${ativo ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >
              {/* O tamanho do rótulo mostra o efeito antes de escolher. */}
              <span className="block font-bold" style={{ fontSize: `${opcao.px * 0.85}px` }}>Aa</span>
              <span className="mt-0.5 block text-[0.7rem] font-semibold">{opcao.rotulo}</span>
            </button>
          )
        })}
      </div>

      <p className="text-[0.72rem] text-slate-400">{TAMANHOS[atual].descricao}</p>
    </Panel>
  )
}
