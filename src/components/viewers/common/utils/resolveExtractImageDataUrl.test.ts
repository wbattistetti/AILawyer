import { describe, expect, it } from 'vitest'
import { resolveExtractImageDataUrl } from './resolveExtractImageDataUrl'

describe('resolveExtractImageDataUrl', () => {
  it('returns metadata.imageDataUrl when present', () => {
    expect(
      resolveExtractImageDataUrl({
        metadata: { imageDataUrl: 'data:image/png;base64,abc' }
      })
    ).toBe('data:image/png;base64,abc')
  })

  it('returns undefined when metadata has empty or missing imageDataUrl', () => {
    expect(resolveExtractImageDataUrl({})).toBeUndefined()
    expect(resolveExtractImageDataUrl({ metadata: {} })).toBeUndefined()
    expect(resolveExtractImageDataUrl({ metadata: { imageDataUrl: '' } })).toBeUndefined()
  })
})
