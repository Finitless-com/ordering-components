import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'

export const ProjectForm = (props) => {
  const {
    UIComponent,
    setStoreData,
    EventEmitter
  } = props

  const [ordering, { setOrdering }] = useApi()
  const [, { logout }] = useSession()

  const [projectState, setProjectState] = useState({ data: null, loading: false })

  const onSubmit = async (values) => {
    setProjectState({ data: values, loading: true })
    const nextProject = values?.project_name
    const projectChanged = nextProject !== ordering.project
    if (projectChanged && typeof logout === 'function') {
      await logout()
    }
    setOrdering({
      ...ordering,
      project: nextProject,
      ...(projectChanged ? { accessToken: null } : {})
    })
    setStoreData('project_name', JSON.stringify(nextProject))
    EventEmitter.emit('change_project', { setted: !!nextProject, changed: !!nextProject })
  }

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          projectState={projectState}
          setProjectState={setProjectState}
          onSubmit={onSubmit}
        />
      )}
    </>
  )
}

ProjectForm.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType
}
