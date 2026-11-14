import { describe, expect, it } from 'vitest'
import {
	rangeSuitability,
	scoreCrop,
	type CropProfile,
	type CropConditions,
} from './cropScore'

const fixture: CropProfile = {
	id: 'example_legume',
	family: 'Fabaceae',
	tempRange: {
		min: 10,
		optMin: 18,
		optMax: 25,
		max: 35,
	},
	precipRange: {
		min: 300,
		optMin: 500,
		optMax: 800,
		max: 1200,
	},
	phRange: {
		min: 4.5,
		optMin: 6,
		optMax: 7,
		max: 8,
	},
	source: 'Synthetic test fixture',
	verificationStatus: 'verified',
}

const conditions: CropConditions = {
	seasonTempC: 22,
	annualPrecipMm: 650,
	soilPh: 6.5,
	riskSuitabilityPct: 80,
	previousCropIds: [],
	previousFamilies: [],
	priorities: {
		water: 3,
		income: 3,
		soil: 3,
		erosion: 3,
	},
}

describe('Crop suitability scoring', () => {
	it('returns 100 within an optimal range', () => {
		expect(rangeSuitability(22, fixture.tempRange)).toBe(100)
	})

	it('rejects unknown ranges', () => {
		expect(
			rangeSuitability(22, {
				min: null,
				optMin: null,
				optMax: null,
				max: null,
			}),
		).toBeNull()
	})

	it('calculates a bounded provisional score', () => {
		const result = scoreCrop(fixture, conditions)

		expect(result.score).not.toBeNull()
		expect(result.score!).toBeGreaterThanOrEqual(0)
		expect(result.score!).toBeLessThanOrEqual(100)
	})

	it('penalizes repeating the same crop', () => {
		const baseline = scoreCrop(fixture, conditions)

		const repeated = scoreCrop(fixture, {
			...conditions,
			previousCropIds: ['example_legume'],
			previousFamilies: ['Fabaceae'],
		})

		expect(repeated.score!).toBeLessThan(baseline.score!)
	})

	it('does not score unverified crop requirements', () => {
		const result = scoreCrop(
			{ ...fixture, verificationStatus: 'verify' },
			conditions,
		)

		expect(result.score).toBeNull()
		expect(result.confidence).toBe('low')
	})

	it('does not invent missing risk suitability', () => {
		const result = scoreCrop(fixture, {
			...conditions,
			riskSuitabilityPct: null,
		})

		expect(result.score).toBeNull()
	})
})
