import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { act, render } from '@testing-library/react'
import { EventProvider } from '../../../contexts/EventContext'
import { ControllerUI, lastControllerProps } from '../../../__tests__/helpers/renderController'

const upm = vi.hoisted(() => {
  const { createUserProjectMiscTestContext } = require('../../../__tests__/helpers/userProjectMiscTestHelpers')
  return createUserProjectMiscTestContext(vi)
})

const sockets = vi.hoisted(() => ({ handlers: {}, socket: null, session: null }))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, upm.mockT]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: upm.mockShowToast }],
  ToastType: { error: 'error', success: 'success', info: 'info' }
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [sockets.session, { changeUser: upm.mockChangeUser }]
}))

vi.mock('../../../contexts/CustomerContext', () => ({
  useCustomer: () => [{ user: upm.sampleUser }, { setUserCustomer: upm.mockSetUserCustomer }]
}))

vi.mock('../../../contexts/ValidationsFieldsContext', () => ({
  useValidationFields: () => [{ loading: false, fields: {} }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [upm.mockOrdering, { setOrdering: upm.mockSetOrdering }]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => sockets.socket
}))

import { UserFormDetails } from '../index'

const tree = () => <EventProvider><UserFormDetails UIComponent={ControllerUI} user={upm.sampleUser} /></EventProvider>
const event = (attribute, value) => ({ changes: [{ attribute, new: value }] })
const emitDriversChanges = (payload) => sockets.handlers.drivers_changes.at(-1)(payload)

describe('UserFormDetails drivers_changes', () => {
  beforeEach(() => {
    upm.reset()
    sockets.handlers = {}
    sockets.socket = {
      socket: { connected: true },
      getId: () => 'socket-19',
      on: vi.fn((name, fn) => { (sockets.handlers[name] = sockets.handlers[name] || []).push(fn) }),
      off: vi.fn(),
      join: vi.fn(),
      leave: vi.fn()
    }
    sockets.session = { auth: true, loading: false, user: { ...upm.sampleUser, available: false }, token: 'session-tok' }
  })

  it('applies one event on top of the session user, as before', () => {
    render(tree())
    act(() => emitDriversChanges(event('available', true)))
    expect(upm.mockChangeUser).toHaveBeenCalledTimes(1)
    expect(upm.mockChangeUser).toHaveBeenLastCalledWith({ ...sockets.session.user, available: true })
    expect(lastControllerProps.userState.loadingDriver).toBe(false)
    expect(lastControllerProps.userState.result.available).toBe(true)
  })

  it('keeps the changes of two events in a row (different attributes), in the session user and in the local state', () => {
    render(tree())
    act(() => {
      emitDriversChanges(event('available', true))
      emitDriversChanges(event('name', 'Renamed'))
    })
    expect(upm.mockChangeUser).toHaveBeenCalledTimes(2)
    expect(upm.mockChangeUser).toHaveBeenLastCalledWith({ ...sockets.session.user, available: true, name: 'Renamed' })
    expect(lastControllerProps.userState.result.available).toBe(true)
    expect(lastControllerProps.userState.result.name).toBe('Renamed')
  })

  it('keeps both changes when the second event arrives after a re-render but before the session took the first', () => {
    const view = render(tree())
    act(() => emitDriversChanges(event('available', true)))
    // re-render with the same session user: changeUser has not been reflected in the session yet
    act(() => { view.rerender(tree()) })
    act(() => emitDriversChanges(event('name', 'Renamed')))
    expect(upm.mockChangeUser).toHaveBeenLastCalledWith({ ...sockets.session.user, available: true, name: 'Renamed' })
  })

  it('follows the session user when it changes elsewhere', () => {
    const view = render(tree())
    act(() => emitDriversChanges(event('available', true)))
    sockets.session = { ...sockets.session, user: { ...upm.sampleUser, available: true, email: 'new@mail.test' } }
    act(() => { view.rerender(tree()) })
    act(() => emitDriversChanges(event('name', 'Renamed')))
    expect(upm.mockChangeUser).toHaveBeenLastCalledWith({ ...upm.sampleUser, available: true, email: 'new@mail.test', name: 'Renamed' })
  })

  it('registers the listener once and removes that same handler on unmount', () => {
    const view = render(tree())
    expect(sockets.handlers.drivers_changes).toHaveLength(1)
    view.unmount()
    expect(sockets.socket.off).toHaveBeenCalledWith('drivers_changes', sockets.handlers.drivers_changes[0])
  })
})
