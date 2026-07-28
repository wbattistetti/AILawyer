/**
 * Test per URL e scelta client al click notifica.
 */
import { describe, expect, it } from 'vitest'
import { pickClientToFocus, resolveNotificationTargetUrl } from './notificationFocus'

describe('notificationFocus', () => {
  const origin = 'http://localhost:6500'

  it('usa data.url same-origin', () => {
    expect(
      resolveNotificationTargetUrl({ url: 'http://localhost:6500/pratica/abc' }, origin)
    ).toBe('http://localhost:6500/pratica/abc')
  })

  it('accetta path relativo', () => {
    expect(resolveNotificationTargetUrl({ url: '/pratica/x' }, origin)).toBe(
      'http://localhost:6500/pratica/x'
    )
  })

  it('rifiuta cross-origin e torna alla home', () => {
    expect(
      resolveNotificationTargetUrl({ url: 'https://evil.example/phish' }, origin)
    ).toBe('http://localhost:6500/')
  })

  it('senza url torna alla home', () => {
    expect(resolveNotificationTargetUrl({}, origin)).toBe('http://localhost:6500/')
  })

  it('pickClientToFocus preferisce match esatto', () => {
    const clients = [
      { url: 'http://localhost:6500/' },
      { url: 'http://localhost:6500/pratica/abc' },
    ]
    expect(pickClientToFocus(clients, 'http://localhost:6500/pratica/abc', origin)?.url).toBe(
      'http://localhost:6500/pratica/abc'
    )
  })

  it('pickClientToFocus ignora client cross-origin', () => {
    expect(
      pickClientToFocus(
        [{ url: 'https://other.example/' }],
        'http://localhost:6500/',
        origin
      )
    ).toBeNull()
  })
})
