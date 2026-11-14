import { AMPS, ampById } from '../data/amps'
import { Select } from './ui'

/** Amp model picker: v2-only models are hidden on v1 amps (the current one stays shown, with a warning). */
export function AmpSelect({ model, isV2, onChange }: { model: number; isV2: boolean; onChange: (v: string) => void }) {
  const cur = ampById(model)
  const curBlocked = !!cur?.v2Only && !isV2
  const options = AMPS
    .filter((a) => !a.v2Only || isV2 || a.id === model)
    .map((a) => ({
      value: String(a.id),
      label: a.name,
      hint: a.id === model && curBlocked ? 'Not on this amp' : a.basedOn,
    }))
  return (
    <div>
      <Select large className="mt-1.5 w-96" value={String(model)} onChange={onChange} options={options} />
      {curBlocked && (
        <p className="mt-1.5 text-[11px] text-destructive">This amp model needs a Mustang v2. Your amp plays it as Off.</p>
      )}
    </div>
  )
}
