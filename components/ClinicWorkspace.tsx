"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClinicApiError,
  fetchSlots,
  type Booking,
  type Slot,
} from "@/lib/clinic-api";
import { buildPreviewSampleSlots } from "@/lib/sample-schedule";
import { BookingDesk } from "./BookingDesk";
import { ManageBookings, type ManageBookingsHandle } from "./ManageBookings";

function getScheduleLoadError(error: unknown): {
  message: string;
  code: string | null;
} {
  if (error instanceof ClinicApiError) {
    return { message: error.message, code: error.code };
  }
  return {
    message: "Unable to load the clinic schedule.",
    code: null,
  };
}

export function ClinicWorkspace() {
  const manageRef = useRef<ManageBookingsHandle>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);

  const loadLiveSlots = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadErrorCode(null);
    try {
      const liveSlots = await fetchSlots();
      setSlots(liveSlots);
      setIsPreviewMode(false);
    } catch (error) {
      const parsed = getScheduleLoadError(error);
      setLoadError(parsed.message);
      setLoadErrorCode(parsed.code);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const liveSlots = await fetchSlots();
        if (!active) {
          return;
        }
        setSlots(liveSlots);
        setLoadError(null);
        setLoadErrorCode(null);
        setIsPreviewMode(false);
      } catch (error) {
        if (!active) {
          return;
        }
        const parsed = getScheduleLoadError(error);
        setLoadError(parsed.message);
        setLoadErrorCode(parsed.code);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  function handleEnablePreview() {
    setIsPreviewMode(true);
    setLoadError(null);
    setLoadErrorCode(null);
    setSelectedProvider("");
    setSlots(buildPreviewSampleSlots());
  }

  function handleExitPreview() {
    setIsPreviewMode(false);
    setSlots([]);
    setSelectedProvider("");
    void loadLiveSlots();
  }

  function handleBookingCreated(booking: Booking) {
    setRecentBookings((prev) => [
      booking,
      ...prev.filter((item) => item.id !== booking.id),
    ]);
  }

  function handleBookingCancelled(booking: Booking) {
    setRecentBookings((prev) =>
      prev.map((item) => (item.id === booking.id ? booking : item)),
    );
    void loadLiveSlots();
  }

  return (
    <>
      <section
        id="book"
        aria-labelledby="hero-heading"
        className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 pb-14 sm:pt-14 sm:pb-20"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left column: clinical orientation & reception facts */}
          <div className="lg:col-span-5 lg:pt-2">
            <h1
              id="hero-heading"
              tabIndex={-1}
              className="font-display-heading text-[clamp(2.15rem,1.4rem+2.3vw,3.35rem)] font-normal leading-[1.08] tracking-[-0.02em] text-[var(--ink)]"
            >
              Same-week outpatient care, booked directly with your clinician.
            </h1>

            <p className="mt-5 text-base sm:text-[1.0625rem] leading-relaxed text-[var(--ink-secondary)] prose-measure">
              Select an open 30-minute consultation window on the schedule desk, enter your name and email, and receive a confirmed booking ID immediately—without creating an account or waiting on hold.
            </p>

            <dl className="mt-8 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-sm">
              <div className="py-3.5 grid grid-cols-[7.5rem_1fr] gap-4">
                <dt className="font-medium text-[var(--ink)]">Clinic hours</dt>
                <dd className="text-[var(--ink-secondary)] tabular-nums">
                  Monday – Saturday, 08:00 – 18:00
                </dd>
              </div>
              <div className="py-3.5 grid grid-cols-[7.5rem_1fr] gap-4">
                <dt className="font-medium text-[var(--ink)]">Visit format</dt>
                <dd className="text-[var(--ink-secondary)]">
                  30-minute primary care and follow-up consultations
                </dd>
              </div>
              <div className="py-3.5 grid grid-cols-[7.5rem_1fr] gap-4">
                <dt className="font-medium text-[var(--ink)]">Cancellations</dt>
                <dd className="text-[var(--ink-secondary)]">
                  Self-service anytime below using your email or booking ID
                </dd>
              </div>
            </dl>
          </div>

          {/* Right column: live interactive reception desk */}
          <div className="lg:col-span-7">
            <BookingDesk
              slots={slots}
              loading={loading}
              loadError={loadError}
              loadErrorCode={loadErrorCode}
              isPreviewMode={isPreviewMode}
              selectedProvider={selectedProvider}
              onProviderChange={setSelectedProvider}
              onRefresh={loadLiveSlots}
              onEnablePreview={handleEnablePreview}
              onExitPreview={handleExitPreview}
              onBookingCreated={handleBookingCreated}
              onInspectBooking={(booking) => manageRef.current?.inspectBooking(booking)}
            />
          </div>
        </div>
      </section>

      <ManageBookings
        slots={slots}
        recentBookings={recentBookings}
        manageRef={manageRef}
        onBookingCancelled={handleBookingCancelled}
      />
    </>
  );
}
