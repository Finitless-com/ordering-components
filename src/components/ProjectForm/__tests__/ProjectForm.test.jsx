import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const upm = vi.hoisted(() => {
  const { createUserProjectMiscTestContext } = require('../../../__tests__/helpers/userProjectMiscTestHelpers')
  const ctx = createUserProjectMiscTestContext(vi)
  ctx.mockLogout = vi.fn().mockResolvedValue(undefined)
  return ctx
})

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [upm.mockOrdering, { setOrdering: upm.mockSetOrdering }]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ token: 'tok-a', user: { id: 1 } }, { logout: upm.mockLogout }]
}))

import { ProjectForm } from '../index'

describe('ProjectForm', () => {
  beforeEach(() => upm.reset())

  it('submits project name and emits change_project', async () => {
    renderController(ProjectForm, {
      setStoreData: upm.mockSetStoreData,
      EventEmitter: upm.mockEventEmitter
    })
    await act(async () => {
      await lastControllerProps.onSubmit({ project_name: 'demo-project' })
    })
    expect(upm.mockSetOrdering).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'demo-project', accessToken: null })
    )
    expect(upm.mockSetStoreData).toHaveBeenCalledWith('project_name', '"demo-project"')
    expect(upm.mockEventEmitter.emit).toHaveBeenCalledWith('change_project', {
      setted: true,
      changed: true
    })
  })

  it('logs out the previous tenant session when the project changes', async () => {
    renderController(ProjectForm, {
      setStoreData: upm.mockSetStoreData,
      EventEmitter: upm.mockEventEmitter
    })
    await act(async () => {
      await lastControllerProps.onSubmit({ project_name: 'other-project' })
    })
    expect(upm.mockLogout).toHaveBeenCalled()
  })

  it('does not log out when submitting the same project', async () => {
    renderController(ProjectForm, {
      setStoreData: upm.mockSetStoreData,
      EventEmitter: upm.mockEventEmitter
    })
    await act(async () => {
      await lastControllerProps.onSubmit({ project_name: 'demo' })
    })
    expect(upm.mockLogout).not.toHaveBeenCalled()
    expect(upm.mockSetOrdering).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'demo' })
    )
  })
})
