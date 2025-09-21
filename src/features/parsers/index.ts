import type { DetectFn } from './types'
import { detectContacts } from './contacts'
import { detectIds } from './ids'
import { detectPlaces } from './places'
import { detectVehicles } from './vehicles'
import { detectDocrefs } from './docrefs'

export const PARSERS: DetectFn[] = [
  detectContacts,
  detectIds,
  detectPlaces,
  detectVehicles,
  detectDocrefs,
]


