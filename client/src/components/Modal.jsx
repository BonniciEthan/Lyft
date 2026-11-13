import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons.jsx';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal glass-panel modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ request, onResolve }) {
  const open = Boolean(request);
  return (
    <Modal
      open={open}
      onClose={() => onResolve(false)}
      title={request?.title || 'Are you sure?'}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => onResolve(false)}>
            {request?.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            className={`btn ${request?.destructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onResolve(true)}
            autoFocus
          >
            {request?.confirmLabel || 'Continue'}
          </button>
        </>
      }
    >
      <p className="modal-message">{request?.message}</p>
    </Modal>
  );
}
