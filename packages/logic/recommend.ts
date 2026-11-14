import type {
	LogicInput,
	LogicOutput,
	Recommendation,
	RotationStrategy,
	RotationYear,
	StrategyKind,
} from '@field-shift/shared'

import copy from '../../data/recommend-copy.json'
import { analyzeField } from './fieldAnalysis'

type StrategyText = {
	title: string
	summary: string
}

export function recommend(input: LogicInput): LogicOutput {
	const analysis = analyzeField(input)
	const text = copy[input.lang]

	const lastYear = input.history.at(-1)?.year

	const years = Array.from({ length: 3 }, (_, index) =>
		Number.isInteger(lastYear) ? lastYear! + index + 1 : index + 1,
	)

	const unavailablePlan: RotationYear[] = years.map(year => ({
		year,
		blocks: [],
	}))

	function unavailableStrategy(
		id: string,
		kind: StrategyKind,
		description: StrategyText,
	): RotationStrategy {
		return {
			id,
			kind,
			title: description.title,
			summary: description.summary,

			// The contract permits empty plans only for
			// the current strategy. Other strategies require
			// three year objects, even when not assessable.
			rotationPlan:
				kind === 'current'
					? []
					: unavailablePlan.map(year => ({
							year: year.year,
							blocks: [],
						})),

			// Contract placeholder, NOT a suitability score.
			score: 0,
			why: text.unavailable,
			evidence: [],
			benefits: [],
			risks: [text.warning],
			dataGaps: [text.gap],
			bareSoilMonths: null,
			confidence: 'low',
		}
	}

	const recommendation: Recommendation = {
		crops: [],
		rotationPlan: unavailablePlan,

		strategies: [
			unavailableStrategy('current', 'current', text.current),
			unavailableStrategy('recommended', 'recommended', text.recommended),
			unavailableStrategy('alternative', 'alternative', text.alternative),
		],

		tillage: [],
		warnings: [text.warning],
		confidence: 'low',
		assumptions: [text.assumption],
	}

	return {
		climate: analysis.climate,
		soil: analysis.soil,
		stress: analysis.stress,
		recommendation,
	}
}
