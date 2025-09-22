import type { Fonte } from '../types/graph'

export function fonteColor(f?: Fonte): string {
  switch (f) {
    case 'PG': return '#2563eb' // blue-600
    case 'PM': return '#7c3aed' // violet-600
    case 'DIFESA': return '#16a34a' // green-600
    case 'UFFICIO': return '#f59e0b' // amber-500
    default: return '#9ca3af' // gray-400
  }
}


