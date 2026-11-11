import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { EventProvider, useEvent } from '../index'

describe('EventContext', () => {
  it('provides shared emitter inside provider', () => {
    let captured
    const EventConsumer = () => {
      const [events] = useEvent()
      captured = events
      return null
    }

    render(
      <EventProvider>
        <EventConsumer />
      </EventProvider>
    )

    const handler = vi.fn()
    captured.on('test:event', handler)
    captured.emit('test:event', { ok: true })
    expect(handler).toHaveBeenCalledWith({ ok: true })
  })

  it('keeps the same emitter when the provider renders again', () => {
    const seen = []
    const EventConsumer = () => {
      const [events] = useEvent()
      seen.push(events)
      return null
    }
    const tree = () => (
      <EventProvider>
        <EventConsumer />
      </EventProvider>
    )

    const { rerender } = render(tree())
    const handler = vi.fn()
    seen[0].on('logout', handler)

    rerender(tree())
    const latest = seen[seen.length - 1]
    expect(seen.length).toBeGreaterThan(1)
    expect(latest).toBe(seen[0])
    act(() => latest.emit('logout'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('falls back to standalone emitter outside provider', () => {
    const TestHook = () => {
      const [events] = useEvent()
      expect(typeof events.emit).toBe('function')
      return null
    }
    render(<TestHook />)
  })
})
