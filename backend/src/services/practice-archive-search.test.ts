/**
 * Test merge locator e contratto ricerca pratica (senza DB).
 */

import { describe, expect, it } from 'vitest'
import { mergePracticeSearchLocators } from './practice-archive-search'

describe('mergePracticeSearchLocators', () => {
  it('mantiene i documenti DB e arricchisce con locator client', () => {
    const merged = mergePracticeSearchLocators(
      [{ id: 'db-1', filename: 'Atto.pdf', hash: 'abc', s3Key: 'pratiche/a/Atto.pdf' }],
      [{ id: 'temp:dead', hash: 'deadbeef', filename: 'Locale.pdf' }]
    )

    expect(merged).toEqual([
      {
        id: 'db-1',
        hash: 'abc',
        storageKey: 'pratiche/a/Atto.pdf',
        filename: 'Atto.pdf'
      },
      {
        id: 'temp:dead',
        hash: 'deadbeef',
        filename: 'Locale.pdf'
      }
    ])
  })

  it('non duplica lo stesso id e preferisce hash/storageKey client se presenti', () => {
    const merged = mergePracticeSearchLocators(
      [{ id: 'doc-1', filename: 'A.pdf', hash: null, s3Key: 'old-key' }],
      [{ id: 'doc-1', hash: 'new-hash', storageKey: 'new-key', filename: 'A-renamed.pdf' }]
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual({
      id: 'doc-1',
      hash: 'new-hash',
      storageKey: 'new-key',
      filename: 'A-renamed.pdf'
    })
  })
})
