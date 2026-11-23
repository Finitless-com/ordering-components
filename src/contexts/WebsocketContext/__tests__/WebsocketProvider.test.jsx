import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

const state = vi.hoisted(() => ({ instances: [], session: null }))

vi.mock('../../SessionContext', () => ({
  useSession: () => [state.session]
}))

vi.mock('socket.io-client', () => {
  class FakeIoSocket {
    constructor (url, options) {
      this.url = url
      this.options = options
      this.listeners = {}
      this.emitted = []
      this.connected = false
      this.active = true
      this.connectCalls = 0
      this.closeCalls = 0
    }

    on (event, func) {
      this.listeners[event] = [...(this.listeners[event] || []), func]
      return this
    }

    off (event, func) {
      this.listeners[event] = (this.listeners[event] || []).filter(listener => listener !== func)
      return this
    }

    emit (event, payload) {
      this.emitted.push([event, payload])
      return this
    }

    fire (event, ...args) {
      ;(this.listeners[event] || []).forEach(listener => listener(...args))
    }

    connect () {
      this.connectCalls += 1
      return this
    }

    close () {
      this.closeCalls += 1
      this.connected = false
      this.active = false
      this.fire('disconnect', 'io client disconnect')
      return this
    }

    listenerCount (event) {
      return (this.listeners[event] || []).length
    }
  }

  return {
    default: (url, options) => {
      const instance = new FakeIoSocket(url, options)
      state.instances.push(instance)
      return instance
    }
  }
})

const { WebsocketProvider, useWebsocket, socketUrlOf, DEFAULT_SOCKET_URL } = await import('../index')

const settings = { project: 'demo' }

const RoomSubscriber = ({ room }) => {
  const socket = useWebsocket()
  React.useEffect(() => {
    socket.join(room)
    return () => {
      socket.leave(room)
    }
  }, [socket, room])
  return null
}

const renderProvider = (room = 'orders_1') => render(
  <WebsocketProvider settings={settings} strategy={{ getItem: vi.fn(), removeItem: vi.fn() }}>
    <RoomSubscriber room={room} />
  </WebsocketProvider>
)

const connect = (io) => {
  act(() => {
    io.connected = true
    io.fire('connect')
  })
}

const disconnect = (io, reason = 'transport close') => {
  act(() => {
    io.connected = false
    io.fire('disconnect', reason)
  })
}

const joinsOf = (io) => io.emitted.filter(([event]) => event === 'join').map(([, room]) => room)

describe('WebsocketProvider', () => {
  beforeEach(() => {
    state.instances.length = 0
    state.session = { loading: false, auth: true, token: 'token-1', user: { id: 1 } }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps one join per room and stable listeners across offline/online cycles and session re-renders', () => {
    const view = renderProvider()
    const io = state.instances[0]
    view.rerender(
      <WebsocketProvider settings={settings} strategy={{ getItem: vi.fn(), removeItem: vi.fn() }}>
        <RoomSubscriber room='orders_1' />
      </WebsocketProvider>
    )
    connect(io)
    expect(joinsOf(io)).toEqual(['demo_orders_1'])
    const disconnectListeners = io.listenerCount('disconnect')

    for (let cycle = 0; cycle < 5; cycle++) {
      state.session = { ...state.session }
      view.rerender(
        <WebsocketProvider settings={settings} strategy={{ getItem: vi.fn(), removeItem: vi.fn() }}>
          <RoomSubscriber room='orders_1' />
        </WebsocketProvider>
      )
      io.emitted.length = 0
      disconnect(io)
      act(() => { vi.advanceTimersByTime(120000) })
      connect(io)
      expect(joinsOf(io)).toEqual(['demo_orders_1'])
    }

    expect(io.listenerCount('disconnect')).toBe(disconnectListeners)
    expect(io.connectCalls).toBe(0)
    expect(state.instances).toHaveLength(1)
  })

  it('closes the superseded socket on token change without reviving it', () => {
    const view = renderProvider()
    const first = state.instances[0]
    connect(first)
    for (let render = 0; render < 3; render++) {
      state.session = { ...state.session }
      view.rerender(
        <WebsocketProvider settings={settings} strategy={{ getItem: vi.fn(), removeItem: vi.fn() }}>
          <RoomSubscriber room='orders_1' />
        </WebsocketProvider>
      )
    }

    state.session = { ...state.session, token: 'token-2' }
    view.rerender(
      <WebsocketProvider settings={settings} strategy={{ getItem: vi.fn(), removeItem: vi.fn() }}>
        <RoomSubscriber room='orders_1' />
      </WebsocketProvider>
    )
    act(() => { vi.advanceTimersByTime(120000) })

    expect(state.instances).toHaveLength(2)
    expect(first.closeCalls).toBe(1)
    expect(first.connectCalls).toBe(0)
    expect(state.instances[1].options.query).toContain('token=token-2')
  })

  it('moves the subscription when the room changes', () => {
    const view = renderProvider('orders_1')
    const io = state.instances[0]
    connect(io)
    view.rerender(
      <WebsocketProvider settings={settings} strategy={{ getItem: vi.fn(), removeItem: vi.fn() }}>
        <RoomSubscriber room='orders_2' />
      </WebsocketProvider>
    )
    act(() => { vi.advanceTimersByTime(1000) })
    expect(io.emitted).toEqual([
      ['join', 'demo_orders_1'],
      ['join', 'demo_orders_2'],
      ['leave', 'demo_orders_1']
    ])
  })

  describe('socket url', () => {
    const strategy = { getItem: vi.fn(), removeItem: vi.fn() }
    const urlFor = (extraSettings) => {
      state.instances.length = 0
      render(
        <WebsocketProvider settings={{ project: 'demo', ...extraSettings }} strategy={strategy}>
          <RoomSubscriber room='orders_1' />
        </WebsocketProvider>
      )
      expect(state.instances).toHaveLength(1)
      return state.instances[0].url
    }

    it('connects to the v3 host when the settings have no override_url', () => {
      expect(DEFAULT_SOCKET_URL).toBe('https://sockets-v3.orderingplus.com')
      expect(urlFor({})).toBe('https://sockets-v3.orderingplus.com')
    })

    it('connects to override_url when it is set, trimmed', () => {
      expect(urlFor({ override_url: 'http://localhost:3000' })).toBe('http://localhost:3000')
      expect(urlFor({ override_url: '  https://sockets.staging.test  ' })).toBe('https://sockets.staging.test')
    })

    it('still ignores the legacy url of the settings', () => {
      expect(urlFor({ url: 'https://sockets-v2.orderingplus.com' })).toBe('https://sockets-v3.orderingplus.com')
      expect(urlFor({ url: 'https://old.host', override_url: 'http://localhost:3000' })).toBe('http://localhost:3000')
    })

    it('falls back to the default for an empty, blank or non-string override_url', () => {
      ;['', '   ', null, undefined, 42, {}, ['http://x']].forEach((override_url) => {
        expect(urlFor({ override_url })).toBe('https://sockets-v3.orderingplus.com')
      })
    })

    it('socketUrlOf tolerates missing settings', () => {
      expect(socketUrlOf(undefined)).toBe(DEFAULT_SOCKET_URL)
      expect(socketUrlOf(null)).toBe(DEFAULT_SOCKET_URL)
    })
  })
})
