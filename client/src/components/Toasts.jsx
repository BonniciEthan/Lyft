import { createPortal } from 'react-dom';
import { CheckIcon, CloseIcon } from './Icons.jsx';

export function Toasts({ toasts, onDismiss }) {
  return createPortal(
    <div className="toast-stack" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast glass-panel toast-${t.type}${t.leaving ? ' leaving' : ''}${t.action ? ' has-action' : ''}`}>
          <span className="toast-icon">{t.type === 'error' ? <CloseIcon width={16} height={16} /> : <CheckIcon width={16} height={16} />}</span>
          <span className="toast-text">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action.run();
                onDismiss?.(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}
