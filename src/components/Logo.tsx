// The Habla mark: a lowercase "h" whose right leg continues as sound —
// speech coming out of the letter. Indigo for language, coral for voice.

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M9.4 7.2v17.6" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <path d="M9.6 17.2c0-3.3 2.2-5.4 5-5.4s4.8 2 4.8 5.1v7.9" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M24 15.2v6.2" stroke="#ff9d80" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M27.6 17.1v2.4" stroke="#ff9d80" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 30, showWord = true }: { size?: number; showWord?: boolean }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <LogoMark size={size} />
      {showWord && (
        <span className="wordmark" style={{ fontWeight: 780, fontSize: size * 0.72, letterSpacing: "-0.04em", lineHeight: 1 }}>
          habla
        </span>
      )}
    </span>
  );
}
