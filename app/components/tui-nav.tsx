"use client";

import { useEffect } from "react";

/**
 * App-wide TUI-style keyboard navigation.
 *
 * - ←↑↓→ and h/j/k/l move focus to the nearest control in that direction (spatially, so grids and lists both work).
 * - ENTER / SPACE activate the focused control (native for buttons; added for links, checkboxes and radios).
 * - Nothing is highlighted until the first move key, which lands on the first control on the page.
 *
 * Text fields keep their keys: h/j/k/l are typed as letters, ←/→ move the caret and only leave the field at its
 * start/end, ↑/↓ leave an input (a textarea only from its very start/end). From an unfocused page that has a text
 * field, h/j/k/l are left for typing (see useTypingFocus).
 *
 * Listens on `document` in the bubble phase, so element handlers and the ad overlay's window-capture key blocker
 * run first; it ignores events they already handled.
 */

type Dir = "up" | "down" | "left" | "right";

const ARROWS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const VIM: Record<string, Dir> = { k: "up", j: "down", h: "left", l: "right" };

const ITEMS = "button, a[href], input:not([type=hidden]), textarea, select, [data-nav]";
const NON_TEXT_INPUTS = new Set(["button", "submit", "reset", "checkbox", "radio", "file", "range", "color", "image"]);

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return (el as HTMLElement).isContentEditable;
}

function usable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if ((el as HTMLButtonElement).disabled || el.closest("[inert], [aria-hidden=true], fieldset:disabled")) return false;
  if (el.tabIndex < 0 && !el.hasAttribute("data-nav")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function items(): HTMLElement[] {
  return Array.from(document.querySelectorAll(ITEMS)).filter(usable);
}

type Cand = { el: HTMLElement; c: DOMRect; gap: number; side: number; dist: number };

const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 1;
const pick = (cs: Cand[]) => cs.reduce((a, b) => (b.side < a.side || (b.side === a.side && b.dist < a.dist) ? b : a)).el;

/**
 * Nearest item from `from` in direction `dir`, like a cursor in a text grid:
 * ↑/↓ go to the closest row in that direction, then the closest column within it;
 * ←/→ stay on the same row if anything there, otherwise take the closest item that way.
 */
function nearest(from: HTMLElement, dir: Dir, all: HTMLElement[]): HTMLElement | null {
  const r = from.getBoundingClientRect();
  const rcx = r.left + r.width / 2;
  const rcy = r.top + r.height / 2;
  const vertical = dir === "up" || dir === "down";
  const cands: Cand[] = [];

  for (const el of all) {
    if (el === from || el.contains(from) || from.contains(el)) continue;
    const c = el.getBoundingClientRect();
    if (dir === "down" ? c.top < rcy : dir === "up" ? c.bottom > rcy : dir === "right" ? c.left < rcx : c.right > rcx) continue;
    const gap = Math.max(0, dir === "down" ? c.top - r.bottom : dir === "up" ? r.top - c.bottom : dir === "right" ? c.left - r.right : r.left - c.right);
    const side = vertical ? Math.max(0, c.left - r.right, r.left - c.right) : Math.max(0, c.top - r.bottom, r.top - c.bottom);
    const dist = Math.hypot(c.left + c.width / 2 - rcx, c.top + c.height / 2 - rcy);
    cands.push({ el, c, gap, side, dist });
  }
  if (!cands.length) return null;

  if (vertical) {
    // The row = everything vertically overlapping the closest candidate in that direction.
    const first = cands.reduce((a, b) => (b.gap < a.gap || (b.gap === a.gap && b.dist < a.dist) ? b : a));
    return pick(cands.filter((x) => overlaps(x.c.top, x.c.bottom, first.c.top, first.c.bottom)));
  }
  const sameRow = cands.filter((x) => x.side === 0);
  if (sameRow.length) return sameRow.reduce((a, b) => (b.gap < a.gap || (b.gap === a.gap && b.dist < a.dist) ? b : a)).el;
  return cands.reduce((a, b) => (b.gap + b.side * 3 < a.gap + a.side * 3 ? b : a)).el;
}

/** Whether an arrow key pressed inside a text field should leave it rather than move the caret. */
function arrowLeavesField(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, dir: Dir): boolean {
  if (el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable) return false;
  let start: number | null = null;
  let end: number | null = null;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch {
    // Some input types (email, number) don't expose a selection: treat ↑/↓ as leaving, ←/→ as caret moves.
  }
  const len = el.value.length;
  const collapsed = start !== null && start === end;
  if (el instanceof HTMLTextAreaElement) {
    if (dir === "up") return collapsed && start === 0;
    if (dir === "down") return collapsed && start === len;
    return false;
  }
  if (dir === "up" || dir === "down") return true;
  if (!collapsed) return false;
  return dir === "left" ? start === 0 : start === len;
}

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function TuiNav() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const onItem = !!active && active !== document.body && active.matches(ITEMS) && usable(active);

      // ENTER toggles checkboxes/radios (instead of submitting their form); SPACE follows links.
      if ((e.key === "Enter" || e.key === " ") && onItem && !e.repeat) {
        const isToggle = active instanceof HTMLInputElement && (active.type === "checkbox" || active.type === "radio");
        if ((e.key === "Enter" && isToggle) || (e.key === " " && active instanceof HTMLAnchorElement)) {
          e.preventDefault();
          active.click();
        }
        return;
      }

      const vim = e.key in VIM;
      const dir = ARROWS[e.key] ?? (vim && !e.shiftKey ? VIM[e.key] : undefined);
      if (!dir) return;

      if (isTextField(active)) {
        if (vim || !arrowLeavesField(active, dir)) return;
      } else if (vim && !onItem && items().some(isTextField)) {
        return; // nothing focused but there is a field to type into: let the letter go there
      }

      const all = items();
      const target = onItem ? nearest(active!, dir, all) : all[0];
      const isRadio = active instanceof HTMLInputElement && active.type === "radio";
      // With nowhere to go, arrows still scroll the page; h/j/k/l and radios swallow the key either way
      // (so the letter isn't typed elsewhere and the radio group's selection doesn't change).
      if (target || vim || isRadio) e.preventDefault();
      if (target) focusEl(target);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
