"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ClinicApiError,
  createBooking,
  formatDateTimeReadable,
  formatDayHeading,
  formatDayKey,
  formatProviderName,
  formatTimeRange,
  getLocalTimeZoneDescription,
  type Booking,
  type Slot,
} from "@/lib/clinic-api";
import { useAccessibleFormSync } from "./useAccessibleFormSync";
import { useIsHydrated } from "./useIsHydrated";

function describeScheduleLoadError(
  loadError: string,
  loadErrorCode: string | null,
): { title: string; detail: string } {
  switch (loadErrorCode) {
    case "api_not_configured":
      return {
        title: "Clinic scheduling API is not connected",
        detail:
          "This deployment is missing its server connection settings (CLINIC_API_URL and CLINIC_API_KEY) to reach clinic_api.",
      };
    case "api_auth_mismatch":
      return {
        title: "Clinic scheduling authorization failed",
        detail:
          "The web server's CLINIC_API_KEY was rejected by clinic_api. Check that the deployment's server key matches the backend.",
      };
    case "api_timeout":
      return {
        title: "Clinic scheduling server is taking longer to wake",
        detail: `${loadError} Idle free-tier servers can take up to 30 seconds to warm up. Wait a moment and retry.`,
      };
    default:
      return {
        title: "Clinic scheduling server is unreachable",
        detail: `${loadError} If the backend just started or is waking from sleep, wait a few seconds and retry.`,
      };
  }
}

interface BookingDeskProps {
  slots: Slot[];
  loading: boolean;
  loadError: string | null;
  loadErrorCode?: string | null;
  isPreviewMode: boolean;
  selectedProvider: string;
  onProviderChange: (provider: string) => void;
  onRefresh: () => Promise<void>;
  onEnablePreview: () => void;
  onExitPreview: () => void;
  onBookingCreated: (booking: Booking) => void;
  onInspectBooking: (booking: Booking) => void;
}

export function BookingDesk({
  slots,
  loading,
  loadError,
  loadErrorCode = null,
  isPreviewMode,
  selectedProvider,
  onProviderChange,
  onRefresh,
  onEnablePreview,
  onExitPreview,
  onBookingCreated,
  onInspectBooking,
}: BookingDeskProps) {
  const isHydrated = useIsHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const scheduleHeadingId = useId();
  const formHeadingId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const emailId = useId();
  const emailHintId = useId();
  const emailErrorId = useId();
  const providerSelectId = useId();

  useAccessibleFormSync(formRef);

  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(0);
  const [referenceTime, setReferenceTime] = useState<number>(0);
  const [openOnly, setOpenOnly] = useState(false);
  const [wakingDelayElapsed, setWakingDelayElapsed] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(
    null,
  );
  const [copiedId, setCopiedId] = useState(false);

  // Capture current time asynchronously on mount, schedule updates, and every 30s so render stays pure.
  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setReferenceTime(Date.now());
    }, 0);
    const refreshTimer = window.setInterval(() => {
      setReferenceTime(Date.now());
    }, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [slots]);

  // Tick 1s countdown only while a rate-limit timer is active.
  useEffect(() => {
    if (!rateLimitUntil) {
      return;
    }
    const updateTick = () => {
      const current = Date.now();
      setNowTick(current);
      if (current >= rateLimitUntil) {
        setRateLimitUntil(null);
      }
    };
    const initialTimer = window.setTimeout(updateTick, 0);
    const timer = window.setInterval(updateTick, 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [rateLimitUntil]);

  // Show a calm waking notice if initial schedule fetch takes longer than 4s (e.g. cold start).
  useEffect(() => {
    if (!loading || slots.length > 0) {
      return;
    }
    const resetTimer = window.setTimeout(() => {
      setWakingDelayElapsed(false);
    }, 0);
    const wakeTimer = window.setTimeout(() => {
      setWakingDelayElapsed(true);
    }, 4_000);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(wakeTimer);
    };
  }, [loading, slots.length]);

  const showWakingNotice = loading && slots.length === 0 && wakingDelayElapsed;
  const scheduleErrorCopy = loadError
    ? describeScheduleLoadError(loadError, loadErrorCode)
    : null;

  const providers = useMemo(() => {
    const unique = new Set(slots.map((s) => s.provider));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [slots]);

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (selectedProvider && slot.provider !== selectedProvider) {
        return false;
      }
      if (openOnly) {
        const isPast =
          isHydrated && referenceTime > 0
            ? new Date(slot.start).getTime() <= referenceTime
            : false;
        if (!slot.available || isPast) {
          return false;
        }
      }
      return true;
    });
  }, [slots, selectedProvider, openOnly, isHydrated, referenceTime]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<
      string,
      { dayKey: string; label: string; slots: Slot[]; openCount: number }
    >();

    for (const slot of filteredSlots) {
      const dayKey = isHydrated
        ? formatDayKey(slot.start)
        : slot.start.slice(0, 10);
      const existing = groups.get(dayKey);
      const isPast =
        isHydrated && referenceTime > 0
          ? new Date(slot.start).getTime() <= referenceTime
          : false;
      const isOpen = slot.available && !isPast;

      if (existing) {
        existing.slots.push(slot);
        if (isOpen) {
          existing.openCount += 1;
        }
      } else {
        groups.set(dayKey, {
          dayKey,
          label: isHydrated ? formatDayHeading(slot.start) : dayKey,
          slots: [slot],
          openCount: isOpen ? 1 : 0,
        });
      }
    }

    return Array.from(groups.values());
  }, [filteredSlots, isHydrated, referenceTime]);

  const activeSelectedSlot = useMemo(() => {
    if (!selectedSlotId) {
      return null;
    }
    const found = filteredSlots.find((s) => s.id === selectedSlotId);
    if (!found || !found.available) {
      return null;
    }
    if (
      isHydrated &&
      referenceTime > 0 &&
      new Date(found.start).getTime() <= referenceTime
    ) {
      return null;
    }
    return found;
  }, [filteredSlots, selectedSlotId, isHydrated, referenceTime]);

  const totalOpenCount = useMemo(() => {
    return filteredSlots.filter(
      (s) =>
        s.available &&
        (!isHydrated ||
          referenceTime === 0 ||
          new Date(s.start).getTime() > referenceTime),
    ).length;
  }, [filteredSlots, isHydrated, referenceTime]);

  const rateLimitRemainingSeconds =
    rateLimitUntil && nowTick > 0
      ? Math.max(0, Math.ceil((rateLimitUntil - nowTick) / 1000))
      : 0;

  const timezoneLabel = isHydrated ? getLocalTimeZoneDescription() : "Local time";

  function getOrCreateIdempotencyKey(
    slotId: string,
    trimmedName: string,
    normalizedEmail: string,
  ): string {
    const signature = `${slotId}::${trimmedName}::${normalizedEmail}`;
    if (idempotencyRef.current?.signature === signature) {
      return idempotencyRef.current.key;
    }
    const freshKey = crypto.randomUUID();
    idempotencyRef.current = { signature, key: freshKey };
    return freshKey;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (isPreviewMode) {
      setSubmitError(
        'Preview mode is read-only. Click "Use live schedule" above to connect to clinic_api and submit a real booking.',
      );
      return;
    }

    const form = formRef.current;
    if (form && !form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLElement>(
        "input:invalid, select:invalid, textarea:invalid",
      );
      firstInvalid?.focus();
      return;
    }

    if (!activeSelectedSlot) {
      setSubmitError("Select an open appointment window above before confirming.");
      return;
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const idempotencyKey = getOrCreateIdempotencyKey(
      activeSelectedSlot.id,
      trimmedName,
      normalizedEmail,
    );

    setSubmitting(true);
    try {
      const created = await createBooking(
        {
          slot_id: activeSelectedSlot.id,
          name: trimmedName,
          email: normalizedEmail,
        },
        idempotencyKey,
      );
      idempotencyRef.current = null;
      setConfirmedBooking(created);
      onBookingCreated(created);
      await onRefresh();
    } catch (error) {
      if (error instanceof ClinicApiError) {
        if (error.status === 429) {
          const waitSeconds = error.retryAfterSeconds ?? 60;
          setRateLimitUntil(Date.now() + waitSeconds * 1000);
          setSubmitError(
            `Booking rate limit reached for ${normalizedEmail}. Wait ${waitSeconds}s before trying again.`,
          );
          return;
        }
        if (error.status === 409) {
          idempotencyRef.current = null;
          setSelectedSlotId("");
          setSubmitError(
            "That appointment window was just taken by another patient. The schedule has been updated—choose another open window.",
          );
          await onRefresh();
          return;
        }
        if (error.status === 422) {
          idempotencyRef.current = null;
          setSubmitError(
            "Your request details changed before confirmation completed. Click Confirm booking again to submit with a fresh request key.",
          );
          return;
        }
        if (error.status === 400 && error.message.includes("already started")) {
          setSelectedSlotId("");
          setSubmitError(
            "That appointment time has already started. Select a later window.",
          );
          await onRefresh();
          return;
        }
        setSubmitError(error.message);
        return;
      }

      setSubmitError("Unable to confirm the booking. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyBookingId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setCopiedId(false);
    }
  }

  function handleResetConfirmation() {
    setConfirmedBooking(null);
    setSelectedSlotId("");
    setSubmitError(null);
    setCopiedId(false);
  }

  const bookedSlotDetails = useMemo(() => {
    if (!confirmedBooking) {
      return null;
    }
    return slots.find((s) => s.id === confirmedBooking.slot_id) ?? null;
  }, [confirmedBooking, slots]);

  return (
    <section
      aria-labelledby={scheduleHeadingId}
      className="bg-[var(--bg-panel)] border border-[#c7d2dc] border-t-4 border-t-[var(--band-navy)] rounded-md"
    >
      {/* Top schedule header */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-7 border-b border-[var(--border-subtle)]">
        <div>
          <h2
            id={scheduleHeadingId}
            className="text-xl font-semibold tracking-tight text-[var(--ink)]"
          >
            Available schedule
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            {isPreviewMode
              ? `Sample preview schedule — times shown in ${timezoneLabel}`
              : `${totalOpenCount} open ${totalOpenCount === 1 ? "window" : "windows"} in ${timezoneLabel}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isPreviewMode ? (
            <button
              type="button"
              onClick={onExitPreview}
              className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[var(--border-control)] bg-[var(--bg-panel)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
            >
              Use live schedule
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
              className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[var(--border-control)] bg-[var(--bg-panel)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loading ? "Refreshing..." : "Refresh schedule"}
            </button>
          )}
        </div>
      </div>

      {/* Confirmed slip view */}
      {confirmedBooking ? (
        <div className="p-5 sm:p-7">
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-[#9fd0cc] bg-[var(--accent-soft)] p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[var(--accent)]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-[var(--ink)]">
                  Appointment confirmed
                </h3>
              </div>
              <span className="inline-flex items-center rounded-full bg-[var(--accent)] px-3 py-0.5 text-xs font-medium text-white">
                Confirmed
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#bddbd8] pt-4 text-sm">
              <div>
                <dt className="text-[var(--ink-secondary)]">Patient</dt>
                <dd className="mt-0.5 font-medium text-[var(--ink)]">
                  {confirmedBooking.name}
                </dd>
                <dd className="text-[var(--ink-secondary)]">
                  {confirmedBooking.email}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ink-secondary)]">Visit window</dt>
                <dd className="mt-0.5 font-medium text-[var(--ink)] tabular-nums">
                  {bookedSlotDetails
                    ? `${formatProviderName(bookedSlotDetails.provider)} (${formatDateTimeReadable(bookedSlotDetails.start)})`
                    : `Slot ${confirmedBooking.slot_id}`}
                </dd>
                <dd className="text-xs text-[var(--ink-secondary)] tabular-nums">
                  Booked{" "}
                  {isHydrated
                    ? formatDateTimeReadable(confirmedBooking.created_at)
                    : `${confirmedBooking.created_at.slice(0, 16).replace("T", " ")} UTC`}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--ink-secondary)]">Booking ID</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2.5">
                  <code className="rounded border border-[#b4cfcc] bg-white px-2.5 py-1 text-sm text-[var(--ink)] tabular-nums break-all">
                    {confirmedBooking.id}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopyBookingId(confirmedBooking.id)}
                    className="clinical-touch-target inline-flex items-center rounded border border-[var(--border-control)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] cursor-pointer"
                  >
                    {copiedId ? "Copied" : "Copy ID"}
                  </button>
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#bddbd8] pt-4">
              <a
                href="#manage"
                onClick={() => onInspectBooking(confirmedBooking)}
                className="clinical-touch-target inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] transition-colors"
              >
                Manage or cancel booking
              </a>
              <button
                type="button"
                onClick={handleResetConfirmation}
                className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[var(--border-control)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
              >
                Book another visit
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {/* Clinician and availability filters */}
          {slots.length > 0 && (
            <div className="px-5 py-4 sm:px-7 bg-[#fafbfc] flex flex-col md:flex-row md:items-end justify-between gap-4">
              {providers.length > 0 &&
                (providers.length <= 5 ? (
                  <fieldset>
                    <legend className="text-sm font-medium text-[var(--ink)] mb-2.5">
                      Filter by clinician
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      <label
                        className={`clinical-touch-target inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium cursor-pointer transition-colors ${
                          selectedProvider === ""
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                            : "border-[var(--border-control)] bg-white text-[var(--ink)] hover:bg-[var(--bg-muted)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="clinician-filter"
                          value=""
                          checked={selectedProvider === ""}
                          onChange={() => onProviderChange("")}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        <span>All clinicians</span>
                      </label>
                      {providers.map((provider) => {
                        const active = selectedProvider === provider;
                        return (
                          <label
                            key={provider}
                            className={`clinical-touch-target inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium cursor-pointer transition-colors ${
                              active
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                                : "border-[var(--border-control)] bg-white text-[var(--ink)] hover:bg-[var(--bg-muted)]"
                            }`}
                          >
                            <input
                              type="radio"
                              name="clinician-filter"
                              value={provider}
                              checked={active}
                              onChange={() => onProviderChange(provider)}
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                            <span>{formatProviderName(provider)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : (
                  <div className="max-w-xs">
                    <label
                      htmlFor={providerSelectId}
                      className="block text-sm font-medium text-[var(--ink)] mb-1.5"
                    >
                      Filter by clinician
                    </label>
                    <select
                      id={providerSelectId}
                      value={selectedProvider}
                      onChange={(e) => onProviderChange(e.target.value)}
                      className="clinical-input"
                    >
                      <option value="">All clinicians</option>
                      {providers.map((provider) => (
                        <option key={provider} value={provider}>
                          {formatProviderName(provider)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

              <label className="clinical-touch-target inline-flex items-center gap-2 rounded-md border border-[var(--border-control)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer shrink-0 self-start md:self-end">
                <input
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>Available only</span>
              </label>
            </div>
          )}

          {/* Schedule list or API connection guidance */}
          <div className="px-5 py-5 sm:px-7">
            {loading && slots.length === 0 ? (
              <div className="py-6 space-y-3" aria-busy="true">
                <p className="text-sm font-medium text-[var(--ink)]">
                  Loading live appointment windows...
                </p>
                {showWakingNotice && (
                  <p className="text-sm text-[var(--ink-secondary)] prose-measure">
                    Waking the clinic scheduling server after idle time. Cold
                    starts can take up to 30 seconds.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="h-16 rounded-md bg-[var(--bg-muted)]" />
                  <div className="h-16 rounded-md bg-[var(--bg-muted)]" />
                  <div className="h-16 rounded-md bg-[var(--bg-muted)]" />
                  <div className="h-16 rounded-md bg-[var(--bg-muted)]" />
                </div>
              </div>
            ) : loadError && slots.length === 0 && scheduleErrorCopy ? (
              <div
                role="status"
                className="rounded-md border border-[#d6b69d] bg-[#fdf8f3] p-5"
              >
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  {scheduleErrorCopy.title}
                </h3>
                <p className="mt-1.5 text-sm text-[var(--ink-secondary)] prose-measure">
                  {scheduleErrorCopy.detail}
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => void onRefresh()}
                    className="clinical-touch-target inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                  >
                    Retry connection
                  </button>
                  <button
                    type="button"
                    onClick={onEnablePreview}
                    className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[var(--border-control)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] cursor-pointer"
                  >
                    Preview sample schedule
                  </button>
                </div>
              </div>
            ) : groupedByDay.length === 0 ? (
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-5">
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  {openOnly && slots.length > 0
                    ? "No open windows match your filter"
                    : "No appointment windows posted"}
                </h3>
                <p className="mt-1.5 text-sm text-[var(--ink-secondary)] prose-measure">
                  {openOnly && slots.length > 0
                    ? selectedProvider
                      ? `All listed slots for ${formatProviderName(selectedProvider)} are currently booked or already started.`
                      : "All currently listed appointment windows are booked or have already started."
                    : selectedProvider
                      ? `No slots are currently listed for ${formatProviderName(selectedProvider)}.`
                      : "No clinic slots are posted yet. Refresh after adding schedule windows (or seeding slots via POST /reset in clinic_api)."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {openOnly && slots.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenOnly(false)}
                      className="clinical-touch-target inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                    >
                      Show all windows
                    </button>
                  )}
                  {selectedProvider ? (
                    <button
                      type="button"
                      onClick={() => onProviderChange("")}
                      className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[var(--border-control)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] cursor-pointer"
                    >
                      Show all clinicians
                    </button>
                  ) : (
                    !openOnly && (
                      <>
                        <button
                          type="button"
                          onClick={() => void onRefresh()}
                          className="clinical-touch-target inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                        >
                          Refresh schedule
                        </button>
                        <button
                          type="button"
                          onClick={onEnablePreview}
                          className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[var(--border-control)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] cursor-pointer"
                        >
                          Preview sample schedule
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>
            ) : (
              <fieldset>
                <legend className="visually-hidden">
                  Select an open appointment time
                </legend>
                {isPreviewMode && (
                  <div className="mb-4 rounded-md border border-[#d6b69d] bg-[#fdf8f3] px-3.5 py-2.5 text-sm text-[var(--ink)]">
                    Showing a read-only sample schedule while the live clinic API
                    is offline.
                  </div>
                )}
                <div className="space-y-6">
                  {groupedByDay.map((group) => (
                    <div key={group.dayKey}>
                      <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                        <h3 className="text-sm font-semibold text-[var(--ink)]">
                          {group.label}
                        </h3>
                        <span className="text-xs font-medium text-[var(--ink-secondary)] tabular-nums">
                          {group.openCount} open
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {group.slots.map((slot) => {
                          const isPast =
                            isHydrated &&
                            new Date(slot.start).getTime() <= Date.now();
                          const selectable = slot.available && !isPast;
                          const isSelected =
                            selectable && selectedSlotId === slot.id;
                          const statusLabel = !slot.available
                            ? "Booked"
                            : isPast
                              ? "Started"
                              : isSelected
                                ? "Selected"
                                : "Open";

                          return (
                            <label
                              key={slot.id}
                              data-selected={isSelected ? "true" : "false"}
                              className={`slot-option-card clinical-touch-target flex items-center justify-between gap-3 rounded-md border px-3.5 py-3 transition-colors ${
                                !selectable
                                  ? "border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--ink-secondary)] cursor-not-allowed opacity-75"
                                  : isSelected
                                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)] cursor-pointer ring-1 ring-[var(--accent)]"
                                    : "border-[var(--border-control)] bg-white text-[var(--ink)] hover:bg-[#f0f6f6] cursor-pointer"
                              }`}
                            >
                              <span className="flex items-start gap-2.5 min-w-0">
                                <input
                                  type="radio"
                                  name="slot_id"
                                  value={slot.id}
                                  checked={isSelected}
                                  disabled={!selectable}
                                  onChange={() => {
                                    setSelectedSlotId(slot.id);
                                    setSubmitError(null);
                                  }}
                                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold tabular-nums">
                                    {isHydrated
                                      ? formatTimeRange(slot.start, slot.end)
                                      : `${slot.start.slice(11, 16)} – ${slot.end.slice(11, 16)} UTC`}
                                  </span>
                                  <span className="block text-xs text-[var(--ink-secondary)] truncate">
                                    {formatProviderName(slot.provider)}
                                  </span>
                                </span>
                              </span>

                              <span
                                className={`shrink-0 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                                  !selectable
                                    ? "bg-white/80 text-[var(--ink-secondary)] border border-[var(--border-subtle)]"
                                    : isSelected
                                      ? "bg-[var(--accent)] text-white"
                                      : "bg-[#ebf5f4] text-[#094c4c] border border-[#b4d7d4]"
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          {/* Reservation form */}
          <form
            ref={formRef}
            onSubmit={(e) => void handleSubmit(e)}
            aria-labelledby={formHeadingId}
            className="px-5 py-6 sm:px-7 bg-[#fafbfc]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3
                id={formHeadingId}
                className="text-base font-semibold text-[var(--ink)]"
              >
                Patient details
              </h3>
              {activeSelectedSlot ? (
                <p className="text-sm font-medium text-[var(--accent)] tabular-nums">
                  {formatProviderName(activeSelectedSlot.provider)} —{" "}
                  {isHydrated
                    ? `${formatDayHeading(activeSelectedSlot.start)}, ${formatTimeRange(activeSelectedSlot.start, activeSelectedSlot.end)}`
                    : activeSelectedSlot.start}
                </p>
              ) : (
                <p className="text-sm text-[var(--ink-secondary)]">
                  Select an open window above to assign a time
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={nameId}
                  className="block text-sm font-medium text-[var(--ink)] mb-1.5"
                >
                  Full name{" "}
                  <span aria-hidden="true" className="text-[var(--danger)]">
                    *
                  </span>
                </label>
                <input
                  id={nameId}
                  name="name"
                  type="text"
                  autoComplete="name"
                  enterKeyHint="next"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSubmitError(null);
                  }}
                  data-error={nameErrorId}
                  className="clinical-input"
                  placeholder="Alice Johnson"
                />
                <div id={nameErrorId} className="field-error-msg">
                  <span role="img" aria-label="Error">
                    !
                  </span>
                  <span>Enter the patient&apos;s full name.</span>
                </div>
              </div>

              <div>
                <label
                  htmlFor={emailId}
                  className="block text-sm font-medium text-[var(--ink)]"
                >
                  Email address{" "}
                  <span aria-hidden="true" className="text-[var(--danger)]">
                    *
                  </span>
                </label>
                <span
                  id={emailHintId}
                  className="block text-xs text-[var(--ink-secondary)] mt-0.5 mb-1.5"
                >
                  Format: patient@example.com
                </span>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="done"
                  required
                  aria-describedby={emailHintId}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSubmitError(null);
                  }}
                  data-error={emailErrorId}
                  className="clinical-input"
                  placeholder="alice@example.com"
                />
                <div id={emailErrorId} className="field-error-msg">
                  <span role="img" aria-label="Error">
                    !
                  </span>
                  <span>
                    Enter an email address in the format patient@example.com.
                  </span>
                </div>
              </div>
            </div>

            {submitError && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-[#f5c2be] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
              >
                <p className="font-medium">{submitError}</p>
                {rateLimitRemainingSeconds > 0 && (
                  <p className="mt-1 tabular-nums">
                    Retry window opens in {rateLimitRemainingSeconds}s.
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--ink-secondary)]">
                Up to 5 booking attempts per minute per email address.
              </p>
              <button
                type="submit"
                disabled={submitting || rateLimitRemainingSeconds > 0}
                className="clinical-touch-target inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting
                  ? "Confirming..."
                  : rateLimitRemainingSeconds > 0
                    ? `Wait ${rateLimitRemainingSeconds}s`
                    : "Confirm booking"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
