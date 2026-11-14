import { useContext, type ReactNode } from 'react'
import type { MidiMapping, MidiTarget } from '../midi/learn'
import { sameTarget, targetLabel } from '../midi/learn'
import { MidiLearnContext, type MidiLearn } from './learnContext'
import { cx } from './ui'

interface Props {
  target: MidiTarget
  children: ReactNode
  /** Optional overrides; the context is used when these are not given. */
  learn?: { active: boolean; armed: MidiTarget | null }
  onArm?: (target: MidiTarget) => void
  mapping?: MidiMapping | undefined
  /** Classes for the wrapper, for example to let it fill a flex row. */
  className?: string
}

/**
 * Wraps a control so MIDI learn can capture clicks on it. While learn is active an overlay
 * sits on top of the child (so the control's value does not change); clicking arms the target,
 * clicking it again disarms it.
 */
export function Learnable({ target, children, learn, onArm, mapping, className }: Props) {
  const ctx = useContext<MidiLearn>(MidiLearnContext)
  const active = learn?.active ?? ctx.active
  const armed = learn?.armed ?? ctx.armed
  const arm = onArm ?? ctx.onArm
  const map = mapping !== undefined ? mapping : ctx.mappingFor(target)
  const isArmed = armed !== null && sameTarget(armed, target)
  return (
    <span className={cx('relative inline-flex', className)}>
      {children}
      {active && (
        <button type="button" onClick={() => arm(target)} title={targetLabel(target)}
          className={cx('absolute inset-0 z-10 rounded-md ring-2 ring-primary/40',
            isArmed && 'ring-primary animate-pulse')}>
          {map && (
            <span className="absolute right-0.5 top-0.5 rounded-sm bg-primary px-1 text-[9px] font-bold leading-3 text-primary-foreground">
              CC {map.cc}{map.channel !== 1 ? ` ch ${map.channel}` : ''}
            </span>
          )}
        </button>
      )}
    </span>
  )
}
