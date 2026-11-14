import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';

interface ResponsivePanelProps {
  compact: boolean;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Only panel UI changes its container; the drawing workspace stays mounted. */
export function ResponsivePanel({ compact, open, title, onClose, children }: ResponsivePanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropDown = useRef(false);
  const titleId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!compact || !open || !element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    element.querySelector<HTMLButtonElement>('[data-panel-close]')?.focus({ preventScroll: true });
    return () => {
      if (element.open) element.close();
      if (opener?.isConnected && opener.getClientRects().length && !opener.closest('[inert]')) {
        opener.focus({ preventScroll: true });
      } else {
        document.querySelector<HTMLElement>('[data-workspace-focus]')?.focus({ preventScroll: true });
      }
    };
  }, [compact, open]);

  if (!compact) return children;
  // A closed native dialog hides its UI without discarding drafts or aborting
  // model downloads. Only switching to the desktop container remounts panels.
  const outside = (element: HTMLDialogElement, x: number, y: number) => {
    const bounds = element.getBoundingClientRect();
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  };
  return <dialog ref={dialog} className="responsive-panel" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => {
      backdropDown.current = event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY);
    }}
    onClick={event => {
      if (backdropDown.current && event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY)) onClose();
      backdropDown.current = false;
    }}
    onKeyDown={event => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]'));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }}>
    <div className="responsive-panel-header">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="btn btn-sm responsive-panel-close" data-panel-close aria-label={`Close ${title.toLowerCase()} panel`} onClick={onClose}>Close</button>
    </div>
    <div className="responsive-panel-content">{children}</div>
  </dialog>;
}
