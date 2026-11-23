// Motion tokens (DESIGN.md "Motion"): one easing, a small spring for pops, three durations.
export const EASE = [0.2, 0.8, 0.2, 1];
export const SPRING = [0.34, 1.36, 0.64, 1];
export const T_PRESS = 0.12;
export const T_STATE = 0.2;
export const T_SHEET = 0.28;

export const stateTransition = { duration: T_STATE, ease: EASE };
export const sheetTransition = { duration: T_SHEET, ease: EASE };

/**
 * Rows that can be added or removed: spread onto an `m.li` inside
 * <AnimatePresence initial={false} mode="popLayout">. New rows fade down into place,
 * removed rows fade out and the rows below slide up to close the gap.
 */
export const listItemMotion = {
  layout: 'position',
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, transition: { duration: T_STATE * 0.8, ease: EASE } },
  transition: { duration: T_STATE + 0.04, ease: EASE, layout: { duration: T_SHEET, ease: EASE } },
};
