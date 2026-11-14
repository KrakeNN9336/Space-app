export interface CropBiology {
	id: string
	family: string | null
	source: string | null
}

export type RotationIssueCode =
	| 'INVALID_PLAN'
	| 'UNKNOWN_CROP'
	| 'MISSING_BIOLOGY'
	| 'SAME_CROP'
	| 'SAME_SPECIES'
	| 'SAME_FAMILY'

export interface RotationIssue {
	code: RotationIssueCode
	severity: 'block' | 'review'
	yearIndex: number | null
	blockIndex: number | null
	fromId: string | null
	toId: string | null
}

export interface RotationAuditResult {
	status: 'pass' | 'needs_review' | 'blocked'
	issues: RotationIssue[]
}

function getSpecies(source: string | null): string | null {
	const match = source?.match(/\bspecies=([^;]+)/i)
	return match?.[1]?.trim().toLowerCase() || null
}

/**
 * Audits three years of 5%-area virtual blocks.
 *
 * A repeated botanical species blocks approval.
 * A repeated botanical family requires review.
 * Missing biological identity cannot be assumed safe.
 *
 * This is a screening rule, not a complete
 * crop rotation or phytosanitary model.
 */
export function auditRotation(
	virtualBlocks: readonly (readonly string[])[],
	crops: readonly CropBiology[],
): RotationAuditResult {
	const issues: RotationIssue[] = []

	function add(
		code: RotationIssueCode,
		severity: 'block' | 'review',
		yearIndex: number | null,
		blockIndex: number | null,
		fromId: string | null,
		toId: string | null,
	) {
		issues.push({
			code,
			severity,
			yearIndex,
			blockIndex,
			fromId,
			toId,
		})
	}

	if (
		virtualBlocks.length !== 3 ||
		virtualBlocks.some(year => year.length !== 20)
	) {
		add('INVALID_PLAN', 'block', null, null, null, null)
		return { status: 'blocked', issues }
	}

	const catalog = new Map(crops.map(c => [c.id, c]))

	for (let year = 1; year < 3; year++) {
		for (let block = 0; block < 20; block++) {
			const fromId = virtualBlocks[year - 1][block]
			const toId = virtualBlocks[year][block]

			if (!fromId || !toId) {
				add('INVALID_PLAN', 'block', year, block, fromId || null, toId || null)
				continue
			}

			// Fallow is intentionally not a planted species.
			if (fromId === 'fallow' || toId === 'fallow') {
				continue
			}

			const from = catalog.get(fromId)
			const to = catalog.get(toId)

			if (!from || !to) {
				add('UNKNOWN_CROP', 'block', year, block, fromId, toId)
				continue
			}

			if (fromId === toId) {
				add('SAME_CROP', 'block', year, block, fromId, toId)
				continue
			}

			const speciesA = getSpecies(from.source)
			const speciesB = getSpecies(to.source)

			if (!speciesA || !speciesB || !from.family || !to.family) {
				add('MISSING_BIOLOGY', 'review', year, block, fromId, toId)
				continue
			}

			if (speciesA === speciesB) {
				add('SAME_SPECIES', 'block', year, block, fromId, toId)
			} else if (from.family === to.family) {
				add('SAME_FAMILY', 'review', year, block, fromId, toId)
			}
		}
	}

	const status = issues.some(i => i.severity === 'block')
		? 'blocked'
		: issues.length > 0
			? 'needs_review'
			: 'pass'

	return { status, issues }
}
