const CARE_AREAS = [
  {
    name: "Primary consultations",
    detail:
      "Same-week evaluations for acute symptoms, fevers, respiratory checks, and minor injuries.",
  },
  {
    name: "Preventive screening",
    detail:
      "Annual physicals, blood pressure and metabolic panels, and routine adult immunizations.",
  },
  {
    name: "Medication & lab follow-ups",
    detail:
      "Dedicated 30-minute reviews to discuss diagnostic results and adjust ongoing treatment.",
  },
  {
    name: "Specialist referrals",
    detail:
      "Direct diagnostic orders and coordinated handoffs when cardiology, imaging, or ENT care is needed.",
  },
];

const VISIT_STEPS = [
  {
    step: "01",
    title: "Reserve an open window",
    detail:
      "Choose a clinician and 30-minute time slot above. Confirmed slots lock immediately so two patients are never double-booked.",
  },
  {
    step: "02",
    title: "Arrive 10 minutes early",
    detail:
      "Bring photo identification, your current medication list, and any recent lab reports for check-in at reception.",
  },
  {
    step: "03",
    title: "Cancel or change if plans shift",
    detail:
      "Look up your booking by email or booking ID in the section above to release your time back to the schedule.",
  },
];

export function CareGuide() {
  return (
    <section
      id="care"
      aria-labelledby="care-heading"
      className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14">
        <div className="lg:col-span-6">
          <h2
            id="care-heading"
            className="font-display-heading text-3xl font-normal tracking-tight text-[var(--ink)]"
          >
            Outpatient care covered
          </h2>
          <p className="mt-3 text-base text-[var(--ink-secondary)] prose-measure">
            Every appointment reserves an unhurried 30-minute block with an attending clinician.
          </p>

          <dl className="mt-8 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {CARE_AREAS.map((area) => (
              <div key={area.name} className="py-4">
                <dt className="text-base font-semibold text-[var(--ink)]">
                  {area.name}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-[var(--ink-secondary)] prose-measure">
                  {area.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-6">
          <h2 className="font-display-heading text-3xl font-normal tracking-tight text-[var(--ink)]">
            Before your visit
          </h2>
          <p className="mt-3 text-base text-[var(--ink-secondary)] prose-measure">
            What happens from the moment you reserve a slot until check-in.
          </p>

          <ol className="mt-8 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {VISIT_STEPS.map((item) => (
              <li
                key={item.step}
                className="py-5 grid grid-cols-[2.5rem_1fr] gap-4 items-baseline"
              >
                <span className="text-sm font-semibold text-[var(--accent)] tabular-nums">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[var(--ink)]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-secondary)] prose-measure">
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
