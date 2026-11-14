import type {
	Climate,
	HistoryYear,
	Priorities,
	Soil,
} from '@field-shift/shared'

import { assessCropSeasons, type CatalogCrop } from './cropAssessment'

import { allocateCropShares } from './areaAllocation'
import { buildAuditedRotation } from './auditedRotation'

export interface PlanningInput {
	crops: readonly CatalogCrop[]
	climate: Climate | null
	soil: Soil | null
	history: readonly HistoryYear[]
	priorities: Priorities
	validatedRiskSuitabilityPct: number | null
}

export function buildRecommendationPipeline(input: PlanningInput) {
	const lastCrops = input.history.at(-1)?.crops ?? []
	const catalog = new Map(input.crops.map(crop => [crop.id, crop]))

	const lastFamilies = lastCrops.flatMap(id => {
		const family = catalog.get(id)?.family
		return family ? [family] : []
	})

	const assessments = assessCropSeasons(input.crops, {
		climate: input.climate,
		soil: input.soil,
		previousCropIds: [...lastCrops],
		previousFamilies: lastFamilies,
		priorities: input.priorities,
		verifiedRiskSuitabilityPct: input.validatedRiskSuitabilityPct,
	})

	const allocation = allocateCropShares(
		assessments.map(item => ({
			id: item.id,
			score: item.suitability.score,
			verified: item.eligibleForRecommendation,
		})),
	)

	const warningCodes = [
		...new Set(assessments.flatMap(item => item.blockerCodes)),
	]

	if (allocation.status !== 'ready') {
		return {
			status: allocation.status,
			assessments,
			allocation,
			rotation: null,
			warningCodes,
		}
	}

	const rotation = buildAuditedRotation(
		allocation.shares,
		input.history,
		input.crops,
	)

	return {
		status: rotation.status,
		assessments,
		allocation,
		rotation,
		warningCodes: [...new Set([...warningCodes, ...rotation.warnings])],
	}
}
