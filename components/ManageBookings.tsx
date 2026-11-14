"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  cancelBookingById,
  ClinicApiError,
  fetchBookingById,
  formatDateTimeReadable,
  formatProviderName,
  listBookingsByEmail,
  type Booking,
  type Slot,
} from "@/lib/clinic-api";
import { useAccessibleFormSync } from "./useAccessibleFormSync";
import { useIsHydrated } from "./useIsHydrated";

/** Imperative handle allowing parent click handlers to pre-fill a booking inspection. */
export interface ManageBookingsHandle {
  inspectBooking: (booking: Booking) => void;
}

interface ManageBookingsProps {
  slots: Slot[];
  recentBookings: Booking[];
  manageRef: RefObject<ManageBookingsHandle | null>;
  onBookingCancelled: (booking: Booking) => void;
}

type LookupMode = "email" | "id";

export function ManageBookings({
  slots,
  recentBookings,
  manageRef,
  onBookingCancelled,
}: ManageBookingsProps) {
  const isHydrated = useIsHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useAccessibleFormSync(formRef);

  const headingId = useId();
  const formHeadingId = useId();
  const queryId = useId();
  const queryHintId = useId();
  const queryErrorId = useId();
  const dialogTitleId = useId();

  const [mode, setMode] = useState<LookupMode>("email");
  const [queryValue, setQueryValue] = useState("");
  const [searchedLabel, setSearchedLabel] = useState<string | null>(null);
  const [results, setResults] = useState<Booking[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [bookingPendingCancel, setBookingPendingCancel] =
    useState<Booking | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Allow "Manage or cancel booking" button to surface a booking without syncing state in an effect.
  useImperativeHandle(manageRef, () => ({
    inspectBooking(booking: Booking) {
      setMode("email");
      setQueryValue(booking.email);
      setSearchedLabel(booking.email);
      setResults((prev) => {
        const exists = prev.some((b) => b.id === booking.id);
        return exists ? prev : [booking, ...prev];
      });
      setLookupError(null);
    },
  }));

  // Progressive enhancement fallback for browsers without <dialog closedby="any">
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) {
      return;
    }
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  async function runLookup(targetMode: LookupMode, rawInput: string) {
    const trimmed = rawInput.trim();
    setLookupError(null);
    setActionMessage(null);
    setSearching(true);
    setNextCursor(null);

    try {
      if (targetMode === "email") {
        const res = await listBookingsByEmail(trimmed, { limit: 10 });
        setResults(res.bookings);
        setNextCursor(res.next_cursor);
        setSearchedLabel(trimmed.toLowerCase());
      } else {
        const booking = await fetchBookingById(trimmed);
        setResults([booking]);
        setNextCursor(null);
        setSearchedLabel(booking.id);
      }
    } catch (error) {
      setResults([]);
      if (error instanceof ClinicApiError) {
        if (error.status === 404) {
          setLookupError(
            `No booking found with ID "${trimmed}". Check the reference on your confirmation slip.`,
          );
          return;
        }
        setLookupError(error.message);
        return;
      }
      setLookupError("Unable to look up bookings right now. Check your connection.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (form && !form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLElement>("input:invalid");
      firstInvalid?.focus();
      return;
    }
    await runLookup(mode, queryValue);
  }

  async function handleLoadMore() {
    if (!nextCursor || !searchedLabel || mode !== "email") {
      return;
    }
    setLoadingMore(true);
    setLookupError(null);
    try {
      const res = await listBookingsByEmail(searchedLabel, {
        limit: 10,
        cursor: nextCursor,
      });
      setResults((prev) => [...prev, ...res.bookings]);
      setNextCursor(res.next_cursor);
    } catch (error) {
      if (error instanceof ClinicApiError) {
        setLookupError(error.message);
      } else {
        setLookupError("Unable to load additional bookings.");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  function openCancelDialog(booking: Booking) {
    setBookingPendingCancel(booking);
    setActionMessage(null);
    dialogRef.current?.showModal();
  }

  async function executeCancel(booking: Booking) {
    setCancellingId(booking.id);
    setLookupError(null);
    try {
      const cancelled = await cancelBookingById(booking.id);
      setResults((prev) =>
        prev.map((item) => (item.id === cancelled.id ? cancelled : item)),
      );
      onBookingCancelled(cancelled);
      setActionMessage(
        `Booking ${cancelled.id} was cancelled and the appointment window is open again.`,
      );
    } catch (error) {
      if (error instanceof ClinicApiError) {
        setLookupError(error.message);
      } else {
        setLookupError("Unable to cancel this booking. Try again.");
      }
    } finally {
      setCancellingId(null);
    }
  }

  function handleDialogClose() {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const action = dialog.returnValue;
    dialog.returnValue = "";
    const target = bookingPendingCancel;
    setBookingPendingCancel(null);
    if (action === "confirm-cancel" && target) {
      void executeCancel(target);
    }
  }

  function describeSlot(slotId: string): string {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) {
      return `Slot ${slotId}`;
    }
    const when = isHydrated ? formatDateTimeReadable(slot.start) : slot.start;
    return `${formatProviderName(slot.provider)} (${when})`;
  }

  return (
    <section
      id="manage"
      aria-labelledby={headingId}
      className="navy-surface bg-[var(--band-navy)] text-white border-y border-[#1e465b]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left column: lookup controls */}
          <div className="lg:col-span-5">
            <h2
              id={headingId}
              className="font-display-heading text-3xl sm:text-4xl font-normal tracking-tight text-white"
            >
              Manage an existing booking
            </h2>
            <p className="mt-3 text-base text-[#c5d5e0] prose-measure">
              Check upcoming visit times or release an appointment slot so another patient can take it.
            </p>

            {/* Lookup mode switch */}
            <div
              role="group"
              aria-label="Lookup method"
              className="mt-6 inline-flex rounded-md border border-[#3a6176] bg-[#0b222e] p-1"
            >
              <button
                type="button"
                aria-pressed={mode === "email"}
                onClick={() => {
                  setMode("email");
                  setQueryValue("");
                  setLookupError(null);
                }}
                className={`clinical-touch-target rounded px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  mode === "email"
                    ? "bg-[#7ce0dc] text-[#0b222e]"
                    : "text-[#d7e5ee] hover:text-white"
                }`}
              >
                By email
              </button>
              <button
                type="button"
                aria-pressed={mode === "id"}
                onClick={() => {
                  setMode("id");
                  setQueryValue("");
                  setLookupError(null);
                }}
                className={`clinical-touch-target rounded px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  mode === "id"
                    ? "bg-[#7ce0dc] text-[#0b222e]"
                    : "text-[#d7e5ee] hover:text-white"
                }`}
              >
                By booking ID
              </button>
            </div>

            <form
              ref={formRef}
              onSubmit={(e) => void handleSubmit(e)}
              aria-labelledby={formHeadingId}
              className="mt-5 space-y-4"
            >
              <h3 id={formHeadingId} className="visually-hidden">
                Search bookings
              </h3>
              <div>
                <label
                  htmlFor={queryId}
                  className="block text-sm font-medium text-white"
                >
                  {mode === "email" ? "Patient email address" : "Booking ID"}
                </label>
                <span
                  id={queryHintId}
                  className="block text-xs text-[#c5d5e0] mt-0.5 mb-1.5"
                >
                  {mode === "email"
                    ? "Format: patient@example.com"
                    : "Paste the UUID from your confirmation slip."}
                </span>
                <input
                  id={queryId}
                  name="lookupQuery"
                  type={mode === "email" ? "email" : "text"}
                  autoComplete={mode === "email" ? "email" : "off"}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-describedby={queryHintId}
                  data-error={queryErrorId}
                  value={queryValue}
                  onChange={(e) => {
                    setQueryValue(e.target.value);
                    setLookupError(null);
                  }}
                  placeholder={
                    mode === "email"
                      ? "alice@example.com"
                      : "550e8400-e29b-41d4-a716-446655440000"
                  }
                  className="clinical-input"
                />
                <div id={queryErrorId} className="field-error-msg">
                  <span role="img" aria-label="Error">
                    !
                  </span>
                  <span>
                    {mode === "email"
                      ? "Enter an email address in the format patient@example.com."
                      : "Enter a booking ID."}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={searching}
                className="clinical-touch-target inline-flex items-center justify-center rounded-md bg-[#7ce0dc] px-5 py-2.5 text-sm font-semibold text-[#0b222e] hover:bg-[#9aeae7] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {searching ? "Searching..." : "Find bookings"}
              </button>
            </form>

            {recentBookings.length > 0 && (
              <div className="mt-6 pt-5 border-t border-[#264b5f]">
                <p className="text-xs font-medium text-[#c5d5e0]">
                  Booked in this session
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {recentBookings.slice(0, 3).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setMode("email");
                        setQueryValue(b.email);
                        void runLookup("email", b.email);
                      }}
                      className="clinical-touch-target inline-flex items-center rounded border border-[#4a7288] bg-[#143749] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1a465c] cursor-pointer"
                    >
                      {b.email}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: lookup results */}
          <div className="lg:col-span-7">
            <div className="rounded-md border border-[#2a546a] bg-[#143749] p-5 sm:p-6">
              {actionMessage && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-4 rounded-md border border-[#59b7b2] bg-[#0e3942] px-4 py-3 text-sm text-[#dff8f6]"
                >
                  {actionMessage}
                </div>
              )}

              {lookupError && (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-[#f5a7a1] bg-[#3b181d] px-4 py-3 text-sm text-[#fecaca]"
                >
                  {lookupError}
                </div>
              )}

              {searchedLabel === null ? (
                <div className="py-8 text-sm text-[#c5d5e0]">
                  <p className="font-medium text-white">
                    No appointment search run yet
                  </p>
                  <p className="mt-1.5 prose-measure">
                    Enter your email address to review all visits tied to your record, or look up a single visit by its booking ID.
                  </p>
                </div>
              ) : results.length === 0 && !searching && !lookupError ? (
                <div className="py-8 text-sm text-[#c5d5e0]">
                  <p className="font-medium text-white">
                    No bookings found for {searchedLabel}
                  </p>
                  <p className="mt-1.5">
                    Double-check the email address or reserve a new slot in the schedule above.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-baseline justify-between gap-2 pb-3 border-b border-[#2a546a]">
                    <h3 className="text-sm font-semibold text-white">
                      Results for {searchedLabel}
                    </h3>
                    <span className="text-xs text-[#c5d5e0] tabular-nums">
                      {results.length} {results.length === 1 ? "booking" : "bookings"}
                      {mode === "email" && results.length > 1 ? ", oldest first" : ""}
                    </span>
                  </div>

                  <ul className="divide-y divide-[#2a546a]">
                    {results.map((booking) => {
                      const isConfirmed = booking.status === "confirmed";
                      const busy = cancellingId === booking.id;
                      return (
                        <li
                          key={booking.id}
                          className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-sm font-semibold text-white tabular-nums">
                                {describeSlot(booking.slot_id)}
                              </span>
                              <span
                                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                                  isConfirmed
                                    ? "bg-[#144f4b] text-[#aef4ec] border border-[#3e9790]"
                                    : "bg-[#224557] text-[#c5d5e0] border border-[#446b80]"
                                }`}
                              >
                                {isConfirmed ? "Confirmed" : "Cancelled"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[#c5d5e0]">
                              {booking.name} ({booking.email})
                            </p>
                            <p className="mt-1 text-xs text-[#a9becb] tabular-nums">
                              Booked{" "}
                              {isHydrated
                                ? formatDateTimeReadable(booking.created_at)
                                : `${booking.created_at.slice(0, 16).replace("T", " ")} UTC`}
                            </p>
                            <p className="mt-0.5 text-xs text-[#a9becb] tabular-nums break-all">
                              ID: {booking.id}
                            </p>
                          </div>

                          {isConfirmed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openCancelDialog(booking)}
                              className="clinical-touch-target shrink-0 inline-flex items-center justify-center rounded-md border border-[#f5a7a1] bg-transparent px-3.5 py-2 text-xs font-semibold text-[#fecaca] hover:bg-[#5e1f26] disabled:opacity-60 transition-colors cursor-pointer"
                            >
                              {busy ? "Cancelling..." : "Cancel booking"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {nextCursor && (
                    <div className="mt-4 pt-3 border-t border-[#2a546a]">
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => void handleLoadMore()}
                        className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[#5f899f] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a465c] disabled:opacity-60 cursor-pointer"
                      >
                        {loadingMore ? "Loading..." : "Load more bookings"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Native <dialog> confirmation modal following modern-web-guidance */}
      <dialog
        ref={dialogRef}
        closedby="any"
        aria-labelledby={dialogTitleId}
        onClose={handleDialogClose}
        className="clinical-dialog"
      >
        <div className="p-6">
          <h3
            id={dialogTitleId}
            className="text-lg font-semibold text-[var(--ink)]"
          >
            Cancel this appointment?
          </h3>
          {bookingPendingCancel && (
            <p className="mt-2 text-sm text-[var(--ink-secondary)] prose-measure">
              This will release{" "}
              <strong className="font-medium text-[var(--ink)]">
                {describeSlot(bookingPendingCancel.slot_id)}
              </strong>{" "}
              for {bookingPendingCancel.name}. Another patient will be able to
              book this time immediately.
            </p>
          )}
          <form
            method="dialog"
            className="mt-6 flex flex-wrap justify-end gap-3"
          >
            <button
              type="submit"
              value="keep"
              autoFocus
              className="clinical-touch-target inline-flex items-center justify-center rounded-md border border-[var(--border-control)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)] cursor-pointer"
            >
              Keep booking
            </button>
            <button
              type="submit"
              value="confirm-cancel"
              className="clinical-touch-target inline-flex items-center justify-center rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white hover:bg-[#931c12] cursor-pointer"
            >
              Cancel appointment
            </button>
          </form>
        </div>
      </dialog>
    </section>
  );
}
