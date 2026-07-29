// Design tokens for the simulator. Ported from the sibling energy dashboards
// (estado-red-gas / gasoductos) to keep one visual language across the
// user's projects. Reference these from component style objects — no inline hex.

export const colors = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#172033',
  border: '#334155',
  textPrimary: '#f1f5f9',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  accent: {
    blue: '#3b82f6',
    green: '#10b981',
    orange: '#f59e0b',
    red: '#ef4444',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
    gray: '#6b7280',
  },
  status: {
    ok: '#10b981',
    warn: '#f59e0b',
    err: '#ef4444',
    muted: '#64748b',
  },
} as const

// Color per generation technology — reused by the merit-order stack, the mix
// chart and any legend so a technology always reads the same color.
export const techColors: Record<string, string> = {
  hydro: '#3b82f6',
  nuclear: '#a855f7',
  gas_ccgt: '#f59e0b',
  gas_ocgt: '#fb923c',
  coal: '#6b7280',
  diesel: '#ef4444',
  solar: '#fbbf24',
  wind: '#22d3ee',
  biomass: '#84cc16',
}

export const techLabels: Record<string, string> = {
  hydro: 'Hidro',
  nuclear: 'Nuclear',
  gas_ccgt: 'Gas CC',
  gas_ocgt: 'Gas CA',
  coal: 'Carbón',
  diesel: 'Diésel',
  solar: 'Solar',
  wind: 'Eólica',
  biomass: 'Biomasa',
}

export const radius = { sm: 6, md: 8, lg: 12, pill: 20 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const

export const card: React.CSSProperties = {
  background: colors.surface,
  borderRadius: radius.lg,
  padding: space.xl,
  border: `1px solid ${colors.border}`,
}

export const sectionTitle: React.CSSProperties = {
  marginBottom: space.md,
  color: colors.textMuted,
  fontSize: 14,
  textTransform: 'uppercase',
  letterSpacing: 1,
}

export const badge = (color: string): React.CSSProperties => ({
  background: color + '22',
  color,
  padding: '2px 10px',
  borderRadius: radius.pill,
  fontSize: 11,
  fontWeight: 700,
})
