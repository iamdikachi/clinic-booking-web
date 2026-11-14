"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/** Returns true on the client after hydration and false during server rendering. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
