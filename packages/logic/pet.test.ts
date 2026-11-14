import { describe, expect, it } from 'vitest'
import { estimateMonthlyPetMm } from './pet'

describe('Hargreaves monthly PET', () => {
	const mean = Array(12).fill(15)
	const min = Array(12).fill(10)
	const max = Array(12).fill(20)

	it('returns 12 finite non-negative monthly totals', () => {
		const result = estimateMonthlyPetMm(49.84, mean, min, max)

		expect(result).toHaveLength(12)
		expect(result!.every(v => Number.isFinite(v) && v >= 0)).toBe(true)
	})

	it('accounts for Northern and Southern Hemisphere seasons', () => {
		const north = estimateMonthlyPetMm(50, mean, min, max)!
		const south = estimateMonthlyPetMm(-50, mean, min, max)!

		expect(north[6]).toBeGreaterThan(south[6])
		expect(south[0]).toBeGreaterThan(north[0])
	})

	it('returns null for incomplete data', () => {
		expect(estimateMonthlyPetMm(50, [15], min, max)).toBeNull()
		expect(estimateMonthlyPetMm(95, mean, min, max)).toBeNull()
	})

	it('rejects invalid temperature ranges', () => {
		expect(
			estimateMonthlyPetMm(50, mean, Array(12).fill(20), Array(12).fill(10)),
		).toBeNull()
	})
})
