export default function DogAnimation({ className = '' }) {
  return (
    <div className={`dog-animation ${className}`} role="img" aria-label="Cachorro alegre aguardando atendimento veterinário">
      <svg viewBox="0 0 220 190" aria-hidden="true" focusable="false">
        <g className="dog-breathe">
          <path className="dog-tail" d="M171 127c31-4 36-24 23-34" fill="none" stroke="#f58235" strokeWidth="15" strokeLinecap="round" />
          <ellipse cx="112" cy="139" rx="66" ry="38" fill="#f5a55e" />
          <path d="M61 127c-22 5-29 25-17 45h28l8-38zM154 128l7 44h28c7-24-6-42-35-44z" fill="#d96e2c" />
          <g className="dog-head">
            <path d="M53 43c-20 4-29 31-17 59 7 17 22 25 34 17l8-56z" fill="#9c5a35" />
            <path d="M166 43c20 4 29 31 17 59-7 17-22 25-34 17l-8-56z" fill="#9c5a35" />
            <path d="M62 72c0-36 22-57 50-57s50 21 50 57v25c0 30-23 48-50 48S62 127 62 97z" fill="#f5a55e" />
            <path d="M112 74c24 0 38 15 38 35 0 25-17 38-38 38s-38-13-38-38c0-20 14-35 38-35z" fill="#fff4e9" />
            <g className="dog-eyes" fill="#15343a">
              <ellipse cx="92" cy="72" rx="5" ry="8" />
              <ellipse cx="132" cy="72" rx="5" ry="8" />
            </g>
            <path d="M103 96c5-4 13-4 18 0-1 9-5 13-9 13s-8-4-9-13z" fill="#15343a" />
            <path d="M94 118c12 10 24 10 36 0" fill="none" stroke="#15343a" strokeWidth="4" strokeLinecap="round" />
            <path d="M107 123c0 13 12 16 18 3-7 0-12-1-18-3z" fill="#ec5f68" />
            <circle cx="153" cy="94" r="8" fill="#159fa3" />
            <path d="M153 89v10M148 94h10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  )
}
