export interface AmpModel {
  id: number
  name: string
  basedOn: string
  magic: [number, number, number, number, number]
  dualGain?: boolean
  v2Only?: boolean
}

/** The amp model value for "no amp", as the amp reports it for a preset such as "Empty". */
export const AMP_OFF = 0

export const AMPS: AmpModel[] = [
  { id: AMP_OFF, name: 'Off', basedOn: 'No amp model', magic: [0, 0, 0, 0, 0] },
  { id: 103, name: "Fender '57 Deluxe", basedOn: '1957 Fender Deluxe', magic: [1, 1, 1, 1, 83] },
  { id: 100, name: "Fender '59 Bassman", basedOn: '1959 Fender Bassman', magic: [2, 2, 2, 2, 103] },
  { id: 124, name: "Fender '57 Champ", basedOn: '1957 Fender Champ', magic: [12, 12, 12, 12, 0] },
  { id: 83, name: "Fender '65 Deluxe Reverb", basedOn: '1965 Fender Deluxe Reverb', magic: [3, 3, 3, 3, 106] },
  { id: 106, name: "Fender '65 Princeton", basedOn: '1965 Fender Princeton Reverb', magic: [4, 4, 4, 4, 97] },
  { id: 117, name: "Fender '65 Twin Reverb", basedOn: '1965 Fender Twin Reverb', magic: [5, 5, 5, 5, 114] },
  { id: 114, name: 'Fender Super-Sonic', basedOn: 'Fender Super-Sonic 22', magic: [6, 6, 6, 6, 121], dualGain: true },
  { id: 97, name: 'British 60s', basedOn: 'VOX AC30', magic: [7, 7, 7, 7, 94] },
  { id: 121, name: 'British 70s', basedOn: 'Marshall 1959SLP', magic: [11, 11, 11, 11, 124] },
  { id: 94, name: 'British 80s', basedOn: 'Marshall JCM 800', magic: [9, 9, 9, 9, 93] },
  { id: 93, name: 'American 90s', basedOn: 'Mesa/Boogie Dual Rectifier', magic: [10, 10, 10, 10, 109] },
  { id: 109, name: 'Metal 2000', basedOn: 'Peavey 5150', magic: [8, 8, 8, 8, 117] },
  { id: 241, name: 'Studio Preamp', basedOn: 'Direct Signal (No Modeling)', magic: [13, 13, 13, 13, 246], v2Only: true },
  { id: 246, name: "Fender '57 Twin", basedOn: '1957 Fender Twin', magic: [14, 14, 14, 14, 249], v2Only: true },
  { id: 249, name: "Fender '60s Thrift", basedOn: 'Sears 1964 Silvertone', magic: [15, 15, 15, 15, 252], v2Only: true },
  { id: 252, name: 'British Colour', basedOn: 'Orange Custom Shop', magic: [16, 16, 16, 16, 255], v2Only: true },
  { id: 255, name: 'British Watts', basedOn: 'HiWatt 100 DR103', magic: [17, 17, 17, 17, 0], v2Only: true },
]

export const ampById = (id: number) => AMPS.find((a) => a.id === id)

export const CABINETS = [
  { id: 0, name: 'Off', basedOn: '' },
  { id: 1, name: '57 Deluxe 1×12', basedOn: "Fender '57 Deluxe" },
  { id: 2, name: 'Bassman 4×10', basedOn: "Fender '59 Bassman" },
  { id: 3, name: "'65 Deluxe 1×12", basedOn: "Fender '65 Deluxe" },
  { id: 4, name: "'65 Princeton 1×10", basedOn: "Fender '65 Princeton" },
  { id: 5, name: 'Champ 1×6', basedOn: "Fender '57 Champion" },
  { id: 6, name: '4×12 Modern', basedOn: 'Peavey 5150 4x12 (Sheffield)' },
  { id: 7, name: '2×12 Celestion', basedOn: 'VOX AC30' },
  { id: 8, name: '4×12 Greenback', basedOn: 'Marshall 1960TV' },
  { id: 9, name: "'65 Twin 2×12", basedOn: "Fender '65 Twin" },
  { id: 10, name: '4×12 Vintage', basedOn: 'Marshall 1960A' },
  { id: 11, name: 'Super-Sonic 2×12', basedOn: 'Fender Super-Sonic 60' },
  { id: 12, name: 'Super-Sonic 1×12', basedOn: 'Fender Super-Sonic 22' },
]

export const NOISE_GATE = ['Off', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Custom']
export const SAG = ['Off', 'Light', 'Heavy']
