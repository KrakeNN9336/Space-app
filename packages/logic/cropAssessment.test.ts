import { describe, expect, it } from 'vitest'

import type { Climate, Soil } from '@field-shift/shared'

import catalog from '../../data/crops.json'

import {
	assessCropSeasons,
	type CatalogCrop,
	type CropAssessmentContext,
} from './cropAssessment'

const crop: CatalogCrop = {
	id: 'synthetic_test_crop',
	family: 'Fabaceae',
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
	source: 'Synthetic test fixture',
	verificationStatus: 'verified',
}

const climate: Climate = {
	koppen: null,
	annualTempC: 20,
	annualPrecipMm: 1200,
	growingSeasonMonths: null,
	frostFreeMonths: null,
	samples: 3,
	source: 'Synthetic test fixture',
	spread: { tempC: null, precipMm: null },
	monthly: {
		tempC: Array(12).fill(20),
		tempMinC: Array(12).fill(12),
		tempMaxC: Array(12).fill(28),
		precipMm: Array(12).fill(100),
		petMm: Array(12).fill(70),
	},
}

const range = (median: number | null) => ({
	median,
	low: null,
	high: null,
})

const soil: Soil = {
	wrbGroup: null,
	source: 'Synthetic test fixture',
	properties: {
		organicCarbonGkg: range(15),
		phH2O: range(6.5),
		sandPct: range(40),
		siltPct: range(35),
		clayPct: range(25),
	},
}

const context: CropAssessmentContext = {
	climate,
	soil,
	previousCropIds: [],
	previousFamilies: [],
	priorities: {
		water: 3,
		income: 3,
		soil: 3,
		erosion: 3,
	},
	verifiedRiskSuitabilityPct: 80,
}

describe('Field Shift integrated crop assessment', () => {
	it('combines seasonal and suitability scores', () => {
		const [result] = assessCropSeasons([crop], context)

		expect(result.preliminarySeason?.score).toBe(100)
		expect(result.suitability.score).toBe(97)
		expect(result.eligibleForRecommendation).toBe(true)
	})

	it('blocks an unverified crop', () => {
		const [result] = assessCropSeasons(
			[{ ...crop, verificationStatus: 'verify' }],
			context,
		)

		expect(result.preliminarySeason).not.toBeNull()
		expect(result.suitability.score).toBeNull()
		expect(result.eligibleForRecommendation).toBe(false)
		expect(result.blockerCodes).toContain('CROP_NOT_VERIFIED')
	})

	it('does not invent climate data', () => {
		const [result] = assessCropSeasons([crop], {
			...context,
			climate: null,
		})

		expect(result.preliminarySeason).toBeNull()
		expect(result.suitability.score).toBeNull()
	})

	it('does not invent soil data', () => {
		const [result] = assessCropSeasons([crop], {
			...context,
			soil: null,
		})

		expect(result.suitability.score).toBeNull()
		expect(result.blockerCodes).toContain('SOIL_PH_UNAVAILABLE')
	})

	it('requires validated crop risk information', () => {
		const [result] = assessCropSeasons([crop], {
			...context,
			verifiedRiskSuitabilityPct: null,
		})

		expect(result.suitability.score).toBeNull()
		expect(result.eligibleForRecommendation).toBe(false)
	})

	it('keeps the imported 25 crops provisional', () => {
		const results = assessCropSeasons(catalog.crops, context)

		expect(results).toHaveLength(25)

		expect(results.every(item => !item.eligibleForRecommendation)).toBe(true)
	})

	it('is deterministic', () => {
		expect(assessCropSeasons([crop], context)).toEqual(
			assessCropSeasons([crop], context),
		)
	})
})
