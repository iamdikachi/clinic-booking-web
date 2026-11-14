import type { Slot } from "./clinic-api";

/**
 * Generates read-only sample slots relative to the browser's current date
 * so visitors can preview the booking layout when clinic_api is offline.
 */
export function buildPreviewSampleSlots(now: Date = new Date()): Slot[] {
  const baseDay = new Date(now);
  baseDay.setDate(baseDay.getDate() + 1);
  baseDay.setHours(9, 0, 0, 0);

  const dayTwo = new Date(baseDay);
  dayTwo.setDate(dayTwo.getDate() + 1);

  const makeSlot = (
    id: string,
    provider: string,
    day: Date,
    hour: number,
    minute: number,
    available: boolean,
  ): Slot => {
    const start = new Date(day);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    return {
      id,
      provider,
      start: start.toISOString(),
      end: end.toISOString(),
      available,
    };
  };

  return [
    makeSlot("preview-1", "dr-claire-bennett", baseDay, 9, 0, true),
    makeSlot("preview-2", "dr-claire-bennett", baseDay, 9, 30, false),
    makeSlot("preview-3", "dr-claire-bennett", baseDay, 10, 30, true),
    makeSlot("preview-4", "dr-samuel-okafor", baseDay, 11, 0, true),
    makeSlot("preview-5", "dr-samuel-okafor", baseDay, 14, 0, true),
    makeSlot("preview-6", "dr-hana-alvarez", baseDay, 15, 30, true),
    makeSlot("preview-7", "dr-claire-bennett", dayTwo, 9, 0, true),
    makeSlot("preview-8", "dr-samuel-okafor", dayTwo, 10, 0, false),
    makeSlot("preview-9", "dr-hana-alvarez", dayTwo, 11, 30, true),
    makeSlot("preview-10", "dr-hana-alvarez", dayTwo, 14, 30, true),
  ];
}
