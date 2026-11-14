import type { HistoryYear, RotationYear } from '@field-shift/shared'

import type { AllocatedCrop } from './areaAllocation'

const YEARS = 3
const UNIT_PCT = 5
const TOTAL_UNITS = 100 / UNIT_PCT

export type RotationWarning =
	| 'historical_field_positions_unknown'
	| 'first_year_crop_overlaps_last_history'
	| 'crop_family_rules_not_evaluated'

export interface RotationPlanResult {
	status: 'ready' | 'insufficient_data' | 'invalid_input'
	rotationPlan: RotationYear[]
	virtualBlocks: string[][]
	warnings: RotationWarning[]
}

/**
 * Builds a provisional three-year crop rotation.
 *
 * Each virtual block represents 5% of the field.
 * The same virtual block changes crop each year.
 *
 * These are planning units, not mapped field parcels.
 * Historical spatial placement is unknown.
 */
export function buildRotationPlan(
	shares: readonly AllocatedCrop[],
	history: readonly HistoryYear[],
): RotationPlanResult {
	const failure = (
		status: 'insufficient_data' | 'invalid_input',
	): RotationPlanResult => ({
		status,
		rotationPlan: [],
		virtualBlocks: [],
		warnings: [],
	})

	if (shares.length < 2) {
		return failure('insufficient_data')
	}

	if (shares.length > 5 || history.length !== 3) {
		return failure('invalid_input')
	}

	const ids = shares.map(c => c.id)

	if (
		ids.some(id => !id.trim()) ||
		new Set(ids).size !== ids.length ||
		shares.some(
			c =>
				!Number.isFinite(c.score) ||
				c.score < 0 ||
				c.score > 100 ||
				!Number.isInteger(c.sharePct) ||
				c.sharePct < 10 ||
				c.sharePct > 60 ||
				c.sharePct % UNIT_PCT !== 0,
		) ||
		shares.reduce((sum, c) => sum + c.sharePct, 0) !== 100
	) {
		return failure('invalid_input')
	}

	if (
		history.some(
			(entry, index) =>
				!Number.isInteger(entry.year) ||
				!Array.isArray(entry.crops) ||
				entry.crops.length === 0 ||
				entry.crops.some(id => !id.trim()) ||
				(index > 0 && entry.year <= history[index - 1].year),
		)
	) {
		return failure('invalid_input')
	}

	// A stable sequence of 20 virtual field units.
	const baseBlocks = shares.flatMap(c =>
		Array.from({ length: c.sharePct / UNIT_PCT }, () => c.id),
	)

	if (baseBlocks.length !== TOTAL_UNITS) {
		return failure('invalid_input')
	}

	const lastYear = history[history.length - 1].year

	// Rotate each virtual unit to a different crop
	// in each subsequent year.
	const virtualBlocks = Array.from({ length: YEARS }, (_, yearOffset) =>
		baseBlocks.map(id => {
			const index = ids.indexOf(id)
			return ids[(index + yearOffset) % ids.length]
		}),
	)

	const rotationPlan: RotationYear[] = virtualBlocks.map((blocks, index) => {
		const counts = new Map<string, number>()

		for (const id of blocks) {
			counts.set(id, (counts.get(id) ?? 0) + 1)
		}

		return {
			year: lastYear + index + 1,
			blocks: ids
				.filter(id => (counts.get(id) ?? 0) > 0)
				.map(id => ({
					cropId: id,
					sharePct: (counts.get(id) ?? 0) * UNIT_PCT,
				})),
		}
	})

	const warnings: RotationWarning[] = [
		'historical_field_positions_unknown',
		'crop_family_rules_not_evaluated',
	]

	const previousCrops = new Set(history[history.length - 1].crops)

	if (virtualBlocks[0].some(id => previousCrops.has(id))) {
		warnings.push('first_year_crop_overlaps_last_history')
	}

	return {
		status: 'ready',
		rotationPlan,
		virtualBlocks,
		warnings,
	}
}
