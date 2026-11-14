import { describe, expect, it } from 'vitest'
import { allocateCropShares } from './areaAllocation'

const crop = (id: string, score: number | null, verified = true) => ({
	id,
	score,
	verified,
})

describe('Field Shift area allocation', () => {
	it('always allocates exactly 100%', () => {
		const result = allocateCropShares([
			crop('wheat', 90),
			crop('corn', 70),
			crop('pea', 50),
		])

		expect(result.status).toBe('ready')

		expect(result.shares.reduce((s, c) => s + c.sharePct, 0)).toBe(100)
	})

	it('uses multiples of 5 within allowed bounds', () => {
		const result = allocateCropShares([
			crop('a', 95),
			crop('b', 80),
			crop('c', 65),
			crop('d', 40),
			crop('e', 20),
		])

		for (const c of result.shares) {
			expect(c.sharePct % 5).toBe(0)
			expect(c.sharePct).toBeGreaterThanOrEqual(10)
			expect(c.sharePct).toBeLessThanOrEqual(60)
		}
	})

	it('respects the 60% maximum', () => {
		const result = allocateCropShares([crop('strong', 100), crop('weak', 1)])

		expect(result.shares[0].sharePct).toBe(60)
		expect(result.shares[1].sharePct).toBe(40)
	})

	it('selects at most five crops', () => {
		const result = allocateCropShares([
			crop('a', 90),
			crop('b', 80),
			crop('c', 70),
			crop('d', 60),
			crop('e', 50),
			crop('f', 40),
		])

		expect(result.shares).toHaveLength(5)
		expect(result.notSelectedIds).toEqual(['f'])
	})

	it('does not allocate unverified or missing scores', () => {
		const result = allocateCropShares([
			crop('a', null),
			crop('b', 90, false),
			crop('c', 80),
		])

		expect(result.status).toBe('insufficient_data')
		expect(result.shares).toEqual([])
		expect(result.excludedIds).toContain('a')
		expect(result.excludedIds).toContain('b')
	})

	it('rejects duplicate crop IDs', () => {
		const result = allocateCropShares([crop('wheat', 80), crop('wheat', 70)])

		expect(result.status).toBe('invalid_input')
		expect(result.shares).toEqual([])
	})
})
