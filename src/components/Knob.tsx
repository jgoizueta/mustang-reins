import { useEffect, useRef, useState } from 'react'
import { cx } from './ui'

interface KnobProps {
  label: string
  value: number
  size?: number
  accent?: string
  onChange?: (value: number) => void
  format?: (value: number) => string
  hideText?: boolean
  disabled?: boolean
  /** Highest value. 255 for a normal knob, choices-1 for a knob that picks from named choices. */
  max?: number
  /** Value a double-click restores. */
  reset?: number
}

const ARC = 270
const RANGE = 255

export function Knob({
  label, value, size = 58, accent = 'var(--signal)', onChange, format, hideText, disabled, max = RANGE, reset = 128,
}: KnobProps) {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ y: 0, value: 0 })
  const r = size / 2 - 4
  const circ = 2 * Math.PI * r
  const track = (circ * ARC) / 360
  const frac = max ? Math.max(0, Math.min(1, value / max)) : 0
  const unit = max / RANGE // one pixel of drag moves 1.6 steps of the 0-255 range
  const set = (v: number) => onChange?.(Math.max(0, Math.min(max, Math.round(v))))
  const setRef = useRef(set)
  useEffect(() => {
    setRef.current = set
  })

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      const fine = e.shiftKey ? 0.25 : 1
      setRef.current(start.current.value + (start.current.y - e.clientY) * 1.6 * fine * unit)
    }
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging, unit])

  const step = Math.max(1, Math.round(4 * unit))
  return (
    <div className={cx('flex select-none flex-col items-center gap-1.5', disabled && 'opacity-40')}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cx(
          'relative cursor-ns-resize touch-none rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          disabled && 'pointer-events-none',
        )}
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { y: e.clientY, value }
          setDragging(true)
        }}
        onDoubleClick={() => set(max === RANGE ? reset : 0)}
        onWheel={(e) => !disabled && set(value + (e.deltaY < 0 ? step : -step))}
        onKeyDown={(e) => {
          const n = e.shiftKey ? step * 4 : step
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + n)
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - n)
          else return
          e.preventDefault()
        }}
      >
        <svg width={size} height={size} className="absolute inset-0">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3}
            strokeLinecap="round" strokeDasharray={`${track} ${circ}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={3}
            strokeLinecap="round" strokeDasharray={`${track * frac} ${circ}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />
        </svg>
        <div className="absolute rounded-full" style={{ inset: 8, boxShadow: 'var(--shadow-knob)',
          backgroundImage: 'linear-gradient(180deg, oklch(0.31 0.008 250) 0%, oklch(0.2 0.007 250) 100%)' }}>
          <div className="absolute left-1/2 top-1/2 origin-bottom rounded-full"
            style={{ width: 2, height: size / 2 - 12, background: accent, boxShadow: `0 0 8px -1px ${accent}`,
              transform: `translate(-50%, -100%) rotate(${-135 + frac * ARC}deg)`, transformOrigin: '50% 100%' }} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-label leading-none">{hideText ? '' : label}</div>
        <div className="text-readout text-[11px] text-foreground/70">
          {hideText ? '' : format ? format(value) : Math.round((value / RANGE) * 100)}
        </div>
      </div>
    </div>
  )
}
