import { describe, expect, it } from 'vitest'
import type { HistoryYear } from '@field-shift/shared'

import { buildRotationPlan } from './rotationPlan'

const shares = [
	{ id: 'winter_wheat', score: 90, sharePct: 60 },
	{ id: 'soybean', score: 80, sharePct: 30 },
	{ id: 'corn', score: 75, sharePct: 10 },
]

const history: HistoryYear[] = [
	{ year: 2024, crops: ['corn'] },
	{ year: 2025, crops: ['soybean'] },
	{ year: 2026, crops: ['winter_wheat'] },
]

describe('Field Shift three-year rotation', () => {
	it('builds exactly three future years', () => {
		const result = buildRotationPlan(shares, history)

		expect(result.status).toBe('ready')
		expect(result.rotationPlan.map(y => y.year)).toEqual([2027, 2028, 2029])
	})

	it('allocates 100% in every year', () => {
		const result = buildRotationPlan(shares, history)

		for (const year of result.rotationPlan) {
			const total = year.blocks.reduce((sum, block) => sum + block.sharePct, 0)

			expect(total).toBe(100)

			for (const block of year.blocks) {
				expect(block.sharePct % 5).toBe(0)
				expect(block.sharePct).toBeGreaterThanOrEqual(10)
				expect(block.sharePct).toBeLessThanOrEqual(60)
			}
		}
	})

	it('does not repeat a crop on virtual blocks', () => {
		const result = buildRotationPlan(shares, history)
		const years = result.virtualBlocks

		expect(years).toHaveLength(3)

		for (const year of years) {
			expect(year).toHaveLength(20)
		}

		for (let block = 0; block < 20; block++) {
			expect(years[0][block]).not.toBe(years[1][block])
			expect(years[1][block]).not.toBe(years[2][block])
		}
	})

	it('warns about unknown historical positions', () => {
		const result = buildRotationPlan(shares, history)

		expect(result.warnings).toContain('historical_field_positions_unknown')

		expect(result.warnings).toContain('first_year_crop_overlaps_last_history')
	})

	it('rejects invalid area allocation', () => {
		const result = buildRotationPlan(
			[
				{ id: 'wheat', score: 90, sharePct: 70 },
				{ id: 'pea', score: 80, sharePct: 30 },
			],
			history,
		)

		expect(result.status).toBe('invalid_input')
		expect(result.rotationPlan).toEqual([])
	})

	it('requires at least two eligible crops', () => {
		const result = buildRotationPlan(
			[{ id: 'wheat', score: 90, sharePct: 100 }],
			history,
		)

		expect(result.status).toBe('insufficient_data')
	})

	it('returns the same plan for identical inputs', () => {
		expect(buildRotationPlan(shares, history)).toEqual(
			buildRotationPlan(shares, history),
		)
	})
})
