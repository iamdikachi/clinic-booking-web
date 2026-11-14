"use client";

import { useEffect, type RefObject } from "react";

type ValidatableControl =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

function isControl(target: EventTarget | null): target is ValidatableControl {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function getOrCreateLiveRegion(): HTMLDivElement {
  const existing = document.getElementById("clinical-form-announcer");
  if (existing instanceof HTMLDivElement) {
    return existing;
  }
  const region = document.createElement("div");
  region.id = "clinical-form-announcer";
  region.setAttribute("aria-live", "polite");
  region.className = "visually-hidden";
  document.body.append(region);
  return region;
}

function linkErrorToControl(el: ValidatableControl, shown: boolean): void {
  const errorId = el.dataset.error;
  if (!errorId) {
    return;
  }
  const ids = (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) {
    ids.push(errorId);
  }
  if (ids.length > 0) {
    el.setAttribute("aria-describedby", ids.join(" "));
  } else {
    el.removeAttribute("aria-describedby");
  }
}

function readSpokenText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  clone.querySelectorAll('[role="img"][aria-label]').forEach((n) => {
    n.replaceWith(`${n.getAttribute("aria-label")}: `);
  });
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Keeps aria-invalid, aria-describedby, fallback validation classes, and a single
 * polite live region synchronized with native CSS :user-invalid after interaction.
 */
export function useAccessibleFormSync(
  formRef: RefObject<HTMLFormElement | null>,
): void {
  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const supportsUserInvalid =
      typeof CSS !== "undefined" && CSS.supports("selector(:user-invalid)");
    const dirtyState = new WeakMap<
      ValidatableControl,
      { hasInteracted: boolean; hasBlurred: boolean }
    >();
    const flagged = new WeakSet<ValidatableControl>();
    const announced = new WeakSet<ValidatableControl>();
    const announcer = getOrCreateLiveRegion();
    let announceTimer: number | undefined;
    let announcedField: ValidatableControl | undefined;

    const announceError = (el: ValidatableControl) => {
      const errorId = el.dataset.error;
      if (!errorId) {
        return;
      }
      const errorEl = document.getElementById(errorId);
      if (!errorEl) {
        return;
      }
      const labelEl = el.labels?.[0];
      const prefix = labelEl ? `${readSpokenText(labelEl)}: ` : "";
      window.clearTimeout(announceTimer);
      announcer.textContent = "";
      announcedField = el;
      announceTimer = window.setTimeout(() => {
        announcer.textContent = prefix + readSpokenText(errorEl);
      }, 500);
    };

    const syncControl = (el: ValidatableControl, announce = false) => {
      let isInvalid = false;

      if (supportsUserInvalid) {
        isInvalid = el.matches(":user-invalid");
      } else {
        const state = dirtyState.get(el);
        if (state?.hasInteracted && state.hasBlurred) {
          isInvalid = !el.validity.valid;
          el.classList.toggle("user-invalid-fallback", isInvalid);
          el.classList.toggle("user-valid-fallback", !isInvalid);
        }
      }

      if (isInvalid) {
        if (announce && !announced.has(el)) {
          announceError(el);
          announced.add(el);
        }
        el.setAttribute("aria-invalid", "true");
        linkErrorToControl(el, true);
        flagged.add(el);
      } else if (flagged.has(el) || el.getAttribute("aria-invalid") !== "true") {
        el.setAttribute("aria-invalid", "false");
        linkErrorToControl(el, false);
        flagged.delete(el);
        announced.delete(el);
        if (announcedField === el) {
          window.clearTimeout(announceTimer);
          announcer.textContent = "";
        }
      }
    };

    // Initialize every control to aria-invalid="false" to prevent premature screen-reader announcements.
    form
      .querySelectorAll("input, select, textarea")
      .forEach((node) => {
        if (isControl(node)) {
          node.setAttribute("aria-invalid", "false");
        }
      });

    const onBlur = (e: FocusEvent) => {
      if (!isControl(e.target)) {
        return;
      }
      if (!supportsUserInvalid) {
        const prev = dirtyState.get(e.target) ?? {
          hasInteracted: false,
          hasBlurred: false,
        };
        prev.hasBlurred = true;
        dirtyState.set(e.target, prev);
      }
      syncControl(e.target, true);
    };

    const onInput = (e: Event) => {
      if (!isControl(e.target)) {
        return;
      }
      if (!supportsUserInvalid) {
        const prev = dirtyState.get(e.target) ?? {
          hasInteracted: false,
          hasBlurred: false,
        };
        prev.hasInteracted = true;
        dirtyState.set(e.target, prev);
      }
      if (e.target.hasAttribute("aria-invalid")) {
        syncControl(e.target, false);
      }
    };

    const onChange = (e: Event) => {
      if (!isControl(e.target)) {
        return;
      }
      if (!supportsUserInvalid) {
        const prev = dirtyState.get(e.target) ?? {
          hasInteracted: false,
          hasBlurred: false,
        };
        prev.hasInteracted = true;
        dirtyState.set(e.target, prev);
      }
      syncControl(e.target, true);
    };

    const onInvalid = (e: Event) => {
      if (!isControl(e.target)) {
        return;
      }
      if (!supportsUserInvalid) {
        dirtyState.set(e.target, { hasInteracted: true, hasBlurred: true });
      }
      announced.add(e.target);
      syncControl(e.target, false);
    };

    const onReset = () => {
      window.setTimeout(() => {
        form
          .querySelectorAll("input, select, textarea")
          .forEach((node) => {
            if (isControl(node)) {
              dirtyState.delete(node);
              node.classList.remove("user-invalid-fallback", "user-valid-fallback");
              flagged.delete(node);
              announced.delete(node);
              syncControl(node, false);
            }
          });
      });
    };

    form.addEventListener("blur", onBlur, true);
    form.addEventListener("input", onInput);
    form.addEventListener("change", onChange, true);
    form.addEventListener("invalid", onInvalid, true);
    form.addEventListener("reset", onReset, true);

    return () => {
      window.clearTimeout(announceTimer);
      form.removeEventListener("blur", onBlur, true);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onChange, true);
      form.removeEventListener("invalid", onInvalid, true);
      form.removeEventListener("reset", onReset, true);
    };
  }, [formRef]);
}
