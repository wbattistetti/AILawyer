/**
 * Tests for document thumbnail header style resolution.
 */

import { describe, expect, it } from 'vitest'
import {
  getDocumentHeaderColorClass,
  resolveDocumentHeaderKind,
  resolveDocumentHeaderStyle,
} from './documentHeaderStyle'

describe('resolveDocumentHeaderKind', () => {
  it('classifies PDF by extension and mime', () => {
    expect(resolveDocumentHeaderKind({ filename: 'atto.pdf' })).toBe('pdf')
    expect(resolveDocumentHeaderKind({ filename: 'atto', mime: 'application/pdf' })).toBe('pdf')
  })

  it('classifies Word by extension and mime', () => {
    expect(resolveDocumentHeaderKind({ filename: 'memoria.docx' })).toBe('word')
    expect(resolveDocumentHeaderKind({ filename: 'memoria.doc' })).toBe('word')
    expect(
      resolveDocumentHeaderKind({
        filename: 'memoria',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    ).toBe('word')
  })

  it('classifies images, video and audio', () => {
    expect(resolveDocumentHeaderKind({ filename: 'foto.png' })).toBe('image')
    expect(resolveDocumentHeaderKind({ filename: 'clip.mp4' })).toBe('video')
    expect(resolveDocumentHeaderKind({ filename: 'audio.mp3' })).toBe('audio')
  })

  it('prefers extract over file extension', () => {
    expect(resolveDocumentHeaderKind({ filename: 'atto.pdf', isExtract: true })).toBe('extract')
  })

  it('falls back to unknown for unsupported formats', () => {
    expect(resolveDocumentHeaderKind({ filename: 'dati.csv' })).toBe('unknown')
  })
})

describe('resolveDocumentHeaderStyle', () => {
  it('maps kinds to distinct brand-like colors', () => {
    expect(getDocumentHeaderColorClass('pdf')).toBe('bg-red-600')
    expect(getDocumentHeaderColorClass('word')).toBe('bg-blue-600')
    expect(getDocumentHeaderColorClass('image')).toBe('bg-violet-600')
    expect(getDocumentHeaderColorClass('video')).toBe('bg-indigo-600')
    expect(getDocumentHeaderColorClass('audio')).toBe('bg-emerald-600')
    expect(getDocumentHeaderColorClass('extract')).toBe('bg-emerald-400')
    expect(getDocumentHeaderColorClass('unknown')).toBe('bg-slate-500')
  })

  it('returns icon and color together', () => {
    const pdf = resolveDocumentHeaderStyle({ filename: '84704.pdf' })
    expect(pdf.kind).toBe('pdf')
    expect(pdf.headerColorClass).toBe('bg-red-600')
    expect(pdf.iconSrc).toContain('adobe-acrobat-reader')

    const word = resolveDocumentHeaderStyle({ filename: 'ANALISI.docx' })
    expect(word.kind).toBe('word')
    expect(word.headerColorClass).toBe('bg-blue-600')
    expect(word.iconSrc).toContain('microsoft-word')

    const image = resolveDocumentHeaderStyle({ filename: 'foto.png' })
    expect(image.iconSrc).toContain('image')
    expect(resolveDocumentHeaderStyle({ filename: 'clip.mp4' }).iconSrc).toContain('video')
    expect(resolveDocumentHeaderStyle({ filename: 'audio.mp3' }).iconSrc).toContain('audio')
    expect(resolveDocumentHeaderStyle({ filename: 'estratto.json', isExtract: true }).iconSrc).toContain('extract')
    expect(resolveDocumentHeaderStyle({ filename: 'dati.csv' }).iconSrc).toContain('file-generic')
  })
})
