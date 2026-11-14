import type { Lang, RawSoil, WrbGroup } from '@field-shift/shared'

import catalog from '../../data/soil-wrb.json'

/**
 * Finds a WRB soil group by its official English
 * name or short code.
 *
 * Returns null when the soil group is unknown.
 * No network requests are performed.
 */
export function getWrbGroup(
	raw: RawSoil['wrbGroup'],
	lang: Lang,
): WrbGroup | null {
	if (!raw || !raw.name?.trim()) {
		return null
	}

	const search = raw.name.trim().toLowerCase()

	const group = catalog.groups.find(
		item =>
			item.name.en.toLowerCase() === search ||
			item.code.toLowerCase() === search,
	)

	if (!group) {
		return null
	}

	const probability =
		typeof raw.probability === 'number' &&
		Number.isFinite(raw.probability) &&
		raw.probability >= 0 &&
		raw.probability <= 1
			? raw.probability
			: null

	return {
		code: group.code,
		name: group.name[lang],
		probability,
		explain: group.simple[lang],
	}
}
