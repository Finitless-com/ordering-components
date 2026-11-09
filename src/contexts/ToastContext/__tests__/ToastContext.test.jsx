import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast, useToastActions, ToastType } from '../index'

const ToastConsumer = () => {
  const [toast, { showToast, hideToast }] = useToast()
  return (
    <div>
      <span data-testid='toast-type'>{toast?.type || 'none'}</span>
      <span data-testid='toast-message'>{toast?.message || ''}</span>
      <button type='button' onClick={() => showToast(ToastType.Success, 'Saved')}>show</button>
      <button type='button' onClick={hideToast}>hide</button>
    </div>
  )
}

describe('ToastContext', () => {
  it('shows and hides toast messages', async () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    )

    expect(screen.getByTestId('toast-type').textContent).toBe('none')
    await act(async () => {
      screen.getByText('show').click()
    })
    expect(screen.getByTestId('toast-type').textContent).toBe(ToastType.Success)
    expect(screen.getByTestId('toast-message').textContent).toBe('Saved')

    await act(async () => {
      screen.getByText('hide').click()
    })
    expect(screen.getByTestId('toast-type').textContent).toBe('none')
  })

  it('returns safe defaults outside provider', () => {
    render(<ToastConsumer />)
    expect(screen.getByTestId('toast-type').textContent).toBe('none')
  })

  it('gives stable actions that do not re-render on a toast', async () => {
    let renders = 0
    const seen = []
    const ActionsOnly = () => {
      renders += 1
      const actions = useToastActions()
      seen.push(actions)
      return <button type='button' onClick={() => actions.showToast(ToastType.Info, 'Hi')}>only-actions</button>
    }
    const Memo = React.memo(ActionsOnly)
    render(
      <ToastProvider>
        <Memo />
        <ToastConsumer />
      </ToastProvider>
    )
    await act(async () => {
      screen.getByText('only-actions').click()
    })
    expect(screen.getByTestId('toast-message').textContent).toBe('Hi')
    expect(renders).toBe(1)
    expect(seen[0].showToast).toBeTypeOf('function')
  })

  it('returns no-op actions outside provider', () => {
    let actions
    const Probe = () => { actions = useToastActions(); return null }
    render(<Probe />)
    expect(() => actions.showToast(ToastType.Info, 'x')).not.toThrow()
  })
})
