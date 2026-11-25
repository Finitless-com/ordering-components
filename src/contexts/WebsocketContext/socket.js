import io from 'socket.io-client'

const LEAVE_DEBOUNCE_MS = 500
const RECONNECTION_DELAY_MS = 1000
const RECONNECTION_DELAY_MAX_MS = 5000
const RANDOMIZATION_FACTOR = 0.5
const MANUAL_RECONNECT_BASE_MS = 1000
const MANUAL_RECONNECT_MAX_MS = 60000
const STABLE_CONNECTION_MS = 30000
const SESSION_REJECTED_MESSAGE = 'invalid signature'

/**
 * True when a `connect_error` means the server rejected the session (the token), as opposed to a
 * network failure. The wrapper does not schedule its own reconnection for these errors.
 * @param {Error|{message?: string}} error error received in the `connect_error` event
 */
export const isSessionRejectedError = (error) => error?.message === SESSION_REJECTED_MESSAGE

export class Socket {
  constructor ({ url, project, accessToken }) {
    this.url = url
    this.project = project
    this.accessToken = accessToken
    this.queue = []
    this.pendingLeaves = {}
    this.rooms = {}
    this.closed = false
    this.reconnectTimeout = null
    this.manualReconnectAttempts = 0
    this.connectedAt = null
    this.handleConnect = this.handleConnect.bind(this)
    this.handleDisconnect = this.handleDisconnect.bind(this)
    this.handleConnectError = this.handleConnectError.bind(this)
  }

  roomTarget (room) {
    return typeof room === 'string' ? `${this.project}_${room}` : room
  }

  roomKey (room) {
    return typeof room === 'string' ? `${this.project}_${room}` : JSON.stringify(room)
  }

  connect () {
    this.closed = false
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect()
      return
    }

    const options = {
      query: `project=${this.project}`,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: RECONNECTION_DELAY_MS,
      reconnectionDelayMax: RECONNECTION_DELAY_MAX_MS,
      randomizationFactor: RANDOMIZATION_FACTOR
    }

    if (this.accessToken) {
      options.extraHeaders = {
        Authorization: `Bearer ${this.accessToken}`
      }
      options.query = `${options.query}&token=${this.accessToken}`
    }

    this.socket = io(this.url, options)
    this.socket.on('connect', this.handleConnect)
    this.socket.on('disconnect', this.handleDisconnect)
    this.socket.on('connect_error', this.handleConnectError)

    let item
    while ((item = this.queue.shift()) !== undefined) {
      if (item.action === 'on') {
        this.socket.on(item.event, item.func)
      } else if (item.action === 'off') {
        this.socket.off(item.event, item.func)
      }
    }
  }

  handleConnect () {
    this.clearReconnectTimeout()
    this.connectedAt = Date.now()
    Object.keys(this.rooms).forEach((key) => {
      const entry = this.rooms[key]
      if (entry.count > 0) {
        this.socket.emit('join', this.roomTarget(entry.room))
        return
      }
      this.clearPendingLeave(key)
      delete this.rooms[key]
    })
  }

  handleDisconnect (reason) {
    if (this.connectedAt && Date.now() - this.connectedAt >= STABLE_CONNECTION_MS) {
      this.manualReconnectAttempts = 0
    }
    this.connectedAt = null
    if (this.closed || reason !== 'io server disconnect') return
    this.scheduleReconnect()
  }

  handleConnectError (error) {
    if (this.closed || this.socket?.active) return
    if (isSessionRejectedError(error)) return
    this.scheduleReconnect()
  }

  scheduleReconnect () {
    if (this.reconnectTimeout) return
    const base = Math.min(
      MANUAL_RECONNECT_BASE_MS * Math.pow(2, this.manualReconnectAttempts),
      MANUAL_RECONNECT_MAX_MS
    )
    const jitter = base * RANDOMIZATION_FACTOR * (Math.random() * 2 - 1)
    this.manualReconnectAttempts += 1
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      if (!this.closed && this.socket && !this.socket.connected) {
        this.socket.connect()
      }
    }, Math.round(base + jitter))
  }

  clearReconnectTimeout () {
    if (!this.reconnectTimeout) return
    clearTimeout(this.reconnectTimeout)
    this.reconnectTimeout = null
  }

  clearPendingLeave (key) {
    if (!this.pendingLeaves[key]) return
    clearTimeout(this.pendingLeaves[key])
    delete this.pendingLeaves[key]
  }

  getId () {
    return this.socket?.id
  }

  close () {
    this.closed = true
    this.clearReconnectTimeout()
    this.manualReconnectAttempts = 0
    this.connectedAt = null
    Object.keys(this.pendingLeaves).forEach((key) => {
      this.clearPendingLeave(key)
      if (this.rooms[key]?.count === 0) delete this.rooms[key]
    })
    this.socket?.close()
  }

  /**
   * Close the connection and forget everything the wrapper was holding for it: rooms, pending
   * leaves and listeners queued before the connection. Unlike `close`, which keeps the rooms so
   * the same wrapper can connect again, this is for a wrapper that will not be used any more
   * (superseded by another one, or the session it belonged to ended).
   */
  dispose () {
    if (!this.closed) this.close()
    Object.keys(this.pendingLeaves).forEach((key) => this.clearPendingLeave(key))
    this.rooms = {}
    this.queue = []
  }

  join (room) {
    const key = this.roomKey(room)
    this.clearPendingLeave(key)
    const entry = this.rooms[key]
    if (entry) {
      entry.count += 1
      return this
    }
    this.rooms[key] = { room, count: 1 }
    if (this.socket?.connected) {
      this.socket.emit('join', this.roomTarget(room))
    }
    return this
  }

  leave (room) {
    const key = this.roomKey(room)
    const entry = this.rooms[key]
    if (!entry || entry.count === 0) return this
    entry.count -= 1
    if (entry.count > 0) return this
    this.pendingLeaves[key] = setTimeout(() => {
      delete this.pendingLeaves[key]
      if (this.rooms[key]?.count !== 0) return
      delete this.rooms[key]
      if (this.socket?.connected) {
        this.socket.emit('leave', this.roomTarget(room))
      }
    }, LEAVE_DEBOUNCE_MS)
    return this
  }

  on (event, func = () => {}) {
    if (this.socket) {
      this.socket.on(event, func)
    } else {
      this.queue.push({ action: 'on', event, func })
    }
    return this
  }

  off (event, func = () => {}) {
    if (this.socket) {
      this.socket.off(event, func)
    } else {
      this.queue.push({ action: 'off', event, func })
    }
    return this
  }
}
