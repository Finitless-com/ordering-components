import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { EventProvider } from '../../../../contexts/EventContext'
import { renderController, lastControllerProps, ControllerUI } from '../../../../__tests__/helpers/renderController'

const mockT = (key, fallback) => fallback || key

vi.mock('../../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{}, mockT]
}))

const state = vi.hoisted(() => ({ wrapper: null }))

vi.mock('../../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => state.wrapper
}))

import { WebsocketStatus } from '../index'

// Small emitter with the semantics that matter here: it only delivers to the object that emits
const createEmitter = (extra = {}) => {
  const handlers = {}
  return {
    handlers,
    on (event, fn) { (handlers[event] = handlers[event] || []).push(fn); return this },
    off (event, fn) { handlers[event] = (handlers[event] || []).filter(h => h !== fn); return this },
    emit (event, ...args) { (handlers[event] || []).slice().forEach(h => h(...args)) },
    count (event) { return (handlers[event] || []).length },
    ...extra
  }
}

// socket.io-client v3+/v4: the Socket emits connect/disconnect/connect_error and the Manager (socket.io)
// emits reconnect_attempt/reconnect_error/reconnect/reconnect_failed
const createIoSocket = ({ connected = false, active = true, withManager = true } = {}) => {
  const ioSocket = createEmitter({ connected, disconnected: !connected, active })
  if (withManager) ioSocket.io = createEmitter()
  return ioSocket
}

const connectedDateAt = (date) => date instanceof Date && !isNaN(date.getTime())

describe('Dashboard WebsocketStatus connection tracking', () => {
  let ioSocket

  beforeEach(() => {
    ioSocket = createIoSocket()
    state.wrapper = { socket: ioSocket }
  })

  it('keeps the props passed to the UIComponent and reads connectedDate from localStorage when there is one', () => {
    window.localStorage.setItem('websocket-connected-date', '2024-01-02T03:04:05.000Z')
    renderController(WebsocketStatus, {})
    expect(Object.keys(lastControllerProps).sort()).toEqual(
      ['UIComponent', 'connectedDate', 'getWebsocketStatus', 'reconnectAttemptCount', 'socketStatus'].sort()
    )
    expect(lastControllerProps.connectedDate.toISOString()).toBe('2024-01-02T03:04:05.000Z')
    window.localStorage.removeItem('websocket-connected-date')
    renderController(WebsocketStatus, {})
    expect(connectedDateAt(lastControllerProps.connectedDate)).toBe(true)
    expect(lastControllerProps.socketStatus).toBe(2)
    expect(lastControllerProps.reconnectAttemptCount).toBe(0)
  })

  it('counts the Manager reconnect attempts and shows connecting, then connected on connect', () => {
    renderController(WebsocketStatus, {})
    act(() => ioSocket.io.emit('reconnect_attempt', 1))
    expect(lastControllerProps.socketStatus).toBe(0)
    expect(lastControllerProps.reconnectAttemptCount).toBe(1)
    act(() => ioSocket.io.emit('reconnect_attempt', 2))
    expect(lastControllerProps.reconnectAttemptCount).toBe(2)
    const before = lastControllerProps.connectedDate
    ioSocket.connected = true
    act(() => ioSocket.emit('connect'))
    expect(lastControllerProps.socketStatus).toBe(1)
    expect(lastControllerProps.reconnectAttemptCount).toBe(0)
    expect(connectedDateAt(lastControllerProps.connectedDate)).toBe(true)
    expect(lastControllerProps.connectedDate).not.toBe(before)
  })

  it('does not count one attempt twice: the reconnect events are listened on the Manager only when there is one', () => {
    renderController(WebsocketStatus, {})
    expect(ioSocket.count('reconnect_attempt')).toBe(0)
    expect(ioSocket.io.count('reconnect_attempt')).toBe(1)
    act(() => ioSocket.io.emit('reconnect_attempt', 1))
    expect(lastControllerProps.reconnectAttemptCount).toBe(1)
  })

  it('still works with a client that emits the reconnect events on the Socket (no Manager)', () => {
    ioSocket = createIoSocket({ withManager: false })
    state.wrapper = { socket: ioSocket }
    renderController(WebsocketStatus, {})
    act(() => ioSocket.emit('reconnect_attempt', 1))
    expect(lastControllerProps.socketStatus).toBe(0)
    expect(lastControllerProps.reconnectAttemptCount).toBe(1)
  })

  it('shows connecting after a failed attempt while the client will retry', () => {
    renderController(WebsocketStatus, {})
    act(() => ioSocket.emit('connect_error', new Error('xhr poll error')))
    expect(lastControllerProps.socketStatus).toBe(0)
    act(() => ioSocket.emit('disconnect', 'transport close'))
    expect(lastControllerProps.socketStatus).toBe(2)
    act(() => ioSocket.io.emit('reconnect_error', new Error('boom')))
    expect(lastControllerProps.socketStatus).toBe(0)
  })

  it('shows disconnected after a failed attempt when the client will not retry', () => {
    ioSocket.active = false
    renderController(WebsocketStatus, {})
    act(() => ioSocket.emit('connect_error', new Error('invalid signature')))
    expect(lastControllerProps.socketStatus).toBe(2)
    act(() => ioSocket.io.emit('reconnect_error', new Error('boom')))
    expect(lastControllerProps.socketStatus).toBe(2)
    act(() => ioSocket.io.emit('reconnect_failed'))
    expect(lastControllerProps.socketStatus).toBe(2)
  })

  it('syncs the status from the socket when the listeners attach after the connection completed', () => {
    state.wrapper = {}
    const view = render(<EventProvider><WebsocketStatus UIComponent={ControllerUI} /></EventProvider>)
    expect(lastControllerProps.socketStatus).toBe(2)
    // the connection completes before the controller sees the socket: no connect event will ever reach it
    ioSocket.connected = true
    state.wrapper = { socket: ioSocket }
    act(() => view.rerender(<EventProvider><WebsocketStatus UIComponent={ControllerUI} /></EventProvider>))
    expect(lastControllerProps.socketStatus).toBe(1)
  })

  it('resets a stale connected status when the socket is replaced by one that is not connected', () => {
    ioSocket.connected = true
    const view = render(<EventProvider><WebsocketStatus UIComponent={ControllerUI} /></EventProvider>)
    expect(lastControllerProps.socketStatus).toBe(1)
    state.wrapper = { socket: createIoSocket({ connected: false }) }
    act(() => view.rerender(<EventProvider><WebsocketStatus UIComponent={ControllerUI} /></EventProvider>))
    expect(lastControllerProps.socketStatus).toBe(2)
  })

  it('removes every listener it added, from the Socket and from the Manager, on unmount', () => {
    const view = renderController(WebsocketStatus, {})
    expect(ioSocket.count('connect')).toBe(1)
    view.unmount()
    ;['connect', 'disconnect', 'connect_error'].forEach((event) => expect(ioSocket.count(event)).toBe(0))
    ;['reconnect_attempt', 'reconnect_error', 'reconnect_failed'].forEach((event) => expect(ioSocket.io.count(event)).toBe(0))
  })
})
