import { describe, expect, it } from 'vitest'
import { newPreset } from '../protocol/preset'
import { findExamples } from './examples'

const entries = [
  { search: 'gilmour shine on david solo delay', preset: newPreset('gilmour') },
  { search: 'hendrix fuzz voodoo', preset: newPreset('hendrix') },
  { search: 'another gilmour delay echo', preset: newPreset('gilmour2') },
  { search: 'warm jazz chorus', preset: newPreset('jazz') },
  { search: 'david bowie', preset: newPreset('david') },
]

describe('findExamples', () => {
  it('scores by distinct words, skips stopwords and short words, respects max', () => {
    // "sound", "with", "the" are stopwords or short; gilmour + delay match two entries.
    const r = findExamples(entries, 'a gilmour sound with delay')
    expect(r.map((e) => e.preset.name)).toEqual(['gilmour', 'gilmour2'])
    expect(findExamples(entries, 'gilmour delay hendrix', 2).length).toBe(2)
  })

  it('ignores words shorter than 4 letters and returns nothing on no match', () => {
    expect(findExamples(entries, 'a bit of fuzz')).toEqual([entries[1]])
    expect(findExamples(entries, 'totally unrelated xyzzy')).toEqual([])
  })
})
