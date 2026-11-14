import { effectById, effectsFor, FAMILY_LABELS } from '../data/effects'
import type { EffectFamily, EffectSettings } from '../protocol/packets'
import { Knob } from './Knob'
import { Learnable } from './Learnable'
import { Select, Switch, cx } from './ui'

interface Props {
  family: EffectFamily
  fx: EffectSettings
  isV2: boolean
  onModel: (model: number) => void
  onKnob: (index: number, value: number) => void
  onToggle: (enabled: boolean) => void
  onMove: (position: 'pre' | 'post', slot: number) => void
}

export function EffectPanel({ family, fx, isV2, onModel, onKnob, onToggle, onMove }: Props) {
  const models = effectsFor(family, isV2)
  const cur = effectById(family, fx.model)
  const loaded = fx.model !== 0
  const color = `var(--slot-${family})`
  const on = loaded && fx.enabled

  const tab = (position: 'pre' | 'post', slot: number) => (
    <button key={`${position}-${slot}`} disabled={!loaded} onClick={() => onMove(position, slot)}
      className={cx('flex h-6 w-6 items-center justify-center rounded-sm transition-colors',
        fx.position === position && fx.slot === slot
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
        !loaded && 'opacity-50 pointer-events-none')}>
      {slot + 1}
    </button>
  )

  return (
    <section className="panel-surface p-4">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full"
          style={{ background: on ? color : 'var(--offline)', boxShadow: on ? `0 0 10px -1px ${color}` : 'none' }} />
        <div className="text-label">{FAMILY_LABELS[family]}</div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-0.5 rounded border border-border bg-rail p-0.5 text-[11px] font-medium">
            {[0, 1, 2, 3].map((s) => tab('pre', s))}
            <span className="px-1 text-[10px] tracking-wider text-muted-foreground/60">AMP</span>
            {[0, 1, 2, 3].map((s) => tab('post', s))}
          </div>
          <Learnable target={{ kind: 'effectSwitch', family }}>
            <Switch checked={fx.enabled} disabled={!loaded} onCheckedChange={onToggle} />
          </Learnable>
        </div>
      </div>
      <Select className="mt-3" value={String(fx.model)} onChange={(v) => onModel(Number(v))}
        placeholder="Unknown effect"
        options={[
          ...models.map((m) => ({ value: String(m.id), label: m.name, hint: m.basedOn })),
          ...(cur && models.includes(cur) ? []
            : cur ? [{ value: String(fx.model), label: cur.name, hint: 'Not on this amp' }]
            : [{ value: String(fx.model), label: `Unknown effect (${fx.model})` }]),
        ]} />
      {cur?.v2Only && !isV2 && (
        <p className="mt-1.5 text-[11px] text-destructive">This effect needs a Mustang v2.</p>
      )}
      <div className="mt-4 flex min-h-24 flex-wrap gap-x-5 gap-y-4">
        {cur?.knobs.length ? (
          cur.knobs.map((label, i) => {
            const choices = cur.enums?.[i]
            return (
              <Learnable key={label + i} target={{ kind: 'effectKnob', family, index: i }}>
                <Knob label={label} size={46} accent={color} disabled={!fx.enabled}
                  value={fx.knobs[i] ?? 0} max={choices ? choices.length - 1 : 255}
                  format={choices ? (v) => choices[Math.min(v, choices.length - 1)] : undefined}
                  onChange={(v) => onKnob(i, v)} />
              </Learnable>
            )
          })
        ) : (
          <p className="text-xs text-muted-foreground">No effect loaded in this slot.</p>
        )}
      </div>
    </section>
  )
}
