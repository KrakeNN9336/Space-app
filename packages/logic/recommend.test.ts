import { describe, expect, it } from 'vitest'

import type {
	LogicInput,
	LogicOutput,
	RawClimate,
	RawSoil,
} from '@field-shift/shared'

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

const missingRange = { median: null, low: null, high: null }
const syntheticSoil: RawSoil = {
	wrbGroup: null,
	properties: {
		organicCarbonGkg: missingRange,
		phH2O: { ...missingRange, median: 6.5 },
		sandPct: missingRange,
		siltPct: missingRange,
		clayPct: missingRange,
	},
	source: 'Synthetic integration test fixture',
}

function contractProblems(request: LogicInput, output: LogicOutput) {
	return validateAnalyzeResponse({
		...output,
		field: request.field,
		terrain: request.terrain,
		dataStatus: request.dataStatus,
		disclaimer: 'Test disclaimer',
	})
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

		expect(contractProblems(input, output)).toEqual([])
		expect(output.recommendation.warnings).toEqual(
			expect.arrayContaining([
				'Monthly climate data needed to assess growing seasons are unavailable.',
				'Soil pH is unavailable for this field.',
				'A validated crop risk assessment is unavailable for this field.',
			]),
		)
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
		expect(output.recommendation.warnings).toEqual(
			expect.arrayContaining([
				'Немає місячних кліматичних даних для оцінки сезонів вирощування.',
				'Для цього поля немає даних про pH ґрунту.',
				'Для цього поля немає валідованої оцінки ризиків для культур.',
			]),
		)
	})

	it('withholds recommendations with climate and soil inputs but unverified crops and risk', () => {
		const request: LogicInput = {
			...input,
			climate: syntheticClimate,
			soil: syntheticSoil,
			dataStatus: { climate: 'live', soil: 'live', terrain: 'failed' },
		}
		const output = recommend(request)
		const { crops, rotationPlan, strategies, tillage, confidence } =
			output.recommendation
		const [, recommended, alternative] = strategies

		expect(contractProblems(request, output)).toEqual([])
		expect(crops).toEqual([])
		expect(tillage).toEqual([])
		expect(confidence).toBe('low')
		expect(rotationPlan.map(year => year.blocks)).toEqual([[], [], []])
		expect(recommended.rotationPlan).toEqual(rotationPlan)
		expect(alternative.rotationPlan.map(year => year.blocks)).toEqual([[], [], []])
		expect(recommended.dataGaps).toContain(
			'Agronomic requirements for crops in the EcoCrop catalog still need verification.',
		)
		expect(recommended.dataGaps).toContain(
			'A validated crop risk assessment is unavailable for this field.',
		)
		expect(recommended.dataGaps).not.toContain(
			'Soil pH is unavailable for this field.',
		)
	})

	it('projects the entered rotation in order and leaves unknown shares empty', () => {
		const request: LogicInput = {
			...input,
			history: [
				{ year: 2024, crops: ['winter_wheat', 'corn', 'soybean'] },
				{ year: 2025, crops: ['corn', 'unknown'] },
				{ year: 2026, crops: ['fallow'] },
			],
		}
		const output = recommend(request)
		const [current] = output.recommendation.strategies

		expect(contractProblems(request, output)).toEqual([])
		expect(current.rotationPlan).toEqual([
			{
				year: 2027,
				blocks: [
					{ cropId: 'winter_wheat', sharePct: 35 },
					{ cropId: 'corn', sharePct: 35 },
					{ cropId: 'soybean', sharePct: 30 },
				],
			},
			{ year: 2028, blocks: [] },
			{ year: 2029, blocks: [{ cropId: 'fallow', sharePct: 100 }] },
		])
		expect(current.dataGaps).toEqual(
			expect.arrayContaining([
				expect.stringContaining('Shares are divided equally'),
				'Shares are unavailable for years with unknown crops.',
			]),
		)
	})

	it('returns no current projection when the entire crop history is unknown', () => {
		const request: LogicInput = {
			...input,
			history: input.history.map(({ year }) => ({ year, crops: ['unknown'] })),
			lang: 'uk',
		}
		const output = recommend(request)

		expect(contractProblems(request, output)).toEqual([])
		expect(output.recommendation.strategies[0]).toMatchObject({
			kind: 'current',
			rotationPlan: [],
			confidence: 'low',
			bareSoilMonths: null,
			dataGaps: ['Історії посівів недостатньо для проєкції поточної практики.'],
		})
	})
})
