import { TypeApi } from '../types'
import { ConditionInterface } from '../classes/ApiBase'

export interface RequestOptionsProps {
  CastClass?: any
  json?: boolean
  project?: string
  language?: string,
  system?: boolean,
  headers?: object,
  accessToken?: string,
  query?: any,
  attributes?: string[]
  api?: TypeApi
  conditions?: ConditionInterface[]
  mode?: string
  // ms a request may wait for its answer (a GET defaults to 30 s, a write to no limit); 0: no limit
  timeout?: number
}
