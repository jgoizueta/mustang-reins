import { Radio, X } from 'lucide-react'
import { Button, cx } from './ui'

/** Note names, counted in semitones from A as the amp reports them. */
export const NOTE_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']
const IN_TUNE_CENTS = 5

interface Props {
  tuner: { note: number; cents: number; reading: boolean }
  onClose: () => void
}

export function TunerOverlay({ tuner, onClose }: Props) {
  const inTune = tuner.reading && Math.abs(tuner.cents) < IN_TUNE_CENTS
  const left = Math.max(0, Math.min(100, 50 + (tuner.reading ? tuner.cents : 0)))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative panel-surface p-12 flex flex-col items-center justify-center gap-8 shadow-2xl border-2 border-primary/20 max-w-3xl w-full mx-4">
        <Button variant="ghost" className="absolute top-4 right-4 size-9 rounded-md" title="Close tuner" onClick={onClose}>
          <X className="size-5" />
        </Button>
        <h2 className="text-2xl font-bold tracking-widest uppercase text-muted-foreground flex items-center gap-4">
          <Radio className="size-8 text-primary animate-pulse" />Mustang Tuner
        </h2>
        <div className="relative flex items-center justify-center w-full h-32">
          <div className="absolute -left-12 right-[calc(50%+192px)] flex items-center justify-center">
            <div data-testid="tuner-note" className="text-8xl font-black tracking-tighter text-center w-32">
              {tuner.reading ? NOTE_NAMES[((tuner.note % 12) + 12) % 12] : '-'}
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 shrink-0 w-96">
            <div className="relative h-10 w-96 bg-rail rounded-full overflow-hidden border border-border">
              <div data-testid="tuner-needle"
                className={cx('absolute top-0 bottom-0 transition-all duration-75', inTune ? 'bg-green-500 w-2' : 'bg-primary w-1')}
                style={{ left: `${left}%` }} />
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/20" />
            </div>
            <div className="flex justify-between w-full text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              <span>Flat</span>
              <span className={inTune ? 'text-green-500 font-bold' : ''}>In Tune</span>
              <span>Sharp</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
