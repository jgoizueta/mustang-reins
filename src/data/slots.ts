// Slot labels shared by the Amp Slots card and Library banks.
// Mustang I/II has 24 slots in three colour groups of eight (ORG/GRN/RED, letters A-G + #).
export const BANKS = [
  { key: 'org', label: 'ORG', dot: 'bg-primary' },
  { key: 'grn', label: 'GRN', dot: 'bg-green-500' },
  { key: 'red', label: 'RED', dot: 'bg-red-500' },
]
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', '#']

/** 24-slot label: "ORG A" … "RED #". */
export const slotLabel = (i: number) => `${BANKS[Math.floor(i / 8)].label} ${LETTERS[i % 8]}`

export type BankSize = 8 | 24 | 100

/** Label for a position inside a bank: colour+letter for 24, letter for 8, a number for 100. */
export function bankPositionLabel(size: BankSize, position: number): string {
  if (size === 24) return slotLabel(position)
  if (size === 8) return LETTERS[position] ?? String(position + 1)
  return String(position + 1)
}
