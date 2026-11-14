export interface AllocationCandidate {
	id: string
	score: number | null
	verified: boolean
}

export interface AllocatedCrop {
	id: string
	score: number
	sharePct: number
}

export interface AllocationResult {
	status: 'ready' | 'insufficient_data' | 'invalid_input'
	shares: AllocatedCrop[]
	excludedIds: string[]
	notSelectedIds: string[]
}

const MIN_SHARE = 10
const MAX_SHARE = 60
const STEP = 5
const MAX_CROPS = 5

/**
 * Distributes 100% of field area among eligible crops.
 *
 * Uses squared suitability scores as relative weights.
 * Shares are constrained to 10–60% in 5% increments.
 *
 * The caller must validate agronomic provenance before
 * setting verified=true.
 *
 * No yield or financial prediction is made.
 */
export function allocateCropShares(
	candidates: readonly AllocationCandidate[],
): AllocationResult {
	const empty = (
		status: 'insufficient_data' | 'invalid_input',
	): AllocationResult => ({
		status,
		shares: [],
		excludedIds: [],
		notSelectedIds: [],
	})

	const ids = candidates.map(c => c.id)

	if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) {
		return empty('invalid_input')
	}

	const eligible = candidates.filter(
		c =>
			c.verified &&
			c.score !== null &&
			Number.isFinite(c.score) &&
			c.score > 0 &&
			c.score <= 100,
	) as Array<AllocationCandidate & { score: number }>

	const eligibleIds = new Set(eligible.map(c => c.id))

	const excludedIds = candidates
		.filter(c => !eligibleIds.has(c.id))
		.map(c => c.id)

	eligible.sort(
		(a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
	)

	const selected = eligible.slice(0, MAX_CROPS)

	const notSelectedIds = eligible.slice(MAX_CROPS).map(c => c.id)

	// One crop cannot satisfy the 60% maximum.
	if (selected.length < 2) {
		return {
			status: 'insufficient_data',
			shares: [],
			excludedIds,
			notSelectedIds,
		}
	}

	const weights = selected.map(c => c.score ** 2)
	const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)

	const targets = weights.map(weight => (100 * weight) / weightTotal)

	const shares = selected.map(c => ({
		id: c.id,
		score: c.score,
		sharePct: MIN_SHARE,
	}))

	const remainingUnits = (100 - shares.length * MIN_SHARE) / STEP

	for (let unit = 0; unit < remainingUnits; unit++) {
		let bestIndex = -1
		let largestDeficit = -Infinity

		for (let i = 0; i < shares.length; i++) {
			if (shares[i].sharePct >= MAX_SHARE) continue

			const deficit = targets[i] - shares[i].sharePct

			if (deficit > largestDeficit) {
				largestDeficit = deficit
				bestIndex = i
			}
		}

		if (bestIndex === -1) {
			return empty('invalid_input')
		}

		shares[bestIndex].sharePct += STEP
	}

	return {
		status: 'ready',
		shares,
		excludedIds,
		notSelectedIds,
	}
}
