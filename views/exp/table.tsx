import { HTMLTable, Intent, Tag } from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

import { expClass } from '../../constants'
import {
  enablePersonalStatSelector,
  overrideSelector,
  shipSortieStatsSelector,
  sortieStatsSelector,
  statsSelector,
} from '../../selectors'
import { PLUGIN_KEY } from '../../state'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`

const SortieNote = styled.div`
  margin: 0.5em 0;
  text-align: center;
`

const emptyStat = { count: 0, average: 0 }

/** Exp multipliers of the four flagship / MVP combinations. */
const expClassScales = [1, 1.5, 2.0, 3.0]

interface ResultTableProps {
  /** Base exp of the selected map, or the hand-entered value when `mapId` is 0. */
  mapExp: number
  /** Battle rank multiplier. */
  mapPercent: number
  /** Exp still needed to reach the goal level. */
  totalExp: number
  mapId: number
  /** api_id of the selected ship, 0 for the hand-entered one. */
  shipId: number
}

const ResultTable = ({
  mapExp,
  mapPercent,
  totalExp,
  mapId,
  shipId,
}: ResultTableProps) => {
  const enablePersonalStat = useSelector(enablePersonalStatSelector)
  const override = useSelector(overrideSelector)
  const stats = useSelector(statsSelector)
  const sortieStats = useSelector(sortieStatsSelector)
  const shipSortieStats = useSelector(shipSortieStatsSelector)

  const { t } = useTranslation(PLUGIN_KEY)

  const mapKey = String(mapId)
  const personalStat = stats[mapKey] ?? emptyStat
  const mapOverride = Number(override[mapKey])

  // a hand-entered override wins, then a large enough personal sample, then the
  // poi DB figure that came in via `mapExp`
  let finalMapExp = mapExp
  let signal = 'Poi DB'

  if (!mapId) {
    signal = 'Fixed'
  } else if (mapOverride) {
    finalMapExp = mapOverride
    signal = 'Custom'
  } else if (enablePersonalStat && personalStat.count > 30) {
    finalMapExp = personalStat.average
    signal = 'Personal'
  }

  const baseExp = finalMapExp * mapPercent
  const baseCount = Math.max(totalExp / baseExp, 0)

  // measured per sortie: each battle's rank is already applied, so the rank
  // picked above does not touch these
  const sortieStat = mapId ? sortieStats[mapKey] : undefined
  const sortieExp = sortieStat?.count ? sortieStat.baseExp : 0
  const shipStat =
    mapId && shipId ? shipSortieStats[mapKey]?.[shipId] : undefined
  const remaining = Math.max(totalExp, 0)

  return (
    <Wrapper>
      <HTMLTable interactive>
        <thead>
          <tr>
            <th>
              <Tag intent={Intent.PRIMARY} minimal>
                {t(signal)}
              </Tag>
            </th>
            <th>{t('Per attack')}</th>
            <th>{t('Remainder')}</th>
            {sortieExp > 0 && <th>{t('Per sortie')}</th>}
            {sortieExp > 0 && <th>{t('Sorties left')}</th>}
          </tr>
        </thead>
        <tbody>
          {expClass.map((name, idx) => (
            <tr key={name}>
              <td>{t(name)}</td>
              <td>{Math.floor(baseExp * expClassScales[idx])}</td>
              <td>{Math.ceil(baseCount / expClassScales[idx])}</td>
              {sortieExp > 0 && (
                <td>{Math.floor(sortieExp * expClassScales[idx])}</td>
              )}
              {sortieExp > 0 && (
                <td>
                  {Math.ceil(remaining / (sortieExp * expClassScales[idx]))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </HTMLTable>
      {sortieStat && sortieStat.count > 0 && (
        <SortieNote>
          {t('Sortie stat', {
            count: sortieStat.count,
            battles: sortieStat.battles.toFixed(1),
          })}
        </SortieNote>
      )}
      {shipStat && shipStat.count > 0 && (
        <SortieNote>
          <Tag intent={Intent.SUCCESS} minimal>
            {t('This ship')}
          </Tag>{' '}
          {t('Ship sortie stat', {
            exp: Math.floor(shipStat.average),
            count: shipStat.count,
            left:
              shipStat.average > 0
                ? Math.ceil(remaining / shipStat.average)
                : '-',
          })}
        </SortieNote>
      )}
    </Wrapper>
  )
}

export default ResultTable
