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

const { WebsocketProvider, useWebsocket } = await import('../index')

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

  describe('logout and session changes', () => {
    const strategy = { getItem: vi.fn(), removeItem: vi.fn() }
    const seen = []

    const Probe = () => {
      const socket = useWebsocket()
      if (!seen.includes(socket)) seen.push(socket)
      return null
    }

    const tree = (providerSettings, room = 'orders_1') => (
      <WebsocketProvider settings={providerSettings} strategy={strategy}>
        <Probe />
        <RoomSubscriber room={room} />
      </WebsocketProvider>
    )

    const loggedIn = (token = 'token-1', id = 1) => ({ loading: false, auth: true, token, user: { id } })
    const loggedOut = () => ({ loading: false, auth: false, token: null, user: null })

    const update = (view, providerSettings, session) => {
      state.session = session
      act(() => { view.rerender(tree(providerSettings)) })
    }

    const wrapperWithRooms = () => seen.find(socket => socket.socket && Object.keys(socket.rooms).length > 0)

    beforeEach(() => {
      seen.length = 0
    })

    describe.each([
      ['use_root_point', { project: 'demo', use_root_point: true }],
      ['no use_root_point', { project: 'demo' }]
    ])('logout with %s', (_name, providerSettings) => {
      it('leaves no live connection and no remembered rooms of the previous user, and does not revive it', () => {
        const view = render(tree(providerSettings))
        const first = state.instances[0]
        connect(first)
        const previous = wrapperWithRooms()
        expect(Object.keys(previous.rooms)).toEqual(['demo_orders_1'])

        update(view, providerSettings, loggedOut())
        act(() => { vi.advanceTimersByTime(120000) })

        expect(first.connectCalls).toBe(0)
        expect(first.connected).toBe(false)
        expect(first.closeCalls).toBeGreaterThan(0)
        expect(previous.rooms).toEqual({})
        expect(previous.closed).toBe(true)
        expect(joinsOf(first)).toEqual(['demo_orders_1'])
        // Nothing from the previous user is joined or connected from here on
        state.instances.slice(1).forEach(io => {
          expect(io.options.query).not.toContain('token-1')
          expect(io.options.extraHeaders).toBeUndefined()
        })
      })

      it('keeps the hook usable: same methods, whatever the provider holds', () => {
        const view = render(tree(providerSettings))
        connect(state.instances[0])
        update(view, providerSettings, loggedOut())
        const current = seen[seen.length - 1]
        ;['join', 'leave', 'on', 'off'].forEach(method => {
          expect(typeof current[method]).toBe('function')
          expect(() => current[method]('orders_9', () => {})).not.toThrow()
        })
      })

      it('creates a fresh connection on a later login with the new token, rejoining only what is mounted', () => {
        const view = render(tree(providerSettings))
        connect(state.instances[0])
        update(view, providerSettings, loggedOut())
        update(view, providerSettings, loggedIn('token-2', 2))

        const created = state.instances
        const last = created[created.length - 1]
        expect(last).not.toBe(created[0])
        expect(last.options.query).toContain('token=token-2')
        expect(last.options.extraHeaders).toEqual({ Authorization: 'Bearer token-2' })
        connect(last)
        expect(joinsOf(last)).toEqual(['demo_orders_1'])
        expect(created[0].connectCalls).toBe(0)
        expect(created[0].connected).toBe(false)
      })
    })

    it('with use_root_point a logout creates no new socket', () => {
      const providerSettings = { project: 'demo', use_root_point: true }
      const view = render(tree(providerSettings))
      update(view, providerSettings, loggedOut())
      expect(state.instances).toHaveLength(1)
    })

    it('without use_root_point a logout creates a guest socket without token', () => {
      const providerSettings = { project: 'demo' }
      const view = render(tree(providerSettings))
      connect(state.instances[0])
      update(view, providerSettings, loggedOut())
      expect(state.instances).toHaveLength(2)
      expect(state.instances[1].options.query).toBe('project=demo')
      expect(state.instances[1].options.extraHeaders).toBeUndefined()
      expect(state.instances[1].closeCalls).toBe(0)
    })

    it('a token change while logged in replaces the connection once and drops the old one', () => {
      const providerSettings = { project: 'demo' }
      const view = render(tree(providerSettings))
      const first = state.instances[0]
      connect(first)
      const previous = wrapperWithRooms()
      update(view, providerSettings, loggedIn('token-2', 1))
      expect(state.instances).toHaveLength(2)
      expect(first.connectCalls).toBe(0)
      expect(first.connected).toBe(false)
      expect(previous.rooms).toEqual({})
      const second = state.instances[1]
      expect(second.options.query).toContain('token=token-2')
      connect(second)
      expect(joinsOf(second)).toEqual(['demo_orders_1'])
      act(() => { vi.advanceTimersByTime(120000) })
      expect(state.instances).toHaveLength(2)
      expect(second.closeCalls).toBe(0)
    })

    it('a user id change with the same token still reconnects the same wrapper and keeps its rooms', () => {
      const providerSettings = { project: 'demo' }
      const view = render(tree(providerSettings))
      const first = state.instances[0]
      connect(first)
      const wrapper = wrapperWithRooms()
      update(view, providerSettings, loggedIn('token-1', 2))
      expect(state.instances).toHaveLength(1)
      expect(first.closeCalls).toBe(1)
      expect(first.connectCalls).toBe(1)
      expect(Object.keys(wrapper.rooms)).toEqual(['demo_orders_1'])
    })

    it('guests (no token, no use_root_point) get one tokenless connection, as before', () => {
      state.session = loggedOut()
      const providerSettings = { project: 'demo' }
      const view = render(tree(providerSettings))
      expect(state.instances).toHaveLength(1)
      expect(state.instances[0].options.query).toBe('project=demo')
      expect(state.instances[0].options.extraHeaders).toBeUndefined()
      connect(state.instances[0])
      expect(joinsOf(state.instances[0])).toEqual(['demo_orders_1'])
      update(view, providerSettings, loggedOut())
      expect(state.instances).toHaveLength(1)
      expect(state.instances[0].closeCalls).toBe(0)
    })

    it('guests with use_root_point get no connection until they log in', () => {
      state.session = loggedOut()
      const providerSettings = { project: 'demo', use_root_point: true }
      const view = render(tree(providerSettings))
      expect(state.instances).toHaveLength(0)
      update(view, providerSettings, loggedIn())
      expect(state.instances).toHaveLength(1)
      expect(state.instances[0].options.query).toContain('token=token-1')
    })
  })
})
