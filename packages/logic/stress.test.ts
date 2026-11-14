import { describe, expect, it } from 'vitest'
import { STRESS_IDS } from '@field-shift/shared'
import type { Climate, Soil } from '@field-shift/shared'
import { computeStress } from './stress'

const range = (median: number | null) => ({
	median,
	low: null,
	high: null,
})

const climate: Climate = {
	koppen: null,
	annualTempC: 20,
	annualPrecipMm: 120,
	growingSeasonMonths: 12,
	frostFreeMonths: 12,
	samples: 3,
	source: 'Synthetic test data',
	spread: { tempC: null, precipMm: null },
	monthly: {
		tempC: Array(12).fill(20),
		tempMinC: Array(12).fill(10),
		tempMaxC: Array(12).fill(30),
		precipMm: Array(12).fill(10),
		petMm: Array(12).fill(100),
	},
}

const soil: Soil = {
	wrbGroup: null,
	source: 'Synthetic test data',
	properties: {
		organicCarbonGkg: range(15),
		phH2O: range(5),
		sandPct: range(40),
		siltPct: range(35),
		clayPct: range(25),
	},
}

describe('Field Shift six stress indicators', () => {
	it('always returns exactly six indicators in API order', () => {
		const result = computeStress(null, null, null)

		expect(result.map(x => x.id)).toEqual([...STRESS_IDS])
		expect(result).toHaveLength(6)
	})

	it('does not claim missing data is a reliable result', () => {
		const result = computeStress(null, null, null)

		expect(result.every(x => x.confidence === 'low')).toBe(true)
		expect(result.every(x => x.evidence.length === 0)).toBe(true)
		expect(result.every(x => x.whyFull.includes('placeholder'))).toBe(true)
	})

	it('recognizes a dry climate from the aridity index', () => {
		const result = computeStress(climate, soil, null)

		expect(result[0].level).toBe('high')
		expect(result[0].evidence[0].value).toBeCloseTo(0.1)
	})

	it('reports pH limitations with numeric evidence', () => {
		const result = computeStress(climate, soil, null, 'uk')
		const fertility = result.find(x => x.id === 'fertility')!

		expect(fertility.level).toBe('high')
		expect(fertility.evidence[0].value).toBe(5)
		expect(fertility.whyFull).toContain('5')
	})

	it('does not invent an erosion estimate', () => {
		const result = computeStress(climate, soil, {
			elevationM: 100,
			slopePct: 12,
		})

		const erosion = result.find(x => x.id === 'erosion')!

		expect(erosion.confidence).toBe('low')
		expect(erosion.evidence[0].value).toBe(12)
		expect(erosion.whyFull).toContain('12')
	})

	it('keeps scores within the API range', () => {
		const result = computeStress(climate, soil, null)

		expect(result.every(x => x.score >= 0 && x.score <= 100)).toBe(true)
	})
})
