import React from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import App from './App.jsx';
import { stateTransition } from './lib/motion.js';
import './styles.css';
import { registerOfflineSupport } from './lib/pwa.js';
import { applyTheme } from './lib/theme.js';

applyTheme();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={stateTransition}>
        <App />
      </MotionConfig>
    </LazyMotion>
  </React.StrictMode>
);

registerOfflineSupport();
