import type { PlayerEvent, PossessionResult } from './analyzeFrames'

export interface PlayerTendencies {
  leftRightBias: number        // -1 (left-heavy) to +1 (right-heavy), 0 = balanced
  driveRate: number            // 0–1: drives / total offensive events
  scoringZones: { perimeter: number; paint: number; transition: number }  // normalize to sum ~1
  defensiveActivityScore: number  // 0–1: defensive events / total events
  roleClassification: 'ball_handler' | 'wing' | 'big' | 'two_way' | 'unknown'
  topEventTypes: { type: string; count: number; rate: number }[]  // top 5 by count
  eventsPerPossession: number
  driveRateVsTeam: number | null  // player drive rate / team drive rate; null if no team drives
}

const DEFENSIVE_EVENTS = new Set([
  'help_rotation', 'defensive_collapse', 'late_closeout', 'transition_recovery',
  'hedge', 'switch', 'paint_help', 'closeout', 'drop_coverage', 'help_recovery', 'paint_protection',
])

export function computePlayerStats(
  playerEvents: PlayerEvent[],
  possessions: PossessionResult[]
): PlayerTendencies {
  const total = playerEvents.length

  // Event type frequency map
  const freq: Record<string, number> = {}
  for (const ev of playerEvents) {
    freq[ev.type] = (freq[ev.type] ?? 0) + 1
  }

  const get = (type: string) => freq[type] ?? 0

  // Left/right drive bias
  const dLeft = get('drive_left')
  const dRight = get('drive_right')
  const driveTotal = dLeft + dRight
  const leftRightBias = driveTotal > 0 ? (dRight - dLeft) / driveTotal : 0

  // Drive rate (offensive actions only)
  const defensiveCount = playerEvents.filter(e => DEFENSIVE_EVENTS.has(e.type)).length
  const offensiveCount = total - defensiveCount
  const driveRate = offensiveCount > 0 ? driveTotal / offensiveCount : 0

  // Scoring zones
  const perimeterRaw = get('catch_and_shoot') + get('corner_three')
  const paintRaw = get('paint_touch') + get('isolation')
  const transitionRaw = get('transition_push')
  const zoneTotal = perimeterRaw + paintRaw + transitionRaw
  const scoringZones = zoneTotal > 0
    ? {
        perimeter: perimeterRaw / zoneTotal,
        paint: paintRaw / zoneTotal,
        transition: transitionRaw / zoneTotal,
      }
    : { perimeter: 0, paint: 0, transition: 0 }

  // Defensive activity
  const defensiveActivityScore = total > 0 ? defensiveCount / total : 0

  // Role classification
  const isoRate = offensiveCount > 0 ? get('isolation') / offensiveCount : 0
  const pnrRate = offensiveCount > 0 ? get('pick_and_roll') / offensiveCount : 0
  const paintRate = offensiveCount > 0 ? get('paint_touch') / offensiveCount : 0
  const cnsRate = offensiveCount > 0 ? get('catch_and_shoot') / offensiveCount : 0
  const cornerRate = offensiveCount > 0 ? get('corner_three') / offensiveCount : 0
  const paintHelpRate = total > 0 ? get('paint_help') / total : 0

  let roleClassification: PlayerTendencies['roleClassification'] = 'unknown'
  if (defensiveActivityScore > 0.3 && driveRate > 0.2) {
    roleClassification = 'two_way'
  } else if (driveRate > 0.4 || isoRate > 0.2 || pnrRate > 0.25) {
    roleClassification = 'ball_handler'
  } else if (paintRate > 0.3 || (defensiveActivityScore > 0.4 && paintHelpRate > 0.2)) {
    roleClassification = 'big'
  } else if (cnsRate > 0.25 || cornerRate > 0.15) {
    roleClassification = 'wing'
  }

  // Top event types (top 5)
  const topEventTypes = Object.entries(freq)
    .map(([type, count]) => ({ type, count, rate: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Events per possession
  const involvedCount = possessions.filter(p =>
    playerEvents.some(e => e.possessionId === p.possessionId)
  ).length
  const eventsPerPossession = involvedCount > 0 ? total / involvedCount : total

  // Drive rate vs team
  let driveRateVsTeam: number | null = null
  const allTeamEvents = possessions.flatMap(p => p.events ?? [])
  const teamOffensive = allTeamEvents.filter(e => !DEFENSIVE_EVENTS.has(e.type)).length
  const teamDrives = allTeamEvents.filter(e => e.type === 'drive_left' || e.type === 'drive_right').length
  const teamDriveRate = teamOffensive > 0 ? teamDrives / teamOffensive : 0
  if (teamDriveRate > 0) {
    driveRateVsTeam = driveRate / teamDriveRate
  }

  return {
    leftRightBias,
    driveRate,
    scoringZones,
    defensiveActivityScore,
    roleClassification,
    topEventTypes,
    eventsPerPossession,
    driveRateVsTeam,
  }
}
