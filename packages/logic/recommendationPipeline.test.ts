import { describe, expect, it } from 'vitest'

import type { Climate, Soil } from '@field-shift/shared'

import catalog from '../../data/crops.json'

import {
	buildRecommendationPipeline,
	type PlanningInput,
} from './recommendationPipeline'

const makeRange = (median: number | null) => ({
	median,
	low: null,
	high: null,
})

const climate: Climate = {
	koppen: null,
	annualTempC: 20,
	annualPrecipMm: 1200,
	growingSeasonMonths: null,
	frostFreeMonths: null,
	samples: 3,
	source: 'Synthetic test',
	spread: { tempC: null, precipMm: null },
	monthly: {
		tempC: Array(12).fill(20),
		tempMinC: Array(12).fill(12),
		tempMaxC: Array(12).fill(28),
		precipMm: Array(12).fill(100),
		petMm: Array(12).fill(70),
	},
}

const soil: Soil = {
	wrbGroup: null,
	source: 'Synthetic test',
	properties: {
		organicCarbonGkg: makeRange(15),
		phH2O: makeRange(6.5),
		sandPct: makeRange(40),
		siltPct: makeRange(35),
		clayPct: makeRange(25),
	},
}

const crop = (id: string, family: string, species: string) => ({
	id,
	family,
	source: `Synthetic test; species=${species}`,
	verificationStatus: 'verified',
	tempRange: {
		min: 10,
		optMin: 15,
		optMax: 25,
		max: 40,
	},
	precipRange: {
		min: 200,
		optMin: 280,
		optMax: 320,
		max: 500,
	},
	phRange: {
		min: 4.5,
		optMin: 6,
		optMax: 7,
		max: 8,
	},
	seasonDaysRange: { min: 89, max: 92 },
})

const crops = [
	crop('test_wheat', 'Poaceae', 'Triticum aestivum'),
	crop('test_soy', 'Fabaceae', 'Glycine max'),
	crop('test_sunflower', 'Asteraceae', 'Helianthus annuus'),
]

const input: PlanningInput = {
	crops,
	climate,
	soil,
	history: [
		{ year: 2024, crops: ['test_wheat'] },
		{ year: 2025, crops: ['test_soy'] },
		{ year: 2026, crops: ['fallow'] },
	],
	priorities: {
		water: 3,
		income: 3,
		soil: 3,
		erosion: 3,
	},
	validatedRiskSuitabilityPct: 80,
}

describe('Recommendation pipeline integration', () => {
	it('builds an internally consistent provisional plan', () => {
		const result = buildRecommendationPipeline(input)

		expect(result.status).toBe('provisional')
		expect(result.allocation.status).toBe('ready')
		expect(result.rotation?.rotationPlan).toHaveLength(3)

		expect(
			result.allocation.shares.reduce(
				(total, item) => total + item.sharePct,
				0,
			),
		).toBe(100)
	})

	it('does not recommend unverified catalog crops', () => {
		const result = buildRecommendationPipeline({
			...input,
			crops: catalog.crops,
		})

		expect(result.status).toBe('insufficient_data')
		expect(result.allocation.shares).toEqual([])
	})

	it('requires validated risk suitability', () => {
		const result = buildRecommendationPipeline({
			...input,
			validatedRiskSuitabilityPct: null,
		})

		expect(result.status).toBe('insufficient_data')
		expect(result.allocation.shares).toEqual([])
	})

	it('blocks a rotation with repeated species', () => {
		const result = buildRecommendationPipeline({
			...input,
			crops: [
				crops[0],
				crop('second_wheat', 'Poaceae', 'Triticum aestivum'),
				crops[1],
			],
		})

		expect(result.status).toBe('blocked')
		expect(result.rotation?.rotationPlan).toEqual([])
	})

	it('does not invent missing climate measurements', () => {
		const result = buildRecommendationPipeline({
			...input,
			climate: null,
		})

		expect(result.status).toBe('insufficient_data')
	})
})
