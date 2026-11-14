// Pick a few library presets that look like the player's request, to show the model examples.
import type { Preset } from '../protocol/preset'

export interface ExampleEntry { search: string; preset: Preset }

const STOPWORDS = new Set([
  'sound', 'tone', 'want', 'like', 'some', 'more', 'less', 'kind', 'with', 'that', 'this',
  'much', 'preset', 'create', 'make', 'give', 'little', 'very', 'really', 'have', 'from',
  'please', 'would', 'could', 'should', 'about', 'just', 'also', 'into', 'over', 'what',
])

const words = (text: string) => new Set(
  text.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
)

/** Top entries whose search text mentions the most distinct words of the prompt, stable order. */
export function findExamples(entries: ExampleEntry[], prompt: string, max = 4): ExampleEntry[] {
  const wanted = words(prompt)
  if (!wanted.size) return []
  return entries
    .map((e, i) => ({ e, i, score: [...wanted].filter((w) => e.search.includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((x) => x.e)
}
