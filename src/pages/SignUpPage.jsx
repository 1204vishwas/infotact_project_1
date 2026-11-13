import { BrandLogo } from '../components/BrandLogo';
import { PipelinePreview } from '../components/PipelinePreview';
import { SignUpForm } from '../components/SignUpForm';

const CAPABILITY_PILLS = [
  { label: 'MongoDB Time-Series', detail: '5,000+ writes/sec' },
  { label: 'RxJS Stream Compiler', detail: 'Sub-ms evaluation' },
  { label: 'WebSocket & SMS', detail: 'Instant anomaly alerts' },
];

/**
 * Primary two-column NexusFlow Sign Up page combining the visual pipeline showcase
 * with the operator registration form.
 */
export function SignUpPage() {
  return (
    <main className="signup-layout">
      <section className="showcase-panel" aria-label="NexusFlow Platform Overview">
        <div className="showcase-inner">
          <BrandLogo />

          <div className="hero-copy">
            <p className="eyebrow">No-Code Industrial Rule Engine</p>
            <h2 className="hero-title">
              Turn factory telemetry streams into live visual logic.
            </h2>
            <p className="hero-description">
              Connect sensor streams, moving-average filters, and real-time alert triggers on a
              visual canvas—compiled instantly into reactive pipelines without hardcoding rules.
            </p>
          </div>

          <PipelinePreview />

          <div className="capability-strip">
            {CAPABILITY_PILLS.map((item) => (
              <div key={item.label} className="capability-card">
                <span className="capability-label">{item.label}</span>
                <span className="capability-detail">{item.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="form-panel" aria-label="Operator Sign Up">
        <div className="mobile-brand">
          <BrandLogo />
        </div>
        <SignUpForm />
      </section>
    </main>
  );
}
