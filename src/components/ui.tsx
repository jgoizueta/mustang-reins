import * as RSelect from '@radix-ui/react-select'
import * as RSlider from '@radix-ui/react-slider'
import * as RSwitch from '@radix-ui/react-switch'
import { Check, ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')

export function Switch(props: { checked: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <RSwitch.Root {...props}
      className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input">
      <RSwitch.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </RSwitch.Root>
  )
}

export function Slider(props: { value: number; max: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <RSlider.Root value={[props.value]} max={props.max} step={1} disabled={props.disabled}
      onValueChange={([v]) => props.onChange?.(v)}
      className="relative flex w-full touch-none select-none items-center">
      <RSlider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
        <RSlider.Range className="absolute h-full bg-primary" />
      </RSlider.Track>
      <RSlider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </RSlider.Root>
  )
}

export interface Option { value: string; label: string; hint?: string }

export function Select(props: {
  value: string; options: Option[]; onChange: (v: string) => void; className?: string; large?: boolean
  plain?: boolean; compact?: boolean; placeholder?: string; disabled?: boolean
}) {
  const cur = props.options.find((o) => o.value === props.value)
  return (
    <RSelect.Root value={props.value} onValueChange={props.onChange} disabled={props.disabled}>
      <RSelect.Trigger
        className={cx(
          'flex items-center justify-between whitespace-nowrap rounded-md border px-3 py-2 shadow-sm ring-offset-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-border bg-rail',
          props.large ? 'h-10 text-base' : props.compact ? 'h-8 text-xs' : 'h-9 text-sm',
          !props.plain && 'font-semibold',
          !props.className?.includes('w-') && 'w-full',
          props.className,
        )}>
        <span className="flex min-w-0 items-baseline gap-2 truncate" style={{ pointerEvents: 'none' }}>
          <span className="truncate">{cur?.label ?? props.placeholder}</span>
          {cur?.hint && <span className="truncate text-xs font-normal text-muted-foreground">({cur.hint})</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={4}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-card text-foreground shadow-xl">
          <RSelect.Viewport className="p-1">
            {props.options.map((o) => (
              <RSelect.Item key={o.value} value={o.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-7 pr-3 text-sm outline-none data-[highlighted]:bg-accent">
                <RSelect.ItemIndicator className="absolute left-2"><Check className="size-3.5" /></RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                {o.hint && <span className="text-xs text-muted-foreground">({o.hint})</span>}
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}

export function Button({ variant = 'secondary', className, ...props }: ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
}) {
  // Props (and the ref) must pass through: Radix triggers rely on them when they wrap this button.
  return (
    <button type="button" {...props}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'primary' && 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        variant === 'destructive' && 'bg-destructive text-white shadow-sm hover:bg-destructive/90',
        variant === 'ghost' && 'hover:bg-accent text-muted-foreground hover:text-foreground',
        className,
      )} />
  )
}
