import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ioState = vi.hoisted(() => ({ instances: [] }))

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

    simulateConnect () {
      this.connected = true
      this.active = true
      this.fire('connect')
    }

    simulateDisconnect (reason = 'transport close') {
      this.connected = false
      this.fire('disconnect', reason)
    }

    listenerCount (event) {
      return (this.listeners[event] || []).length
    }

    joins () {
      return this.emitted.filter(([event]) => event === 'join').map(([, room]) => room)
    }

    leaves () {
      return this.emitted.filter(([event]) => event === 'leave').map(([, room]) => room)
    }
  }

  const io = (url, options) => {
    const instance = new FakeIoSocket(url, options)
    ioState.instances.push(instance)
    return instance
  }
  return { default: io }
})

const { Socket } = await import('../socket')

const createSocket = () => {
  const socket = new Socket({ url: 'wss://sockets.test', project: 'demo', accessToken: 'token' })
  socket.connect()
  return socket
}

describe('Socket', () => {
  beforeEach(() => {
    ioState.instances.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('configures socket.io reconnection backoff', () => {
    createSocket()
    expect(ioState.instances[0].options).toMatchObject({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5
    })
  })

  it('sends a join made while connecting only once on the first connect', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    socket.join('orders_1')
    io.simulateConnect()
    expect(io.joins()).toEqual(['demo_orders_1'])
  })

  it('restores each room once per reconnect without growing joins or listeners', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('orders_1')
    socket.join({ room: 'orders', role: 'customer', user_id: 1 })
    const connectListeners = io.listenerCount('connect')
    const disconnectListeners = io.listenerCount('disconnect')

    for (let cycle = 0; cycle < 5; cycle++) {
      io.emitted.length = 0
      io.simulateDisconnect()
      io.simulateConnect()
      expect(io.joins()).toEqual(['demo_orders_1', { room: 'orders', role: 'customer', user_id: 1 }])
    }

    expect(io.listenerCount('connect')).toBe(connectListeners)
    expect(io.listenerCount('disconnect')).toBe(disconnectListeners)
    expect(ioState.instances).toHaveLength(1)
  })

  it('emits one join for repeated joins of the same room', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('orders_1')
    socket.join('orders_1')
    socket.join('orders_1')
    expect(io.joins()).toEqual(['demo_orders_1'])
  })

  it('keeps a shared room until every subscriber leaves', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('orders_1')
    socket.join('orders_1')

    socket.leave('orders_1')
    vi.advanceTimersByTime(1000)
    expect(io.leaves()).toEqual([])

    socket.leave('orders_1')
    vi.advanceTimersByTime(1000)
    expect(io.leaves()).toEqual(['demo_orders_1'])

    io.emitted.length = 0
    io.simulateDisconnect()
    io.simulateConnect()
    expect(io.joins()).toEqual([])
  })

  it('does not emit leave and join when a room is re-joined within the debounce', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('orders_1')
    socket.leave('orders_1')
    socket.join('orders_1')
    vi.advanceTimersByTime(1000)
    expect(io.joins()).toEqual(['demo_orders_1'])
    expect(io.leaves()).toEqual([])
  })

  it('ignores leaves for rooms that were never joined', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.leave('orders_1')
    vi.advanceTimersByTime(1000)
    expect(io.leaves()).toEqual([])
  })

  it('switches rooms by leaving the old one and joining the new one once', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('orders_1')
    socket.leave('orders_1')
    socket.join('orders_2')
    vi.advanceTimersByTime(1000)
    expect(io.joins()).toEqual(['demo_orders_1', 'demo_orders_2'])
    expect(io.leaves()).toEqual(['demo_orders_1'])
  })

  it('rejoins only the current room after switching rooms and reconnecting', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('messages_orders_1_0')
    socket.leave('messages_orders_1_0')
    socket.join('messages_orders_2_0')
    vi.advanceTimersByTime(1000)

    io.emitted.length = 0
    io.simulateDisconnect()
    io.simulateConnect()
    expect(io.joins()).toEqual(['demo_messages_orders_2_0'])
  })

  it('does not restore a room whose leave was pending when the connection dropped', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('orders_1')
    socket.leave('orders_1')
    io.simulateDisconnect()
    io.emitted.length = 0
    io.simulateConnect()
    vi.advanceTimersByTime(1000)
    expect(io.joins()).toEqual([])
    expect(io.leaves()).toEqual([])
  })

  it('leaves the reconnect to socket.io on transport disconnects', () => {
    createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    io.simulateDisconnect('transport close')
    vi.advanceTimersByTime(120000)
    expect(io.connectCalls).toBe(0)
  })

  it('keeps an intentionally closed socket closed', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.close()
    vi.advanceTimersByTime(120000)
    expect(io.closeCalls).toBe(1)
    expect(io.connectCalls).toBe(0)
  })

  it('closes a socket that never finished connecting', () => {
    const socket = createSocket()
    socket.close()
    expect(ioState.instances[0].closeCalls).toBe(1)
  })

  it('reconnects after a server disconnect with backoff instead of immediately', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()

    io.simulateDisconnect('io server disconnect')
    vi.advanceTimersByTime(999)
    expect(io.connectCalls).toBe(0)
    vi.advanceTimersByTime(1)
    expect(io.connectCalls).toBe(1)

    io.simulateConnect()
    io.simulateDisconnect('io server disconnect')
    vi.advanceTimersByTime(1999)
    expect(io.connectCalls).toBe(1)
    vi.advanceTimersByTime(1)
    expect(io.connectCalls).toBe(2)
    Math.random.mockRestore()
  })

  it('retries a rejected handshake with backoff but not an invalid signature', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    createSocket()
    const io = ioState.instances[0]

    io.active = true
    io.fire('connect_error', new Error('xhr poll error'))
    vi.advanceTimersByTime(120000)
    expect(io.connectCalls).toBe(0)

    io.active = false
    io.fire('connect_error', new Error('invalid signature'))
    vi.advanceTimersByTime(120000)
    expect(io.connectCalls).toBe(0)

    io.fire('connect_error', new Error('unauthorized'))
    io.fire('connect_error', new Error('unauthorized'))
    vi.advanceTimersByTime(1000)
    expect(io.connectCalls).toBe(1)
    Math.random.mockRestore()
  })

  it('restarts the backoff after a stable connection even when the next failure is a rejected handshake', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    createSocket()
    const io = ioState.instances[0]
    io.active = false
    io.fire('connect_error', new Error('unauthorized'))
    vi.advanceTimersByTime(1000)
    io.fire('connect_error', new Error('unauthorized'))
    vi.advanceTimersByTime(2000)
    io.fire('connect_error', new Error('unauthorized'))
    vi.advanceTimersByTime(4000)
    expect(io.connectCalls).toBe(3)

    io.simulateConnect()
    vi.advanceTimersByTime(30000)
    io.simulateDisconnect('transport close')
    io.active = false
    io.fire('connect_error', new Error('unauthorized'))
    vi.advanceTimersByTime(999)
    expect(io.connectCalls).toBe(3)
    vi.advanceTimersByTime(1)
    expect(io.connectCalls).toBe(4)
    Math.random.mockRestore()
  })

  it('keeps growing the backoff while the server rejects right after connecting', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    io.simulateDisconnect('io server disconnect')
    vi.advanceTimersByTime(1000)
    io.simulateConnect()
    io.simulateDisconnect('io server disconnect')
    vi.advanceTimersByTime(1999)
    expect(io.connectCalls).toBe(1)
    vi.advanceTimersByTime(1)
    expect(io.connectCalls).toBe(2)
    Math.random.mockRestore()
  })

  it('starts a fresh backoff after the socket is closed and connected again', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    io.simulateDisconnect('io server disconnect')
    vi.advanceTimersByTime(1000)
    io.simulateConnect()
    io.simulateDisconnect('io server disconnect')
    vi.advanceTimersByTime(2000)
    expect(io.connectCalls).toBe(2)

    socket.close()
    socket.connect()
    io.simulateConnect()
    io.simulateDisconnect('io server disconnect')
    vi.advanceTimersByTime(999)
    expect(io.connectCalls).toBe(3)
    vi.advanceTimersByTime(1)
    expect(io.connectCalls).toBe(4)
    Math.random.mockRestore()
  })

  it('registers listeners while disconnected so a later off removes them', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    const handler = vi.fn()
    socket.on('update_order', handler)
    io.simulateConnect()
    socket.off('update_order', handler)
    io.fire('update_order', { id: 1 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('applies listeners registered before connect is called', () => {
    const socket = new Socket({ url: 'wss://sockets.test', project: 'demo' })
    const handler = vi.fn()
    socket.on('carts_update', handler)
    socket.connect()
    ioState.instances[0].fire('carts_update', { id: 1 })
    expect(handler).toHaveBeenCalledWith({ id: 1 })
  })

  it('reuses the same socket.io instance when connect is called again', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.close()
    socket.connect()
    expect(ioState.instances).toHaveLength(1)
    expect(io.connectCalls).toBe(1)
  })

  it('keeps delivering events to listeners across reconnects', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    const handleUpdateOrder = vi.fn()
    const handleRegister = vi.fn()
    socket.on('update_order', handleUpdateOrder)
    io.simulateConnect()
    socket.on('orders_register', handleRegister)

    for (let cycle = 0; cycle < 3; cycle++) {
      io.simulateDisconnect()
      io.simulateConnect()
    }
    io.fire('update_order', { id: 1 })
    io.fire('orders_register', { id: 2 })

    expect(handleUpdateOrder).toHaveBeenCalledTimes(1)
    expect(handleRegister).toHaveBeenCalledTimes(1)
  })

  it('keeps rooms joined without a leave, like the app navigators, and restores them after reconnects', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    const driverRoom = { project: 'demo', room: 'drivers', user_id: 7, role: 'driver' }
    const joinNavigatorRooms = () => {
      socket.join('orders_7')
      socket.join('messages_orders_7')
      socket.join(driverRoom)
    }
    joinNavigatorRooms()
    io.simulateConnect()
    expect(io.joins()).toEqual(['demo_orders_7', 'demo_messages_orders_7', driverRoom])

    io.emitted.length = 0
    io.simulateDisconnect()
    joinNavigatorRooms()
    io.simulateConnect()
    joinNavigatorRooms()
    vi.advanceTimersByTime(1000)
    expect(io.joins()).toEqual(['demo_orders_7', 'demo_messages_orders_7', driverRoom])
    expect(io.leaves()).toEqual([])
  })

  it('keeps the orders room when a list skips its leave and another screen leaves it', () => {
    const socket = createSocket()
    const io = ioState.instances[0]
    io.simulateConnect()
    socket.join('orders_7')
    socket.join('orders_7')
    socket.leave('orders_7')
    vi.advanceTimersByTime(1000)
    expect(io.leaves()).toEqual([])

    io.emitted.length = 0
    io.simulateDisconnect()
    io.simulateConnect()
    expect(io.joins()).toEqual(['demo_orders_7'])
  })
})
