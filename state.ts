import path from 'path'

export const PLUGIN_KEY = 'poi-plugin-exp-calc-sortie'

/** The upstream plugin's data file, used once to seed this fork's stats. */
export const UPSTREAM_DATA_PATH = path.join(
  window.APPDATA_PATH,
  'poi-plugin-exp-calc.json',
)

export const DATA_PATH = path.join(window.APPDATA_PATH, `${PLUGIN_KEY}.json`)

export const SELECT_SHIP = `@@${PLUGIN_KEY}@select` as const
export const OVERRIDE_EXP = `@@${PLUGIN_KEY}@override-exp` as const
export const SORTIE_START = `@@${PLUGIN_KEY}@sortie-start` as const
export const SORTIE_BATTLE = `@@${PLUGIN_KEY}@sortie-battle` as const
export const SORTIE_END = `@@${PLUGIN_KEY}@sortie-end` as const

/** Running average of the base exp actually awarded by a map. */
export interface MapStat {
  count: number
  average: number
}

/** Per-sortie averages of a map, every started sortie counted. */
export interface MapSortieStat {
  count: number
  /** Battles fought per sortie. */
  battles: number
  /** Base exp per sortie, each battle already scaled by its rank. */
  baseExp: number
}

/** A sortie in progress. */
export interface SortieInProgress {
  mapId: string
  /** api_id of the main fleet's ships, flagship first. */
  shipIds: number[]
  /** api_id of the escort fleet's ships when the sortie is a combined fleet. */
  escortIds: number[]
  battles: number
  baseExp: number
  /** Exp each ship actually gained so far, keyed by api_id. */
  shipExp: Record<number, number>
}

export interface ExpCalcState {
  /**
   * Selected ship's api_id, `0` meaning the hand-entered custom ship.
   * FIXME: we store selected ship id in store to reduce unnecessary updates
   */
  id: number
  /** Sortie in progress, tracked so battle results can be attributed to a map. */
  staging: {
    mapId: string
    sortie?: SortieInProgress
  }
  stats: Record<string, MapStat>
  sortieStats: Record<string, MapSortieStat>
  /** Exp each ship gained per sortie, by map then by api_id. */
  shipSortieStats: Record<string, Record<number, MapStat>>
  /** Per-map exp entered by hand, which wins over both stats and the poi DB. */
  override: Record<string, string | number>
}

export const initialState: ExpCalcState = {
  id: 0,
  staging: {
    mapId: '',
  },
  stats: {},
  sortieStats: {},
  shipSortieStats: {},
  override: {},
}

export interface SelectShipAction {
  type: typeof SELECT_SHIP
  id: number
}

export interface OverrideExpAction {
  type: typeof OVERRIDE_EXP
  mapId: string
  value: string
}

export interface SortieStartAction {
  type: typeof SORTIE_START
  mapId: string
  shipIds: number[]
  escortIds: number[]
}

export interface SortieBattleAction {
  type: typeof SORTIE_BATTLE
  baseExp: number
  rank: string
  /** Exp per main fleet slot, flagship first, -1 for none. */
  shipExp: number[]
  /** Exp per escort fleet slot, empty for a single fleet. */
  escortExp: number[]
  /** The escort fleet, sent with the first battle of a combined sortie. */
  escortIds?: number[]
}

export interface SortieEndAction {
  type: typeof SORTIE_END
}
