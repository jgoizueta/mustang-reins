import { genreName } from '../library/genres'
import { ampById, CABINETS } from '../data/amps'
import { effectById, FAMILY_LABELS } from '../data/effects'
import { FAMILIES, type Preset } from '../protocol/preset'

const tenths = (v: number) => ((v / 255) * 10).toFixed(1)
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><span className="text-muted-foreground text-xs block mb-0.5">{label}</span><span className="font-mono">{children}</span></div>
)

/** Read-only summary of a preset: who made it, the amp settings and the effects. */
export function PresetDetails({ preset }: { preset: Preset }) {
  const info = preset.fuseInfo
  const amp = ampById(preset.amp.model)
  const cab = CABINETS.find((c) => c.id === preset.amp.cabinet)
  const real = (v?: string) => !!v && v !== '-1'
  const hasInfo = info && (info.author || info.tags || info.rating || real(info.genre1) || info.description)
  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      <div className="p-6 border-b border-border bg-background/50 shrink-0">
        <h3 className="text-2xl font-bold truncate">{preset.name}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8 pb-2">
          {hasInfo && (
            <section className="space-y-3">
              <h4 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Information</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm bg-background/50 p-4 rounded-lg border border-border/50">
                {info.author && <div><span className="text-muted-foreground">Author:</span> <span className="font-medium text-foreground ml-1">{info.author}</span></div>}
                {info.tags && <div className="col-span-2"><span className="text-muted-foreground">Tags:</span> <span className="font-medium text-foreground ml-1">{info.tags}</span></div>}
                {info.rating && <div><span className="text-muted-foreground">Rating:</span> <span className="font-medium text-foreground ml-1">{info.rating}</span></div>}
                {real(info.genre1) && <div><span className="text-muted-foreground">Genre:</span> <span className="font-medium text-foreground ml-1">{genreName(info.genre1)}</span></div>}
              </div>
              {info.description && (
                <div className="text-sm bg-background/50 p-4 rounded-lg border border-border/50">
                  <div className="font-medium text-muted-foreground mb-2">Description</div>
                  <div className="whitespace-pre-wrap text-foreground">{info.description}</div>
                </div>
              )}
            </section>
          )}
          <section className="space-y-3">
            <h4 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Amplifier</h4>
            <div className="bg-background/50 p-4 rounded-lg border border-border/50 space-y-4">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border/50">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Model</div>
                  <div className="font-medium">{amp?.name ?? 'Unknown'}{amp && <span className="block text-xs opacity-60 font-normal">{amp.basedOn}</span>}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Cabinet</div>
                  <div className="font-medium">{cab?.name ?? 'Unknown'}{cab?.basedOn && <span className="block text-xs opacity-60 font-normal">{cab.basedOn}</span>}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-y-4 gap-x-2 text-sm">
                <Field label="Gain">{tenths(preset.amp.gain)}</Field>
                <Field label="Volume">{tenths(preset.amp.volume)}</Field>
                <Field label="Treble">{tenths(preset.amp.treble)}</Field>
                <Field label="Middle">{tenths(preset.amp.middle)}</Field>
                <Field label="Bass">{tenths(preset.amp.bass)}</Field>
                <Field label="Presence">{tenths(preset.amp.presence)}</Field>
                <Field label="Master">{tenths(preset.amp.masterVolume)}</Field>
                <Field label="Depth">{tenths(preset.amp.depth)}</Field>
                <Field label="Bias">{tenths(preset.amp.bias)}</Field>
              </div>
            </div>
          </section>
          <section className="space-y-3">
            <h4 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Effects</h4>
            <div className="bg-background/50 p-4 rounded-lg border border-border/50 space-y-3 text-sm">
              {FAMILIES.map((f) => {
                const fx = preset.effects[f]
                const m = effectById(f, fx.model)
                return (
                  <div key={f} className="flex items-baseline justify-between gap-4">
                    <span className="text-xs text-muted-foreground">{FAMILY_LABELS[f]}</span>
                    <span className={fx.model === 0 ? 'text-muted-foreground' : fx.enabled ? 'font-medium' : 'opacity-60'}>
                      {fx.model === 0 ? 'Empty' : (m?.name ?? `Unknown (${fx.model})`)}
                      {fx.model !== 0 && !fx.enabled && ' (off)'}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
