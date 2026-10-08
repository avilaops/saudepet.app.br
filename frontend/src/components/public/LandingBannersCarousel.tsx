import type { ApiPayload } from '../../types/api'
import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { API_URL } from '../../services/api'
import { useDadosIniciais } from '../../ssr/dadosIniciais'

export default function LandingBannersCarousel() {
  // A home já chega do servidor com os banners: o carrossel aparece na
  // primeira pintura em vez de empurrar a página quando a API responde.
  const prontos = useDadosIniciais()<{ banners?: ApiPayload[] }>('/v1/public/banners');
  const [banners, setBanners] = useState<ApiPayload[]>(prontos.dado?.banners || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(!prontos.veioPronto);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    if (!prontos.veioPronto) fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/public/banners`);
      const data = await res.json();
      if (data.success && data.banners && data.banners.length > 0) {
        setBanners(data.banners);
      }
    } catch (err: any) {
      console.error('Erro ao carregar banners da landing page:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-rotação com pausa ao passar o mouse ou se o usuário preferir menos movimento
  useEffect(() => {
    if (banners.length <= 1 || isPaused) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [banners.length, isPaused]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  // Gestos no touch (Celular)
  const handleTouchStart = (e: any) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: any) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current - touchEndX.current > 50) {
      handleNext(); // Swipe para a esquerda
    }
    if (touchStartX.current - touchEndX.current < -50) {
      handlePrev(); // Swipe para a direita
    }
  };

  if (loading || banners.length === 0) return null;

  const currentBanner = banners[currentIndex];

  return (
    <section 
      className="w-full py-6 bg-slate-50 border-y border-slate-200/60 overflow-hidden"
      aria-label="Campanhas e Destaques"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="max-w-[1240px] mx-auto px-4">
        <div 
          className="relative rounded-3xl overflow-hidden bg-slate-900 shadow-xl border border-slate-800 group"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Imagem Responsiva (Desktop & Mobile) */}
          <div className="relative w-full aspect-[21/9] sm:aspect-[16/6] md:aspect-[1440/480] max-h-[460px] overflow-hidden">
            <picture>
              <source 
                media="(max-width: 768px)" 
                srcSet={currentBanner.mobileImageUrl || currentBanner.desktopImageUrl} 
              />
              <img
                src={currentBanner.desktopImageUrl}
                alt={currentBanner.altText || currentBanner.title}
                className="w-full h-full object-cover object-center"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </picture>

            {/* A arte enviada já traz o próprio texto: o `title` é o nome interno da
                campanha e nunca é impresso aqui. O overlay só existe quando o admin
                configura uma chamada para ação. */}
            {currentBanner.targetUrl && currentBanner.buttonLabel && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent flex justify-start p-6 sm:p-10 pointer-events-none">
                <a
                  href={currentBanner.targetUrl}
                  className="pointer-events-auto inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-bold px-6 py-3 rounded-full text-sm sm:text-base transition-all transform hover:-translate-y-0.5 shadow-lg shadow-teal-600/30"
                >
                  <span>{currentBanner.buttonLabel}</span>
                  <ArrowRight size={18} />
                </a>
              </div>
            )}

            {/* Sem botão, a arte inteira vira o link da campanha. */}
            {currentBanner.targetUrl && !currentBanner.buttonLabel && (
              <a
                href={currentBanner.targetUrl}
                className="absolute inset-0"
                aria-label={currentBanner.altText || currentBanner.title}
              />
            )}
          </div>

          {/* Botões de Navegação Lateral (Seta Esquerda & Direita) */}
          {banners.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer border border-slate-200"
                aria-label="Banner anterior"
              >
                <ChevronLeft size={24} />
              </button>

              <button
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer border border-slate-200"
                aria-label="Próximo banner"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          {/* Indicadores de Posição (Bolinhas) */}
          {banners.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10 bg-slate-950/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    currentIndex === idx 
                      ? 'w-7 bg-teal-400' 
                      : 'w-2.5 bg-white/50 hover:bg-white/80'
                  }`}
                  aria-label={`Ir para banner ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
