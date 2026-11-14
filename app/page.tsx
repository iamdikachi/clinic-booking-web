import { CareGuide } from "@/components/CareGuide";
import { ClinicWorkspace } from "@/components/ClinicWorkspace";

export default function Home() {
  return (
    <div className="min-h-full flex flex-col bg-[var(--bg-canvas)] text-[var(--ink)]">
      <a href="#hero-heading" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <a
            href="#book"
            className="inline-flex items-center gap-2.5 text-[var(--ink)] no-underline"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="h-6 w-6 text-[var(--accent)] shrink-0"
            >
              <rect
                x="2"
                y="2"
                width="20"
                height="20"
                rx="4"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M12 7v10M7 12h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-display-heading text-xl font-medium tracking-tight">
              Linden Medical
            </span>
          </a>

          <nav aria-label="Primary">
            <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
              <li>
                <a
                  href="#book"
                  className="clinical-touch-target inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Book a visit
                </a>
              </li>
              <li>
                <a
                  href="#manage"
                  className="clinical-touch-target inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Manage booking
                </a>
              </li>
              <li>
                <a
                  href="#care"
                  className="clinical-touch-target inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Visit guide
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <ClinicWorkspace />
        <CareGuide />
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-[var(--ink-secondary)]">
          <div>
            <p className="font-medium text-[var(--ink)]">
              Linden Medical Outpatient Clinic
            </p>
            <p className="mt-0.5">
              240 Mercer Street, Suite 3B, open Monday–Saturday, 08:00–18:00
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#book"
              className="clinical-touch-target inline-flex items-center font-medium text-[var(--accent)] hover:underline"
            >
              Book a visit
            </a>
            <a
              href="#manage"
              className="clinical-touch-target inline-flex items-center font-medium text-[var(--accent)] hover:underline"
            >
              Find or cancel a booking
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
