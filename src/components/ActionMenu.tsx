import { useId, useRef, useState, type ReactNode } from 'react';

/** A popover dialog because its contents include form controls, not only menuitems. */
export function ActionMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const [open, setOpen] = useState(false);
  const close = () => {
    document.getElementById(id)?.hidePopover();
    document.getElementById(`${id}-trigger`)?.focus();
  };
  return <>
    <button ref={trigger} id={`${id}-trigger`} className="btn btn-sm btn-square toolbar-more-actions" aria-label="More actions" title="More actions" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} popoverTarget={id}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); focusLast.current = event.key === 'ArrowUp'; panel.current?.showPopover();
        }
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="More actions" tabIndex={-1} className="toolbar-action-menu"
      onToggle={event => {
        const nextOpen = event.newState === 'open';
        setOpen(nextOpen);
        if (nextOpen) {
          const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          (focusLast.current ? buttons?.[buttons.length - 1] : buttons?.[0])?.focus();
          focusLast.current = false;
        }
      }}
      onBlur={event => {
        if (event.relatedTarget && event.relatedTarget !== trigger.current && !event.currentTarget.contains(event.relatedTarget)) panel.current?.hidePopover();
      }}
      onKeyDown={event => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key === 'Tab') {
          requestAnimationFrame(() => {
            if (!panel.current?.contains(document.activeElement)) panel.current?.hidePopover();
          });
          return;
        }
        // Inputs and selects retain their native arrow-key editing behavior.
        if (!(event.target instanceof HTMLButtonElement) && event.target !== panel.current) return;
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!buttons.length) return;
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {children(close)}
    </div>
  </>;
}
