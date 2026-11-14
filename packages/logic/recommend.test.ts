import { describe, expect, it } from 'vitest'

import type { LogicInput, RawClimate } from '@field-shift/shared'

import { STRESS_IDS, validateAnalyzeResponse } from '@field-shift/shared'

import { recommend } from './recommend'

const input: LogicInput = {
	location: { lat: 49.84, lon: 24.03 },

	field: {
		source: 'point',
		geometry: {
			type: 'Point',
			coordinates: [24.03, 49.84],
		},
	},

	radiusKm: 5,

	history: [
		{ year: 2024, crops: ['winter_wheat'] },
		{ year: 2025, crops: ['corn'] },
		{ year: 2026, crops: ['fallow'] },
	],

	priorities: {
		water: 3,
		income: 3,
		soil: 3,
		erosion: 3,
	},

	lang: 'en',
	climate: null,
	soil: null,
	terrain: null,

	dataStatus: {
		climate: 'failed',
		soil: 'failed',
		terrain: 'failed',
	},
}

const syntheticClimate: RawClimate = {
	monthly: {
		tempC: Array(12).fill(16),
		tempMinC: Array(12).fill(7),
		tempMaxC: Array(12).fill(22),
		precipMm: Array(12).fill(60),
		solarMjM2Day: null,
	},
	spread: {
		tempC: null,
		precipMm: null,
	},
	samples: 3,
	source: 'Synthetic integration test fixture',
}

describe('recommend() integration', () => {
	it('returns six stress indicators', () => {
		const output = recommend(input)

		expect(output.stress.map(s => s.id)).toEqual([...STRESS_IDS])
	})

	it('does not fabricate crop shares', () => {
		const output = recommend(input)

		expect(output.recommendation.crops).toEqual([])
		expect(output.recommendation.confidence).toBe('low')
		expect(output.climate).toBeNull()
	})

	it('matches the API contract when data is missing', () => {
		const output = recommend(input)

		const response = {
			field: input.field,
			climate: output.climate,
			soil: output.soil,
			terrain: input.terrain,
			stress: output.stress,
			recommendation: output.recommendation,
			dataStatus: input.dataStatus,
			disclaimer:
				'This tool supports decisions and does not replace a local agronomist.',
		}

		expect(validateAnalyzeResponse(response)).toEqual([])
	})

	it('uses actual supplied climate values', () => {
		const output = recommend({
			...input,
			climate: syntheticClimate,
			dataStatus: {
				...input.dataStatus,
				climate: 'live',
			},
		})

		expect(output.climate).not.toBeNull()
		expect(output.climate?.annualPrecipMm).toBe(720)
		expect(output.climate?.monthly.petMm).toHaveLength(12)
		expect(output.climate?.source).toBe('Synthetic integration test fixture')
	})

	it('returns localized strategies for future years', () => {
		const output = recommend({
			...input,
			lang: 'uk',
		})

		expect(output.recommendation.strategies).toHaveLength(3)

		expect(output.recommendation.strategies.map(s => s.kind)).toEqual([
			'current',
			'recommended',
			'alternative',
		])

		expect(output.recommendation.strategies[1].title).toBe(
			'Рекомендована сівозміна',
		)

		expect(output.recommendation.rotationPlan.map(y => y.year)).toEqual([
			2027, 2028, 2029,
		])
	})
})
