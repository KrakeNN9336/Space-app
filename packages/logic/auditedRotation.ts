import type { HistoryYear, RotationYear } from '@field-shift/shared'

import type { AllocatedCrop } from './areaAllocation'

import { buildRotationPlan } from './rotationPlan'

import {
	auditRotation,
	type CropBiology,
	type RotationIssue,
} from './rotationAudit'

export interface AuditedRotationResult {
	status:
		| 'provisional'
		| 'needs_review'
		| 'blocked'
		| 'insufficient_data'
		| 'invalid_input'

	rotationPlan: RotationYear[]
	warnings: string[]
	issues: RotationIssue[]
}

/**
 * Builds and audits a provisional three-year rotation.
 *
 * Blocked or review-required rotations are never
 * returned as actionable plans.
 *
 * A passing biological audit does not constitute
 * full agronomic validation.
 */
export function buildAuditedRotation(
	shares: readonly AllocatedCrop[],
	history: readonly HistoryYear[],
	crops: readonly CropBiology[],
): AuditedRotationResult {
	const candidate = buildRotationPlan(shares, history)

	if (candidate.status !== 'ready') {
		return {
			status: candidate.status,
			rotationPlan: [],
			warnings: candidate.warnings,
			issues: [],
		}
	}

	const audit = auditRotation(candidate.virtualBlocks, crops)

	const warnings = [
		...new Set([
			...candidate.warnings.filter(
				w => w !== 'crop_family_rules_not_evaluated',
			),
			'crop_requirements_unverified',
			...audit.issues.map(issue => `rotation_${issue.code.toLowerCase()}`),
		]),
	]

	if (audit.status !== 'pass') {
		return {
			status: audit.status === 'blocked' ? 'blocked' : 'needs_review',
			rotationPlan: [],
			warnings,
			issues: audit.issues,
		}
	}

	return {
		status: 'provisional',
		rotationPlan: candidate.rotationPlan,
		warnings,
		issues: [],
	}
}
