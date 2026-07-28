import type { ReactNode } from 'react'
import { badge, card, colors, radius, sectionTitle, space } from '../theme'

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...card, ...style }}>{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={sectionTitle}>{children}</div>
}

export function Stat({
  label,
  value,
  unit,
  accent = colors.textPrimary,
  hint,
}: {
  label: string
  value: string | number
  unit?: string
  accent?: string
  hint?: string
}) {
  return (
    <div
      style={{
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: space.md,
        minWidth: 130,
      }}
      title={hint}
    >
      <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ color: accent, fontSize: 22, fontWeight: 800, marginTop: 2 }}>
        {value}
        {unit && <span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>{children}</div>
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  unit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  unit?: string
}) {
  return (
    <label style={{ display: 'block', marginBottom: space.md }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: colors.textSecondary }}>{label}</span>
        <span style={{ color: colors.accent.blue, fontWeight: 700 }}>
          {format ? format(value) : value}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: space.md }}>
      <div style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} style={{ width: '100%' }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: '100%' }}
    />
  )
}

const RELIABILITY: Record<string, { color: string; label: string }> = {
  verified: { color: colors.status.ok, label: 'verificado' },
  approx: { color: colors.status.warn, label: 'aprox.' },
  unreliable: { color: colors.status.err, label: 'no confiable' },
}

export function ReliabilityTag({ level }: { level: string }) {
  const r = RELIABILITY[level] ?? RELIABILITY.approx
  return <span style={badge(r.color)}>{r.label}</span>
}

export function Loading({ what }: { what?: string }) {
  return <div style={{ color: colors.textMuted, padding: space.xl }}>Cargando{what ? ` ${what}` : ''}…</div>
}

export function Grid({ cols, children }: { cols: string; children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap: space.lg, alignItems: 'start' }}>{children}</div>
}
