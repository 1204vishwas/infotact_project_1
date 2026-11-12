/**
 * Geometric vector brand mark representing connected telemetry nodes and live flow.
 */
export function BrandLogo() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="36" height="36" rx="9" fill="#0E1726" stroke="#1E3A5F" strokeWidth="1.2" />
          <path
            d="M10 18H16L19 12L23 24L26 18"
            stroke="url(#nf-pulse)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9.5" cy="18" r="2.2" fill="#22D3EE" />
          <circle cx="26.5" cy="18" r="2.2" fill="#34D399" />
          <defs>
            <linearGradient id="nf-pulse" x1="10" y1="18" x2="26" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22D3EE" />
              <stop offset="0.55" stopColor="#38BDF8" />
              <stop offset="1" stopColor="#34D399" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div>
        <span className="brand-name">NexusFlow</span>
        <span className="brand-tag">IoT Telemetry &amp; Rule Engine</span>
      </div>
    </div>
  );
}
