export default function BrandLogo({ light = false, className = '' }) {
  const variant = light ? 'logo-completa-clara' : 'logo-completa'
  return (
    <img
      src={`/brand/${variant}-290.png`}
      srcSet={`/brand/${variant}-290.png 1x, /brand/${variant}-580.png 2x`}
      alt="Saúde PET"
      width="290"
      height="80"
      className={`brand-logo ${className}`}
    />
  )
}
