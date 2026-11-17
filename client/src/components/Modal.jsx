import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons.jsx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Move focus into the dialog on open and give it back to whatever opened it on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    // Focus the dialog itself (not its first field) so phones don't pop the keyboard open;
    // children with autoFocus have already taken focus by now and are left alone.
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const dialog = dialogRef.current;
      // Only the top-most dialog reacts when two are stacked (e.g. a confirm over a sheet).
      const dialogs = document.querySelectorAll('.modal[role="dialog"]');
      if (dialog && dialogs[dialogs.length - 1] !== dialog) return;
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal glass-panel modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
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
