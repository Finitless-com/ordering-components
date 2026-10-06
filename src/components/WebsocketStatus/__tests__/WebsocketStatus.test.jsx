import { describe, it, expect, vi } from 'vitest'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const mockT = (key, fallback) => fallback || key

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{}, mockT]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ auth: true }]
}))

const mockSocket = {
  socket: {
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    disconnected: false
  },
  getId: () => 'socket-1',
  on: vi.fn(),
  off: vi.fn(),
  join: vi.fn(),
  leave: vi.fn()
}

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => mockSocket
}))

import { WebsocketStatus } from '../index'

describe('WebsocketStatus', () => {
  it('passes socket status helpers to UIComponent', () => {
    renderController(WebsocketStatus, {})
    expect(lastControllerProps.socketStatus).toBe(1)
    expect(typeof lastControllerProps.getWebsocketStatus).toBe('function')
    expect(lastControllerProps.getWebsocketStatus(1)).toBe('Ok')
  })

  it('removes every socket listener on unmount', () => {
    const view = renderController(WebsocketStatus, {})
    view.unmount()
    mockSocket.socket.on.mock.calls.forEach(([event, handler]) => {
      expect(mockSocket.socket.off).toHaveBeenCalledWith(event, handler)
    })
  })
})
