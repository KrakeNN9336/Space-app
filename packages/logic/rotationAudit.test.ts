import { describe, expect, it } from 'vitest'
import catalog from '../../data/crops.json'
import { auditRotation } from './rotationAudit'

const plan = (a: string, b: string, c: string) => [
	Array(20).fill(a),
	Array(20).fill(b),
	Array(20).fill(c),
]

const crops = catalog.crops

describe('Field Shift biological rotation audit', () => {
	it('blocks repeating the same crop', () => {
		const result = auditRotation(plan('corn', 'corn', 'soybean'), crops)

		expect(result.status).toBe('blocked')
		expect(result.issues.some(i => i.code === 'SAME_CROP')).toBe(true)
	})

	it('detects winter and spring wheat as one species', () => {
		const result = auditRotation(
			plan('winter_wheat', 'spring_wheat', 'soybean'),
			crops,
		)

		expect(result.status).toBe('blocked')
		expect(result.issues.some(i => i.code === 'SAME_SPECIES')).toBe(true)
	})

	it('detects rye and cover rye as one species', () => {
		const result = auditRotation(plan('rye', 'cover_rye', 'soybean'), crops)

		expect(result.status).toBe('blocked')
	})

	it('flags different crops from the same family', () => {
		const result = auditRotation(
			plan('barley', 'winter_wheat', 'soybean'),
			crops,
		)

		expect(result.status).toBe('needs_review')
		expect(result.issues.some(i => i.code === 'SAME_FAMILY')).toBe(true)
	})

	it('passes three distinct families', () => {
		const result = auditRotation(
			plan('winter_wheat', 'soybean', 'sunflower'),
			crops,
		)

		expect(result.status).toBe('pass')
		expect(result.issues).toEqual([])
	})

	it('blocks unknown crop identifiers', () => {
		const result = auditRotation(plan('corn', 'unknown_crop', 'soybean'), crops)

		expect(result.status).toBe('blocked')
		expect(result.issues.some(i => i.code === 'UNKNOWN_CROP')).toBe(true)
	})

	it('rejects malformed virtual field plans', () => {
		const result = auditRotation([Array(19).fill('corn')], crops)

		expect(result.status).toBe('blocked')
		expect(result.issues[0].code).toBe('INVALID_PLAN')
	})
})


