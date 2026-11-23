import { forwardRef, useRef } from 'react';
import { AnimatePresence, useDragControls } from 'motion/react';
import * as m from 'motion/react-m';
import { EASE, T_SHEET, T_STATE } from '../lib/motion.js';

const SHIFT = 40; // px a tab travels when it slides in or out after a tap
const SWIPE_DISTANCE = 0.25; // share of the screen width a drag needs to change tab
const SWIPE_VELOCITY = 500; // px/s for a quick flick to count
const NO_SWIPE = 'input, textarea, select, [contenteditable], [data-no-swipe], .modal-backdrop';

/** True when the touch starts somewhere that already uses a sideways drag. */
function blocksSwipe(target, page) {
  if (!page.contains(target) || target.closest(NO_SWIPE)) return true;
  for (let el = target; el && el !== page; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const { overflowX } = getComputedStyle(el);
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
  }
  return false;
}

const variants = {
  enter: ({ dir }) => ({ x: dir * SHIFT, opacity: 0 }),
  center: { x: 0, y: 0, opacity: 1, transition: { duration: T_SHEET, ease: EASE } },
  exit: ({ dir, swipe, scroll }) => ({
    x: -dir * (swipe ? window.innerWidth * 0.5 : SHIFT),
    // The stage scrolls back to the top as the new tab arrives; hold the old one where it was.
    y: -scroll,
    opacity: 0,
    transition: { duration: T_STATE, ease: EASE, y: { duration: 0 } },
  }),
};

// forwardRef: AnimatePresence's popLayout mode measures the leaving page through this ref.
const TabPage = forwardRef(function TabPage({ custom, isFirst, isLast, onSwipe, children }, ref) {
  const controls = useDragControls();
  const pageRef = useRef(null);
  const setRef = (el) => {
    pageRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const dragged = useRef(false);

  const onPointerDown = (e) => {
    dragged.current = false;
    if (e.pointerType === 'mouse' || !e.isPrimary || blocksSwipe(e.target, pageRef.current)) return;
    controls.start(e);
  };

  const onDragEnd = (_, { offset, velocity }) => {
    const far = Math.abs(offset.x) > window.innerWidth * SWIPE_DISTANCE;
    const flick = Math.abs(velocity.x) > SWIPE_VELOCITY && Math.abs(offset.x) > 24 && Math.sign(velocity.x) === Math.sign(offset.x);
    if (!far && !flick) return;
    const step = offset.x < 0 ? 1 : -1;
    if ((step > 0 && isLast) || (step < 0 && isFirst)) return;
    onSwipe(step);
  };

  return (
    <m.div
      ref={setRef}
      className="tab-page"
      custom={custom}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      drag="x"
      dragListener={false}
      dragControls={controls}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: isLast ? 0.15 : 1, right: isFirst ? 0.15 : 1 }}
      dragMomentum={false}
      dragSnapToOrigin
      dragTransition={{ bounceStiffness: 400, bounceDamping: 36 }}
      onPointerDown={onPointerDown}
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={onDragEnd}
      onClickCapture={(e) => {
        // A swipe that ends over a button must not also press it.
        if (!dragged.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </m.div>
  );
});

/**
 * Tab content with a directional slide between tabs and a finger-following swipe.
 * `motion` = { dir, swipe, scroll } for the change that produced the current tab.
 */
export function TabPager({ tabs, active, motion, onSwipe, children }) {
  const index = Math.max(0, tabs.indexOf(active));
  return (
    <main className="content tab-stage">
      <AnimatePresence initial={false} mode="popLayout" custom={motion}>
        <TabPage key={active} custom={motion} isFirst={index === 0} isLast={index === tabs.length - 1} onSwipe={onSwipe}>
          {children}
        </TabPage>
      </AnimatePresence>
    </main>
  );
}
