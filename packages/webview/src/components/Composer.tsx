import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { ModelId, Plan } from '@xeref-code/shared-types';
import { baseName, modelLabel } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  models: readonly ModelId[];
  model: ModelId;
  onModelChange: (model: ModelId) => void;
  plan: Plan | undefined;
  autoApply: boolean;
  onAutoApplyChange: (value: boolean) => void;
  fileName: string | null;
  includeFile: boolean;
  onIncludeFileChange: (value: boolean) => void;
  onUpgrade: () => void;
}

/** Closes a popover on Esc or a click outside `ref`. */
function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, onClose]);
}

/**
 * Message box: textarea plus a chip row (model, edit mode, active file) and the send button.
 * The chips replace the old native <select> and settings-only toggle.
 */
export function Composer(props: Props) {
  const { value, onChange, onSend, busy, models, model, onModelChange, plan, autoApply, onAutoApplyChange } = props;
  const { fileName, includeFile, onIncludeFileChange, onUpgrade } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useDismiss(menuOpen, menuRef, () => setMenuOpen(false));

  // Grow with the content up to ~8 lines, then scroll.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  }

  const canSend = value.trim().length > 0 && !busy;

  return (
    <div className="x-composer">
      <textarea
        ref={areaRef}
        className="x-composer-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask Xeref to edit… (Shift+Enter for a new line)"
        rows={2}
        disabled={busy}
        aria-label="Message Xeref"
      />

      <div className="x-chips">
        <div className="x-menu-anchor" ref={menuRef}>
          <button
            className="x-chip"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            disabled={busy}
            title="Choose a model"
          >
            {modelLabel(model)} <Icon name="chevron-down" size={12} />
          </button>
          {menuOpen && (
            <div className="x-menu" role="listbox" aria-label="Models">
              {models.map((id) => (
                <button
                  key={id}
                  role="option"
                  aria-selected={id === model}
                  className={`x-menu-item${id === model ? ' is-selected' : ''}`}
                  onClick={() => {
                    onModelChange(id);
                    setMenuOpen(false);
                  }}
                >
                  <span className="x-menu-check">{id === model && <Icon name="check" size={12} />}</span>
                  {modelLabel(id)}
                </button>
              ))}
              {plan !== 'ultra' && (
                <button
                  className="x-menu-item x-menu-upsell"
                  onClick={() => {
                    setMenuOpen(false);
                    onUpgrade();
                  }}
                >
                  <span className="x-menu-check">
                    <Icon name="lock" size={12} />
                  </span>
                  More models on higher plans
                </button>
              )}
            </div>
          )}
        </div>

        <button
          className={`x-chip${autoApply ? ' x-chip-warn' : ''}`}
          onClick={() => onAutoApplyChange(!autoApply)}
          aria-pressed={autoApply}
          title={
            autoApply
              ? 'Edits are applied without asking. Click to ask before each edit.'
              : 'Xeref asks before applying each edit. Click to auto-apply edits.'
          }
        >
          <Icon name={autoApply ? 'bolt' : 'shield'} size={12} /> {autoApply ? 'Auto-apply edits' : 'Ask before edits'}
        </button>

        {fileName && includeFile && (
          <span className="x-chip x-chip-file" title={`Xeref will know ${fileName} is open. It reads contents only through tools you approve.`}>
            <Icon name="file" size={12} />
            <span className="x-chip-text">{baseName(fileName)}</span>
            <button className="x-chip-x" onClick={() => onIncludeFileChange(false)} aria-label={`Stop including ${baseName(fileName)}`}>
              <Icon name="close" size={10} />
            </button>
          </span>
        )}

        <span className="x-spacer" />

        <button className="x-send" onClick={onSend} disabled={!canSend} aria-label={busy ? 'Sending' : 'Send message'} title="Send (Enter)">
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
}
