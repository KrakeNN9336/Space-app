import { describe, expect, it } from 'vitest'
import type { SoilProperties } from '@field-shift/shared'

import {
	calculateAridityIndex,
	estimateAvailableWaterMm,
	calculateWaterBalance,
} from './waterBalance'

const value = (median: number | null) => ({
	median,
	low: null,
	high: null,
})

const soil: SoilProperties = {
	sandPct: value(40),
	siltPct: value(35),
	clayPct: value(25),
	organicCarbonGkg: value(15),
	phH2O: value(6.5),
}

describe('Field Shift water balance', () => {
	it('estimates positive available water capacity', () => {
		const capacity = estimateAvailableWaterMm(soil, 600)

		expect(capacity).not.toBeNull()
		expect(capacity!).toBeGreaterThan(0)
		expect(capacity!).toBeLessThan(600)
	})

	it('does not invent a missing root depth', () => {
		expect(estimateAvailableWaterMm(soil, null)).toBeNull()
	})

	it('calculates the aridity index', () => {
		const rainfall = Array(12).fill(40)
		const pet = Array(12).fill(80)

		expect(calculateAridityIndex(rainfall, pet)).toBeCloseTo(0.5)
	})

	it('calculates a water deficit during dry conditions', () => {
		const rainfall = Array(12).fill(0)
		const pet = Array(12).fill(50)

		const result = calculateWaterBalance(rainfall, pet, 100, 80)

		expect(result).not.toBeNull()
		expect(result!.annualDeficitMm).toBeGreaterThan(0)
		expect(result!.storageMm[0]).toBeLessThan(80)
	})

	it('calculates surplus when soil storage is full', () => {
		const rainfall = Array(12).fill(0)
		const pet = Array(12).fill(0)

		rainfall[0] = 100
		pet[0] = 40

		const result = calculateWaterBalance(rainfall, pet, 100, 90)

		expect(result!.surplusMm[0]).toBeCloseTo(50)
		expect(result!.storageMm[0]).toBeCloseTo(100)
	})

	it('returns null instead of inventing missing data', () => {
		expect(calculateWaterBalance([50], Array(12).fill(80), 100, 50)).toBeNull()

		expect(
			calculateWaterBalance(Array(12).fill(40), Array(12).fill(80), null, null),
		).toBeNull()
	})
})
