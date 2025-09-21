import { fromDetectFn, type Parser } from './base'
import type { ThingOut } from './types'
import { detectContacts } from './contacts'
import { detectIds } from './ids'
import { detectPlaces } from './places'
import { detectVehicles } from './vehicles'
import { detectDocrefs } from './docrefs'

// Wrap existing DetectFn parsers to the uniform Parser interface.
export const PARSERS_UNIFIED: Parser<ThingOut>[] = [
  fromDetectFn('contacts', detectContacts),
  fromDetectFn('ids', detectIds as any),
  fromDetectFn('places', detectPlaces as any),
  fromDetectFn('vehicles', detectVehicles),
  fromDetectFn('docrefs', detectDocrefs as any),
]


