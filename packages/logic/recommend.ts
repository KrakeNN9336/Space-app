import type {
	HistoryYear,
	LogicInput,
	LogicOutput,
	Recommendation,
	RotationStrategy,
	RotationYear,
	StrategyKind,
} from '@field-shift/shared'

import catalog from '../../data/crops.json'
import copy from '../../data/recommend-copy.json'
import { analyzeField } from './fieldAnalysis'
import { buildRecommendationPipeline } from './recommendationPipeline'

const SHARE_STEP = 5
const SHARE_UNITS = 100 / SHARE_STEP

function projectCurrentPractice(
	history: readonly HistoryYear[],
	years: readonly number[],
	text: (typeof copy)['en']['current'],
): Pick<RotationStrategy, 'summary' | 'rotationPlan' | 'dataGaps'> {
	const cropsByYear = history.map(entry => [...new Set(entry.crops)])
	if (cropsByYear.every(ids => ids.every(id => id === 'unknown'))) {
		return {
			summary: text.unavailable,
			rotationPlan: [],
			dataGaps: [text.unavailable],
		}
	}

	const dataGaps = new Set<string>()
	const rotationPlan = years.map((year, index) => {
		const ids = cropsByYear[index] ?? []
		// Unknown crops can account for an unknown fraction of the field.
		if (ids.length === 0 || ids.includes('unknown')) {
			dataGaps.add(text.unknownCrops)
			return { year, blocks: [] }
		}
		if (ids.length > SHARE_UNITS) {
			dataGaps.add(text.tooManyCrops)
			return { year, blocks: [] }
		}

		dataGaps.add(text.equalShares)
		const equalUnits = Math.floor(SHARE_UNITS / ids.length)
		const remainder = SHARE_UNITS % ids.length
		return {
			year,
			blocks: ids.map((cropId, cropIndex) => ({
				cropId,
				sharePct: (equalUnits + (cropIndex < remainder ? 1 : 0)) * SHARE_STEP,
			})),
		}
	})

	return { summary: text.summary, rotationPlan, dataGaps: [...dataGaps] }
}

export function recommend(input: LogicInput): LogicOutput {
	const analysis = analyzeField(input)
	const text = copy[input.lang]
	const plan = buildRecommendationPipeline({
		crops: catalog.crops,
		climate: analysis.climate,
		soil: analysis.soil,
		history: input.history,
		priorities: input.priorities,
		// LogicInput does not supply validated risk. The stress indicators are screening estimates.
		validatedRiskSuitabilityPct: null,
	})
	const status = text.status[plan.status]
	const dataGaps = Object.entries(text.blockers)
		.filter(([code]) => plan.warningCodes.includes(code))
		.map(([code, message]) =>
			code === 'SEASON_DATA_UNAVAILABLE' && analysis.climate === null
				? text.missingClimate
				: message,
		)

	const lastYear = input.history.at(-1)?.year
	const years = Array.from({ length: 3 }, (_, index) =>
		Number.isInteger(lastYear) ? lastYear! + index + 1 : index + 1,
	)
	const unavailablePlan: RotationYear[] = years.map(year => ({ year, blocks: [] }))
	const current = projectCurrentPractice(input.history, years, text.current)

	function unscoredStrategy(
		kind: StrategyKind,
		title: string,
		summary: string,
		rotationPlan: RotationYear[],
		gaps: string[],
	): RotationStrategy {
		return {
			id: kind,
			kind,
			title,
			summary,
			rotationPlan,
			// The API requires a number even when suitability cannot be scored.
			score: 0,
			why: text.unscored,
			evidence: [],
			benefits: [],
			risks: [],
			dataGaps: gaps,
			bareSoilMonths: null,
			confidence: 'low',
		}
	}

	const recommendation: Recommendation = {
		crops: [],
		rotationPlan: unavailablePlan,
		strategies: [
			unscoredStrategy(
				'current', text.current.title, current.summary,
				current.rotationPlan, current.dataGaps,
			),
			// Internal candidates still require field-level validation.
			unscoredStrategy(
				'recommended', text.recommended.title, text.recommended.summary,
				unavailablePlan, dataGaps,
			),
			unscoredStrategy(
				'alternative', text.alternative.title, text.alternative.summary,
				unavailablePlan, dataGaps,
			),
		],
		tillage: [],
		warnings: [status, ...dataGaps, text.unscored],
		confidence: 'low',
		assumptions: [text.assumption],
	}

	return { ...analysis, recommendation }
}
