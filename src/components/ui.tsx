// Small reusable UI primitives.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

export function ProgressBar({ value, tone, size, label }: { value: number; tone?: "accent" | "success"; size?: "thin" | "thick"; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`bar ${tone ?? ""} ${size ?? ""}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A labeled skill bar. `null` means "not enough evidence yet" — never a fake number. */
export function SkillMeter({ label, value, note, tone }: { label: string; value: number | null; note?: string; tone?: "accent" | "success" }) {
  return (
    <div className={`meter ${value == null ? "meter-empty" : ""}`}>
      <span className="meter-label">{label}</span>
      <ProgressBar value={value ?? 0} tone={tone} label={label} />
      <span className="meter-value">{value == null ? "—" : `${Math.round(value * 100)}%`}</span>
      {note && <span className="meter-note">{note}</span>}
    </div>
  );
}

export function Ring({ value, size = 34, stroke = 4, label, done }: { value: number; size?: number; stroke?: number; label?: ReactNode; done?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={`ring ${done ? "done" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle className="ring-value" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {label != null && <span className="ring-label">{done ? <Check size={size * 0.42} strokeWidth={3} /> : label}</span>}
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" className="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon-tile lg neutral">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="small" style={{ maxWidth: 380, margin: "0 auto" }}>{children}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ─── Toasts ──────────────────────────────────────────────────

interface ToastItem {
  id: number;
  text: string;
  icon?: ReactNode;
}
const ToastContext = createContext<(text: string, icon?: ReactNode) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, icon?: ReactNode) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, icon }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.icon}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
