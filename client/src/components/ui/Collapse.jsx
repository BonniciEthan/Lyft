import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { EASE, T_SHEET, T_STATE } from '../../lib/motion.js';

const variants = {
  open: { height: 'auto', opacity: 1, transition: { height: { duration: T_SHEET, ease: EASE }, opacity: { duration: T_STATE, delay: 0.04 } } },
  closed: { height: 0, opacity: 0, transition: { height: { duration: T_STATE + 0.04, ease: EASE }, opacity: { duration: T_STATE * 0.6 } } },
};

/** Expands and folds its content by animating height. Clips only while moving, so focus rings show. */
export function Collapse({ open, className, children }) {
  const [moving, setMoving] = useState(false);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          key="collapse"
          className={className}
          variants={variants}
          initial="closed"
          animate="open"
          exit="closed"
          style={{ overflow: moving ? 'hidden' : 'visible' }}
          onAnimationStart={() => setMoving(true)}
          onAnimationComplete={() => setMoving(false)}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}
