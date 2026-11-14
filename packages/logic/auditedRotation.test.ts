import { describe, expect, it } from 'vitest'
import type { HistoryYear } from '@field-shift/shared'

import catalog from '../../data/crops.json'
import { buildAuditedRotation } from './auditedRotation'

const history: HistoryYear[] = [
	{ year: 2024, crops: ['corn'] },
	{ year: 2025, crops: ['soybean'] },
	{ year: 2026, crops: ['winter_wheat'] },
]

const shares = (a: string, b: string, c: string) => [
	{ id: a, score: 90, sharePct: 50 },
	{ id: b, score: 80, sharePct: 30 },
	{ id: c, score: 70, sharePct: 20 },
]

describe('Audited crop rotation integration', () => {
	it('produces a provisional plan for distinct families', () => {
		const result = buildAuditedRotation(
			shares('winter_wheat', 'soybean', 'sunflower'),
			history,
			catalog.crops,
		)

		expect(result.status).toBe('provisional')
		expect(result.rotationPlan).toHaveLength(3)
		expect(result.issues).toEqual([])

		for (const year of result.rotationPlan) {
			expect(year.blocks.reduce((sum, block) => sum + block.sharePct, 0)).toBe(
				100,
			)
		}
	})

	it('blocks repeated botanical species', () => {
		const result = buildAuditedRotation(
			shares('winter_wheat', 'spring_wheat', 'soybean'),
			history,
			catalog.crops,
		)

		expect(result.status).toBe('blocked')
		expect(result.rotationPlan).toEqual([])
		expect(result.issues.some(i => i.code === 'SAME_SPECIES')).toBe(true)
	})

	it('requires review for repeated cereal families', () => {
		const result = buildAuditedRotation(
			shares('winter_wheat', 'barley', 'soybean'),
			history,
			catalog.crops,
		)

		expect(result.status).toBe('needs_review')
		expect(result.rotationPlan).toEqual([])
	})

	it('blocks unknown crops', () => {
		const result = buildAuditedRotation(
			shares('unknown_crop', 'soybean', 'sunflower'),
			history,
			catalog.crops,
		)

		expect(result.status).toBe('blocked')
		expect(result.rotationPlan).toEqual([])
	})

	it('rejects invalid area allocations', () => {
		const result = buildAuditedRotation(
			[
				{ id: 'corn', score: 90, sharePct: 70 },
				{ id: 'soybean', score: 80, sharePct: 30 },
			],
			history,
			catalog.crops,
		)

		expect(result.status).toBe('invalid_input')
		expect(result.rotationPlan).toEqual([])
	})

	it('rejects insufficient crop diversity', () => {
		const result = buildAuditedRotation(
			[{ id: 'corn', score: 90, sharePct: 100 }],
			history,
			catalog.crops,
		)

		expect(result.status).toBe('insufficient_data')
		expect(result.rotationPlan).toEqual([])
	})
})
