import { describe, it, expect } from 'vitest'
import {
  parseTimestamp,
  normalizeOutcome,
  normalizePossessionType,
  splitCsvLine,
  parseLabelsCsv,
  matchPossessions,
  scoreAnalysis,
  type GroundTruthPossession,
  type PredictedPossession,
} from '../scorer'

function truthRow(overrides: Partial<GroundTruthPossession>): GroundTruthPossession {
  return {
    possession: 1, start: 0, end: 10, outcome: 'made',
    pointsScored: 2, possessionType: '', notes: '',
    ...overrides,
  }
}

function predictedRow(overrides: Partial<PredictedPossession>): PredictedPossession {
  return {
    possessionId: 1, startTimestamp: 0, endTimestamp: 10,
    outcome: 'made', possessionType: 'half_court',
    ...overrides,
  }
}

describe('parseTimestamp', () => {
  it('parses m:ss, h:mm:ss, and plain seconds', () => {
    expect(parseTimestamp('1:23')).toBe(83)
    expect(parseTimestamp('1:02:03')).toBe(3723)
    expect(parseTimestamp('83')).toBe(83)
    expect(parseTimestamp('83.5')).toBe(83.5)
    expect(parseTimestamp(' 0:05 ')).toBe(5)
  })

  it('rejects garbage', () => {
    expect(() => parseTimestamp('abc')).toThrow()
    expect(() => parseTimestamp('')).toThrow()
    expect(() => parseTimestamp('1:xx')).toThrow()
  })
})

describe('normalizeOutcome', () => {
  it('maps the spellings a labeler will actually type', () => {
    expect(normalizeOutcome('made-2')).toEqual({ outcome: 'made', pointsScored: 2 })
    expect(normalizeOutcome('Made 3')).toEqual({ outcome: 'made', pointsScored: 3 })
    expect(normalizeOutcome('made')).toEqual({ outcome: 'made', pointsScored: null })
    expect(normalizeOutcome('miss')).toEqual({ outcome: 'missed', pointsScored: null })
    expect(normalizeOutcome('TO')).toEqual({ outcome: 'turnover', pointsScored: null })
    expect(normalizeOutcome('defensive stop')).toEqual({ outcome: 'defensive-stop', pointsScored: null })
    expect(normalizeOutcome('foul')).toEqual({ outcome: 'foul', pointsScored: null })
    expect(normalizeOutcome('')).toEqual({ outcome: '', pointsScored: null })
    expect(normalizeOutcome('weird thing')).toEqual({ outcome: 'other', pointsScored: null })
  })
})

describe('normalizePossessionType', () => {
  it('normalizes spacing and case to the analyzer enum style', () => {
    expect(normalizePossessionType('Half Court')).toBe('half_court')
    expect(normalizePossessionType('pick-and-roll')).toBe('pick_and_roll')
    expect(normalizePossessionType('')).toBe('')
  })
})

describe('splitCsvLine', () => {
  it('honors quoted fields containing commas and escaped quotes', () => {
    expect(splitCsvLine('1,0:05,0:21,made,"horns set, then layup"')).toEqual([
      '1', '0:05', '0:21', 'made', 'horns set, then layup',
    ])
    expect(splitCsvLine('a,"he said ""go""",b')).toEqual(['a', 'he said "go"', 'b'])
  })
})

describe('parseLabelsCsv', () => {
  const header = 'possession,start,end,outcome,type,notes'

  it('parses rows and sorts by start time', () => {
    const rows = parseLabelsCsv(`${header}\n2,0:30,0:45,missed,,\n1,0:05,0:21,made-2,half_court,nice play`)
    expect(rows).toHaveLength(2)
    expect(rows[0].possession).toBe(1)
    expect(rows[0].start).toBe(5)
    expect(rows[0].end).toBe(21)
    expect(rows[0].outcome).toBe('made')
    expect(rows[0].pointsScored).toBe(2)
    expect(rows[1].outcome).toBe('missed')
  })

  it('accepts any column order', () => {
    const rows = parseLabelsCsv('outcome,end,start,possession\nturnover,0:20,0:10,1')
    expect(rows[0]).toMatchObject({ start: 10, end: 20, outcome: 'turnover' })
  })

  it('rejects a missing required column with a clear message', () => {
    expect(() => parseLabelsCsv('possession,start,end\n1,0:00,0:10')).toThrow(/missing required column "outcome"/)
  })

  it('rejects end before start, pointing at the row', () => {
    expect(() => parseLabelsCsv(`${header}\n1,0:30,0:10,made,,`)).toThrow(/row 2/)
  })
})

describe('matchPossessions', () => {
  it('matches overlapping intervals one-to-one by largest overlap', () => {
    const truth = [
      truthRow({ possession: 1, start: 0, end: 10 }),
      truthRow({ possession: 2, start: 10, end: 25 }),
    ]
    const predicted = [
      predictedRow({ possessionId: 101, startTimestamp: 1, endTimestamp: 11 }),
      predictedRow({ possessionId: 102, startTimestamp: 12, endTimestamp: 24 }),
    ]
    const { matches, unmatchedTruth, unmatchedPredicted } = matchPossessions(truth, predicted)
    expect(matches).toHaveLength(2)
    expect(unmatchedTruth).toHaveLength(0)
    expect(unmatchedPredicted).toHaveLength(0)
    expect(matches.find(m => m.truth.possession === 1)!.predicted.possessionId).toBe(101)
  })

  it('does not match barely-touching intervals', () => {
    const truth = [truthRow({ start: 0, end: 30 })]
    const predicted = [predictedRow({ startTimestamp: 29, endTimestamp: 60 })]
    const { matches } = matchPossessions(truth, predicted)
    expect(matches).toHaveLength(0)
  })

  it('never double-assigns a prediction to two truth rows', () => {
    const truth = [
      truthRow({ possession: 1, start: 0, end: 10 }),
      truthRow({ possession: 2, start: 10, end: 20 }),
    ]
    const predicted = [predictedRow({ startTimestamp: 0, endTimestamp: 20 })]
    const { matches, unmatchedTruth } = matchPossessions(truth, predicted)
    expect(matches).toHaveLength(1)
    expect(unmatchedTruth).toHaveLength(1)
  })
})

describe('scoreAnalysis', () => {
  it('computes detection, outcome, and boundary metrics on a small game', () => {
    const truth = [
      truthRow({ possession: 1, start: 0, end: 10, outcome: 'made' }),
      truthRow({ possession: 2, start: 10, end: 20, outcome: 'missed' }),
      truthRow({ possession: 3, start: 20, end: 30, outcome: 'turnover' }),
      truthRow({ possession: 4, start: 30, end: 40, outcome: 'foul' }),     // detection only
      truthRow({ possession: 5, start: 40, end: 50, outcome: 'made' }),     // analyzer misses this one
    ]
    const predicted = [
      predictedRow({ possessionId: 1, startTimestamp: 1, endTimestamp: 9, outcome: 'made' }),
      predictedRow({ possessionId: 2, startTimestamp: 11, endTimestamp: 19, outcome: 'made' }),     // wrong outcome
      predictedRow({ possessionId: 3, startTimestamp: 21, endTimestamp: 29, outcome: 'unknown' }),  // punted
      predictedRow({ possessionId: 4, startTimestamp: 31, endTimestamp: 39, outcome: 'missed' }),   // foul row: not graded
      predictedRow({ possessionId: 9, startTimestamp: 60, endTimestamp: 70, outcome: 'made' }),     // hallucinated
    ]

    const report = scoreAnalysis(truth, predicted)

    expect(report.detection.matched).toBe(4)
    expect(report.detection.recall).toBeCloseTo(4 / 5)
    expect(report.detection.precision).toBeCloseTo(4 / 5)

    // 3 comparable (foul excluded), 1 correct
    expect(report.outcomes.comparable).toBe(3)
    expect(report.outcomes.correct).toBe(1)
    expect(report.outcomes.predictedUnknown).toBe(1)
    expect(report.outcomes.confusion['missed']['made']).toBe(1)

    expect(report.misses).toHaveLength(1)
    expect(report.misses[0].possession).toBe(5)
    expect(report.hallucinations).toHaveLength(1)
    expect(report.hallucinations[0].possessionId).toBe(9)

    expect(report.outcomeMistakes).toHaveLength(2)
    expect(report.boundaries.meanStartErrorSec).toBeCloseTo(1)
    expect(report.boundaries.pctStartsWithin3s).toBe(1)
  })

  it('handles empty predictions without dividing by zero', () => {
    const report = scoreAnalysis([truthRow({})], [])
    expect(report.detection.recall).toBe(0)
    expect(report.detection.precision).toBe(0)
    expect(report.outcomes.accuracy).toBe(0)
    expect(report.boundaries.meanStartErrorSec).toBe(0)
  })
})
