import OpenAI from 'openai'
import type { ExtractedFrame } from './extractFrames'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const SYSTEM_PROMPT = `You are a high-level assistant basketball coach conducting a film session breakdown.

You will be shown 3 short frame sequences from a basketball game. Each sequence contains 4 chronologically ordered frames showing a moment developing over roughly 1.5 seconds.

Your job is to analyze each sequence with coaching-grade depth, then also produce a full scouting report synthesizing all 3 sequences together.

Respond with ONLY valid JSON in this exact structure:

{
  "report": "## OFFENSIVE TENDENCIES\\n[synthesis across all 3 sequences]\\n\\n## DEFENSIVE OBSERVATIONS\\n[synthesis]\\n\\n## TRANSITION ANALYSIS\\n[synthesis]\\n\\n## SPACING & MOVEMENT\\n[synthesis]\\n\\n## POSSIBLE WEAKNESSES\\n[synthesis]\\n\\n## COACHING TAKEAWAYS\\n[3-5 actionable items]",
  "sequences": [
    {
      "play_type": "Transition",
      "what_happened": "Factual description only — what physically occurred in these frames with no interpretation.",
      "what_it_means": "Tactical interpretation — what this reveals about offensive or defensive intent and decision-making.",
      "why_it_matters": "The basketball consequence — what advantage or disadvantage was created by this play.",
      "coaching_point": "One specific, concrete, actionable coaching note. Not generic advice. Direct to what this team/player should work on.",
      "pattern_context": "Does this sequence connect to or reinforce a pattern visible in the other sequences? If yes, explain the connection. If this appears isolated, say so.",
      "direction_hint": "right",
      "tags": ["fast-break", "weak-side-exploit", "transition-defense"],
      "action_types": ["transition", "drive"],
      "outcome": "unknown"
    }
  ]
}

SEQUENCE ANALYSIS RULES — follow these strictly:

what_happened:
- Describe only what is visible and factual
- No interpretation, no basketball implications yet
- Example: "The ball handler pushes off a made basket, two defenders recover while three offensive players sprint ahead"

what_it_means:
- NOW interpret tactically
- What is the offensive or defensive system showing here?
- What decision was made and what does it reveal?
- Example: "The offense is hunting an early advantage before the defense sets — they prioritize pace over patterned play"

why_it_matters:
- What was the basketball consequence of this play?
- Was an advantage created or surrendered? Was spacing maintained or collapsed?
- Example: "The trailing defender is 3 steps late, creating a numbers advantage that forces a rotation"

coaching_point:
- One targeted coaching note — specific to this play, not generic
- Address something correctable or worth reinforcing
- Example: "The help-side defender needs to split the difference between the ball and the cutter — right now they are ball-watching and losing the weak-side threat"

pattern_context:
- Identify if this repeats behavior from other sequences
- Cross-sequence pattern recognition is the highest-value output
- Example: "This is the second sequence showing a right-side PnR — the team appears to have a set action that triggers from the right elbow"
- If truly isolated: "This appears to be a singular moment without clear connection to the other sequences"

direction_hint: pick one of "left" | "right" | "center" | "unknown"
tags: array of descriptive tags, e.g. ["pick-and-roll", "right-side", "help-defense", "mismatch"]
action_types: array picked ONLY from ["drive", "shoot", "pass", "PnR", "transition", "post-up", "screen", "cut", "press", "iso"]
outcome: pick one of "made" | "missed" | "turnover" | "defensive-stop" | "unknown"

play_type: pick the most accurate label from:
  Transition, Half-court offense, Pick-and-roll, Post-up, Defense rotation, Set play, Fast break, Iso, Press break, Inbound play

REPORT FIELD RULES:
- Synthesize across ALL 3 sequences — never analyze them individually in this section
- Write like a scout writing for a coaching staff, not a journalist writing for fans
- Keep each section focused and direct, no padding or repetition

ABSOLUTE RULES:
- Respond with ONLY the JSON object — no markdown fences, no preamble, no commentary
- Do not invent player identities or fabricate statistics
- For weaknesses, use careful language: "appears to", "may struggle with", "shows signs of"
- Be specific. Vague outputs are not acceptable.`

export interface SequenceResult {
  sequenceIndex: number
  timestampStart: number
  timestampEnd: number
  playType: string
  // Rich coaching breakdown
  whatHappened: string
  whatItMeans: string
  whyItMatters: string
  coachingPoint: string
  patternContext: string
  // Stats foundation metadata
  directionHint: 'left' | 'right' | 'center' | 'unknown'
  tags: string[]
  actionTypes: string[]
  outcome: 'made' | 'missed' | 'turnover' | 'defensive-stop' | 'unknown'
  // Compat fields (timeline preview + API surface)
  summary: string
  coachingTakeaway: string
  thumbnail: string
}

export interface AnalysisResult {
  summary: string
  model: string
  frameCount: number
  sequences: SequenceResult[]
}

type RawSeq = {
  play_type?: string
  what_happened?: string
  what_it_means?: string
  why_it_matters?: string
  coaching_point?: string
  pattern_context?: string
  direction_hint?: string
  tags?: unknown
  action_types?: unknown
  outcome?: string
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

export async function analyzeFrames(frames: ExtractedFrame[]): Promise<AnalysisResult> {
  // Group frames by sequence
  const sequenceMap = new Map<number, ExtractedFrame[]>()
  for (const frame of frames) {
    const seq = frame.sequenceIndex ?? 0
    if (!sequenceMap.has(seq)) sequenceMap.set(seq, [])
    sequenceMap.get(seq)!.push(frame)
  }

  const content: OpenAI.Chat.ChatCompletionContentPart[] = []

  for (const [seqIdx, seqFrames] of sequenceMap) {
    const start = seqFrames[0].timestamp.toFixed(1)
    const end = seqFrames[seqFrames.length - 1].timestamp.toFixed(1)

    content.push({
      type: 'text',
      text: `\n**Sequence ${seqIdx + 1}** (${start}s → ${end}s, ${seqFrames.length} frames in order):`,
    })

    for (const frame of seqFrames) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${frame.base64}`,
          detail: 'low',
        },
      })
    }
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  let parsed: { report?: string; sequences?: RawSeq[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }

  const report = parsed.report ?? raw
  const aiSeqs = parsed.sequences ?? []

  const VALID_DIRECTIONS = new Set(['left', 'right', 'center', 'unknown'])
  const VALID_OUTCOMES = new Set(['made', 'missed', 'turnover', 'defensive-stop', 'unknown'])

  const sequences: SequenceResult[] = []
  for (const [seqIdx, seqFrames] of sequenceMap) {
    const ai: RawSeq = aiSeqs[seqIdx] ?? {}
    const whatHappened = ai.what_happened ?? ''
    const coachingPoint = ai.coaching_point ?? ''
    const rawDir = ai.direction_hint ?? 'unknown'
    const rawOutcome = ai.outcome ?? 'unknown'

    sequences.push({
      sequenceIndex: seqIdx,
      timestampStart: seqFrames[0].timestamp,
      timestampEnd: seqFrames[seqFrames.length - 1].timestamp,
      playType: ai.play_type ?? 'Unknown',
      whatHappened,
      whatItMeans: ai.what_it_means ?? '',
      whyItMatters: ai.why_it_matters ?? '',
      coachingPoint,
      patternContext: ai.pattern_context ?? '',
      directionHint: VALID_DIRECTIONS.has(rawDir) ? rawDir as SequenceResult['directionHint'] : 'unknown',
      tags: toStringArray(ai.tags),
      actionTypes: toStringArray(ai.action_types),
      outcome: VALID_OUTCOMES.has(rawOutcome) ? rawOutcome as SequenceResult['outcome'] : 'unknown',
      summary: whatHappened,
      coachingTakeaway: coachingPoint,
      thumbnail: seqFrames[0].base64,
    })
  }

  return {
    summary: report,
    model: response.model,
    frameCount: frames.length,
    sequences,
  }
}
