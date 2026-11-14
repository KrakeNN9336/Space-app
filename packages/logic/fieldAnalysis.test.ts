import { describe, expect, it } from 'vitest'
import type { LogicInput } from '@field-shift/shared'
import { STRESS_IDS } from '@field-shift/shared'
import { analyzeField } from './fieldAnalysis'

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
		{ year: 2026, crops: ['soybean'] },
	],
	priorities: {
		water: 3,
		income: 3,
		soil: 3,
		erosion: 3,
	},
	lang: 'uk',
	climate: null,
	soil: null,
	terrain: null,
	dataStatus: {
		climate: 'failed',
		soil: 'failed',
		terrain: 'failed',
	},
}

describe('Real field analysis pipeline', () => {
	it('returns six stress indicators without data', () => {
		const result = analyzeField(input)

		expect(result.climate).toBeNull()
		expect(result.soil).toBeNull()
		expect(result.stress.map(s => s.id)).toEqual([...STRESS_IDS])
		expect(result.stress.every(s => s.confidence === 'low')).toBe(true)
	})

	it('calculates PET and Köppen from monthly input', () => {
		const result = analyzeField({
			...input,
			climate: {
				monthly: {
					tempC: Array(12).fill(16),
					tempMinC: Array(12).fill(7),
					tempMaxC: Array(12).fill(22),
					precipMm: Array(12).fill(60),
					solarMjM2Day: null,
				},
				spread: { tempC: null, precipMm: null },
				samples: 3,
				source: 'Synthetic climate fixture',
			},
			dataStatus: {
				...input.dataStatus,
				climate: 'live',
			},
		})

		expect(result.climate?.koppen?.code).toBe('Cfb')
		expect(result.climate?.monthly.petMm).toHaveLength(12)
		expect(result.climate?.annualPrecipMm).toBe(720)
	})

	it('does not substitute missing climate values', () => {
		const result = analyzeField({
			...input,
			climate: {
				monthly: {
					tempC: [16],
					tempMinC: [7],
					tempMaxC: [22],
					precipMm: [60],
					solarMjM2Day: null,
				},
				spread: { tempC: null, precipMm: null },
				samples: 1,
				source: 'Incomplete synthetic fixture',
			},
		})

		expect(result.climate).toBeNull()
	})

	it('produces identical results for identical input', () => {
		expect(analyzeField(input)).toEqual(analyzeField(input))
	})
})
