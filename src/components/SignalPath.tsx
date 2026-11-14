import { Activity, Guitar, Speaker } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { AMP_OFF, ampById, CABINETS } from '../data/amps'
import { effectById, FAMILY_LABELS } from '../data/effects'
import type { EffectFamily } from '../protocol/packets'
import { FAMILIES, type Preset } from '../protocol/preset'
import { cx } from './ui'

type Position = 'pre' | 'post'
interface Dragged { family: EffectFamily; position: Position; index: number }

interface Props {
  preset: Preset
  onToggleEffect: (family: EffectFamily, enabled: boolean) => void
  onMoveEffect: (family: EffectFamily, position: Position, slot: number) => void
  onToggleCabinet: () => void
  className?: string
}

function Arrow() {
  return (
    <div className="flex flex-1 items-center text-muted-foreground/30 px-0.5 @5xl:px-1 pointer-events-none min-w-[12px]">
      <div className="h-0.5 w-full bg-current rounded-full" />
      <div className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[4px] border-l-current ml-[-1px] shrink-0" />
    </div>
  )
}

/** Gap between two nodes. It grows into a dashed drop target while an effect is dragged over it. */
function DropZone({ position, slot, dragged, onMove }: {
  position: Position; slot: number; dragged: Dragged | null; onMove: (family: EffectFamily, position: Position, slot: number) => void
}) {
  const [over, setOver] = useState(false)
  // Dropping next to the effect's own place changes nothing.
  const own = !!dragged && dragged.position === position && (dragged.index === slot || dragged.index === slot - 1)
  return (
    <div
      className={cx(
        'flex flex-1 items-center justify-center rounded-lg transition-all duration-300 ease-out border-2 box-border overflow-hidden',
        over && !own
          ? 'h-20 @5xl:h-24 min-w-[6rem] @5xl:min-w-[7rem] bg-primary/10 border-dashed border-primary/50 mx-1 @5xl:mx-2 shadow-inner'
          : 'h-12 min-w-[12px] border-transparent mx-0',
      )}
      onDragOver={(e) => { if (!own) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (own) return
        e.preventDefault()
        setOver(false)
        try {
          const { family } = JSON.parse(e.dataTransfer.getData('application/json'))
          if (FAMILIES.includes(family)) onMove(family, position, slot)
        } catch { /* not one of our drags */ }
      }}>
      <Arrow />
    </div>
  )
}

function EffectNode({ family, position, index, preset, onToggle, setDragged }: {
  family: EffectFamily; position: Position; index: number; preset: Preset
  onToggle: Props['onToggleEffect']; setDragged: (d: Dragged | null) => void
}) {
  const fx = preset.effects[family]
  const model = effectById(family, fx.model)
  const label = FAMILY_LABELS[family]
  return (
    <button draggable onClick={() => onToggle(family, !fx.enabled)}
      style={{ '--fx': `var(--slot-${family})` } as CSSProperties}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ family }))
        setDragged({ family, position, index })
      }}
      onDragEnd={() => setDragged(null)}
      className={cx(
        'flex flex-col items-center justify-center p-1 @5xl:p-2 rounded-lg border-2 h-20 @5xl:h-24 w-14 @5xl:w-28 text-center gap-1 transition-all cursor-grab active:cursor-grabbing shrink-0',
        fx.enabled
          ? 'border-[var(--fx)] bg-[color-mix(in_oklab,var(--fx)_10%,transparent)] hover:bg-[color-mix(in_oklab,var(--fx)_20%,transparent)]'
          : 'border-border bg-muted/30 opacity-60 hover:opacity-100 hover:border-muted-foreground/50',
      )}>
      <div className="text-[9px] @5xl:text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate w-full px-0.5">
        <span className="@5xl:hidden">{family === 'stomp' ? 'Stomp' : family === 'mod' ? 'Mod' : label}</span>
        <span className="hidden @5xl:inline">{label}</span>
      </div>
      <div className="text-[10px] @5xl:text-xs font-semibold leading-tight line-clamp-2 px-0.5 hidden @5xl:[display:-webkit-box]">
        {model?.name ?? 'Unknown'}
      </div>
    </button>
  )
}

function End({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-20 @5xl:h-24 w-12 @5xl:w-16 text-muted-foreground shrink-0">
      {icon}
      <span className="text-[8px] @5xl:text-[10px] uppercase font-bold tracking-wider truncate w-full text-center">{label}</span>
    </div>
  )
}

export function SignalPath({ preset, onToggleEffect, onMoveEffect, onToggleCabinet, className }: Props) {
  const [dragged, setDragged] = useState<Dragged | null>(null)
  const inChain = (position: Position) =>
    FAMILIES.filter((f) => preset.effects[f].position === position && preset.effects[f].model !== 0)
      .sort((a, b) => preset.effects[a].slot - preset.effects[b].slot)
  const amp = ampById(preset.amp.model)
  const cab = CABINETS.find((c) => c.id === preset.amp.cabinet)
  const cabOff = preset.amp.cabinet === 0
  const ampOff = preset.amp.model === AMP_OFF

  const run = (position: Position) => (
    <>
      <DropZone position={position} slot={0} dragged={dragged} onMove={onMoveEffect} />
      {inChain(position).map((family, i) => (
        <span key={family} className="contents">
          <EffectNode family={family} position={position} index={i} preset={preset} onToggle={onToggleEffect} setDragged={setDragged} />
          <DropZone position={position} slot={i + 1} dragged={dragged} onMove={onMoveEffect} />
        </span>
      ))}
    </>
  )

  return (
    <section className={cx('panel-surface p-4 overflow-hidden flex flex-col @container', className)}>
      <div className="text-label mb-4 flex items-center gap-2"><Activity className="size-3.5" /> Signal Path</div>
      <div className="w-full min-w-[300px] overflow-x-auto">
        <div className="flex items-center w-max min-w-full justify-between pb-5 px-1">
          <End icon={<Guitar className="size-6 @5xl:size-8 mb-1 @5xl:mb-2 shrink-0" />} label="Input" />
          {run('pre')}
          <div data-testid="amp-node" className={cx(
            'flex flex-col items-center justify-center p-1 @5xl:p-2 rounded-lg border-2 h-20 @5xl:h-24 w-14 @5xl:w-36 text-center gap-1 shrink-0',
            ampOff ? 'border-secondary bg-secondary/20 opacity-60' : 'border-primary bg-primary/10 shadow-sm shadow-primary/20',
          )}>
            <div className={cx('text-[9px] @5xl:text-[10px] font-medium uppercase tracking-wider truncate w-full px-0.5', ampOff ? 'text-muted-foreground' : 'text-primary')}>
              <span className="@5xl:hidden">Amp</span><span className="hidden @5xl:inline">Amplifier</span>
            </div>
            <div className="text-[10px] @5xl:text-sm font-bold leading-tight line-clamp-2 px-0.5 hidden @5xl:[display:-webkit-box]">
              {amp?.name ?? 'Unknown Amp'}
            </div>
          </div>
          {run('post')}
          <button onClick={onToggleCabinet}
            className={cx(
              'flex flex-col items-center justify-center p-1 @5xl:p-2 rounded-lg border-2 h-20 @5xl:h-24 w-14 @5xl:w-36 text-center gap-1 shrink-0 transition-all',
              cabOff
                ? 'border-secondary bg-secondary/20 opacity-60 hover:opacity-100'
                : 'border-primary bg-primary/10 shadow-sm shadow-primary/20 hover:bg-primary/20',
            )}>
            <div className={cx('text-[9px] @5xl:text-[10px] font-medium uppercase tracking-wider truncate w-full px-0.5', cabOff ? 'text-muted-foreground' : 'text-primary')}>
              <span className="@5xl:hidden">Cab</span><span className="hidden @5xl:inline">Cabinet</span>
            </div>
            <div className="text-[10px] @5xl:text-sm font-bold leading-tight line-clamp-2 px-0.5 hidden @5xl:[display:-webkit-box]">
              {cab?.name ?? 'Unknown Cab'}
            </div>
          </button>
          <Arrow />
          <End icon={<Speaker className="size-6 @5xl:size-8 mb-1 @5xl:mb-2 shrink-0" />} label="Output" />
        </div>
      </div>
    </section>
  )
}
