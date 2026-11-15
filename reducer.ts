import { readFileSync } from 'fs'
import { size } from 'lodash'
import { observer } from 'redux-observers'
import { extensionSelectorFactory } from 'views/utils/selectors'

import type {
  ExpCalcState,
  MapStat,
  SortieBattleAction,
  SortieStartAction,
} from './state'

import { rankExpPercent } from './constants'
import FileWriter from './file-writer'
import {
  DATA_PATH,
  OVERRIDE_EXP,
  PLUGIN_KEY,
  SELECT_SHIP,
  SORTIE_BATTLE,
  SORTIE_END,
  SORTIE_START,
  UPSTREAM_DATA_PATH,
  initialState,
} from './state'

export { DATA_PATH, PLUGIN_KEY } from './state'

interface BattleResultBody {
  api_get_base_exp?: number
}

interface MapStartBody {
  api_maparea_id: number
  api_mapinfo_no: number
}

/**
 * poi dispatches every API response into the store, so this reducer sees far
 * more than its own actions and has to narrow by `type` before trusting `body`.
 */
interface PluginAction {
  type: string
  id?: number
  mapId?: string
  value?: string
  body?: unknown
}

const addSample = (stat: MapStat | undefined, value: number): MapStat => {
  const count = (stat?.count ?? 0) + 1
  return {
    count,
    average: ((stat?.average ?? 0) * (count - 1) + value) / count,
  }
}

/** Folds a finished sortie into the map's per-sortie averages. */
const finishSortie = (state: ExpCalcState): ExpCalcState => {
  const { sortie } = state.staging
  if (!sortie) {
    return state
  }

  const { mapId } = sortie
  const prev = state.sortieStats[mapId]
  const count = (prev?.count ?? 0) + 1
  const avg = (old: number | undefined, value: number) =>
    ((old ?? 0) * (count - 1) + value) / count

  const shipStats = { ...state.shipSortieStats[mapId] }
  ;[...sortie.shipIds, ...sortie.escortIds].forEach((id) => {
    shipStats[id] = addSample(shipStats[id], sortie.shipExp[id] ?? 0)
  })

  return {
    ...state,
    staging: { ...state.staging, sortie: undefined },
    sortieStats: {
      ...state.sortieStats,
      [mapId]: {
        count,
        battles: avg(prev?.battles, sortie.battles),
        baseExp: avg(prev?.baseExp, sortie.baseExp),
      },
    },
    shipSortieStats: {
      ...state.shipSortieStats,
      [mapId]: shipStats,
    },
  }
}

/** Adds a battle's exp to the sortie in progress. */
const addBattle = (
  state: ExpCalcState,
  action: SortieBattleAction,
): ExpCalcState => {
  const { sortie } = state.staging
  if (!sortie) {
    return state
  }

  const escortIds = action.escortIds ?? sortie.escortIds
  const shipExp = { ...sortie.shipExp }
  const add = (ids: number[], exps: number[]) =>
    ids.forEach((id, idx) => {
      shipExp[id] = (shipExp[id] ?? 0) + Math.max(exps[idx] ?? 0, 0)
    })
  add(sortie.shipIds, action.shipExp)
  add(escortIds, action.escortExp)

  return {
    ...state,
    staging: {
      ...state.staging,
      sortie: {
        ...sortie,
        escortIds,
        battles: sortie.battles + 1,
        baseExp:
          sortie.baseExp + action.baseExp * (rankExpPercent[action.rank] ?? 1),
        shipExp,
      },
    },
  }
}

const readJson = (filePath: string): Partial<ExpCalcState> | undefined => {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Partial<ExpCalcState>
  } catch {
    return undefined
  }
}

/** The upstream plugin's per-battle stats and overrides, if it has any. */
const seedFromUpstream = (): Partial<ExpCalcState> => {
  const upstream = readJson(UPSTREAM_DATA_PATH)
  return {
    stats: upstream?.stats ?? {},
    override: upstream?.override ?? {},
  }
}

/**
 * This fork's own data file, or on first run the per-battle stats and
 * overrides the upstream plugin already collected.
 */
const readPersistedState = (): ExpCalcState => {
  try {
    const persistence = readJson(DATA_PATH) ?? seedFromUpstream()
    return {
      ...initialState,
      ...persistence,
      sortieStats: persistence.sortieStats ?? {},
      shipSortieStats: persistence.shipSortieStats ?? {},
      // a sortie never survives a restart
      staging: {
        mapId: '',
      },
    }
  } catch {
    return initialState
  }
}

const initState = readPersistedState()

const reducer = (
  state: ExpCalcState = initState,
  action: PluginAction,
): ExpCalcState => {
  const { type } = action

  if (type === SELECT_SHIP) {
    return {
      ...state,
      id: action.id ?? 0,
    }
  }

  if (type === OVERRIDE_EXP) {
    return {
      ...state,
      override: {
        ...state.override,
        [action.mapId!]: action.value!,
      },
    }
  }

  if (type === SORTIE_START) {
    const { mapId, shipIds, escortIds } = action as unknown as SortieStartAction
    // a sortie left open (eg poi reloaded before returning to port) is dropped
    return {
      ...state,
      staging: {
        ...state.staging,
        sortie: {
          mapId,
          shipIds,
          escortIds,
          battles: 0,
          baseExp: 0,
          shipExp: {},
        },
      },
    }
  }

  if (type === SORTIE_BATTLE) {
    return addBattle(state, action as unknown as SortieBattleAction)
  }

  if (type === SORTIE_END) {
    return finishSortie(state)
  }

  // single fleet and combine fleet results
  if (type.startsWith('@@') && type.includes('battleresult')) {
    const { api_get_base_exp: baseExp } = (action.body ??
      {}) as BattleResultBody

    const { stats, staging } = state

    if (baseExp && staging.mapId) {
      const count = (stats[staging.mapId]?.count || 0) + 1
      const average =
        ((stats[staging.mapId]?.average || 0) * (count - 1) + baseExp) / count

      return {
        ...state,
        stats: {
          ...stats,
          [staging.mapId]: {
            count,
            average,
          },
        },
      }
    }
  }

  if (type === '@@Response/kcsapi/api_port/port') {
    return {
      ...state,
      staging: {
        ...state.staging,
        mapId: '',
      },
    }
  }

  if (type === '@@Response/kcsapi/api_req_map/start') {
    const { api_maparea_id: worldId, api_mapinfo_no: currentMapId } =
      action.body as MapStartBody
    return {
      ...state,
      staging: {
        ...state.staging,
        mapId: `${worldId}${currentMapId}`,
      },
    }
  }

  return state
}

export default reducer

const fileWriter = new FileWriter()

export const dataObserver = observer(
  extensionSelectorFactory<ExpCalcState | undefined>(PLUGIN_KEY),
  (_dispatch, current) => {
    if (size(current)) {
      fileWriter.write(DATA_PATH, current)
    }
  },
)
