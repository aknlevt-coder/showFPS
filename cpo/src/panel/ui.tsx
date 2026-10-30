import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Row({ label, children, wide }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className="row">
      <span>{label}</span>
      <span className={`row-ctl${wide ? " wide" : ""}`}>{children}</span>
    </label>
  );
}

export function Range(p: {
  label: string; value: number; min: number; max: number; step?: number;
  format?: (v: number) => string; onChange: (v: number) => void; disabled?: boolean;
}) {
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <Row label={p.label} wide>
      <input
        type="range" min={p.min} max={p.max} step={p.step ?? 1} value={p.value} disabled={p.disabled}
        style={{ "--p": `${pct}%` } as CSSProperties}
        onChange={(e) => p.onChange(Number(e.target.value))}
      />
      <span className="val">{p.format ? p.format(p.value) : p.value}</span>
    </Row>
  );
}

export function Check(p: { label: ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={p.label}>
      <input type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange(e.target.checked)} />
    </Row>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="swatch">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      {value}
    </span>
  );
}

export function Color(p: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={p.label}>
      <ColorInput value={p.value} onChange={p.onChange} />
    </Row>
  );
}

export function Card({ title, icon: Icon, actions, children }: { title?: string; icon?: LucideIcon; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {title && (
        <div className="card-head">
          {Icon && <Icon size={16} />}
          <h3>{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
