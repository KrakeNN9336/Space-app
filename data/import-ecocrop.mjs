import { readFileSync, writeFileSync } from 'node:fs'

const inputPath = process.argv[2]

if (!inputPath) {
	throw new Error('Usage: node data/import-ecocrop.mjs <csv-path>')
}

function parseCsv(text) {
	const rows = []
	let row = []
	let cell = ''
	let quoted = false

	for (let i = 0; i < text.length; i++) {
		const char = text[i]

		if (char === '"') {
			if (quoted && text[i + 1] === '"') {
				cell += '"'
				i++
			} else {
				quoted = !quoted
			}
		} else if (char === ',' && !quoted) {
			row.push(cell)
			cell = ''
		} else if ((char === '\n' || char === '\r') && !quoted) {
			if (char === '\r' && text[i + 1] === '\n') i++
			row.push(cell)
			rows.push(row)
			row = []
			cell = ''
		} else {
			cell += char
		}
	}

	if (quoted) throw new Error('Invalid CSV quoting')
	if (cell || row.length) rows.push([...row, cell])

	return rows
}

const raw = readFileSync(inputPath, 'latin1')
const rows = parseCsv(raw)

if (rows.length < 2000) {
	throw new Error('Unexpected EcoCrop dataset size')
}

const normalize = value =>
	String(value)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')

const header = rows.shift().map(normalize)

for (const required of [
	'scientificname',
	'tmin',
	'topmn',
	'topmx',
	'tmax',
	'rmin',
	'ropmn',
	'ropmx',
	'rmax',
	'phmin',
	'phopmn',
	'phopmx',
	'phmax',
]) {
	if (!header.includes(required)) {
		throw new Error(`Missing source column: ${required}`)
	}
}

const records = rows.map(cells =>
	Object.fromEntries(header.map((key, i) => [key, (cells[i] ?? '').trim()])),
)

// Explicit botanical species mapping.
// Crop varieties and production uses require separate review.
const species = {
	winter_wheat: 'Triticum aestivum',
	spring_wheat: 'Triticum aestivum',
	barley: 'Hordeum vulgare',
	corn: 'Zea mays',
	soybean: 'Glycine max',
	pea: 'Pisum sativum',
	sunflower: 'Helianthus annuus',
	rapeseed: 'Brassica napus',
	potato: 'Solanum tuberosum',
	rice: 'Oryza sativa',
	sorghum: 'Sorghum bicolor',
	millet: 'Panicum miliaceum',
	chickpea: 'Cicer arietinum',
	lentil: 'Lens culinaris',
	oats: 'Avena sativa',
	rye: 'Secale cereale',
	buckwheat: 'Fagopyrum esculentum',
	groundnut: 'Arachis hypogaea',
	cassava: 'Manihot esculenta',
	sweet_potato: 'Ipomoea batatas',

	common_bean: 'Phaseolus vulgaris',
	clover: 'Trifolium pratense',
	sugar_beet: 'Beta vulgaris var. saccharifera',
	cotton: 'Gossypium hirsutum',
	cover_rye: 'Secale cereale',
}

function numeric(value) {
	if (!value || value.toUpperCase() === 'NA') return null
	const number = Number(value)
	return Number.isFinite(number) ? number : null
}

function getRange(record, keys) {
	const values = keys.map(key => numeric(record[key]))

	if (values.some(value => value === null)) {
		return null
	}

	const [min, optMin, optMax, max] = values

	if (!(min < optMin && optMin <= optMax && optMax < max)) {
		return null
	}

	return { min, optMin, optMax, max }
}

const file = new URL('./crops.json', import.meta.url)
const database = JSON.parse(readFileSync(file, 'utf8'))

const audit = []

for (const crop of database.crops) {
	const target = species[crop.id]

	if (!target) {
		audit.push({ id: crop.id, status: 'manual_review' })
		continue
	}

	const name = target.toLowerCase()

	const exact = records.filter(
		record => (record.scientificname ?? '').toLowerCase() === name,
	)

	const matches = exact.length
		? exact
		: records.filter(record =>
				(record.scientificname ?? '').toLowerCase().startsWith(name + ' '),
			)

	if (matches.length !== 1) {
		audit.push({
			id: crop.id,
			status: 'missing_or_ambiguous',
			matches: matches.length,
		})
		continue
	}

	const record = matches[0]

	const temperature = getRange(record, ['tmin', 'topmn', 'topmx', 'tmax'])

	const rainfall = getRange(record, ['rmin', 'ropmn', 'ropmx', 'rmax'])

	const ph = getRange(record, ['phmin', 'phopmn', 'phopmx', 'phmax'])

	// Preserve any previously verified records.
	if (crop.verificationStatus === 'verified') {
		audit.push({ id: crop.id, status: 'already_verified' })
		continue
	}

	if (temperature) crop.tempRange = temperature
	if (rainfall) crop.precipRange = rainfall
	if (ph && ph.min >= 0 && ph.max <= 14) {
		crop.phRange = ph
	}

	const gmin = numeric(record.gmin)
	const gmax = numeric(record.gmax)

	if (gmin !== null && gmax !== null && gmin > 0 && gmax >= gmin) {
		crop.seasonDaysRange = { min: gmin, max: gmax }
	}

	const hasData = Boolean(temperature || rainfall || ph)

	if (hasData) {
		crop.source =
			`FAO EcoCrop via OpenCLIM; ` +
			`species=${target}; ` +
			`EcoPort=${record.ecoportcode ?? 'unknown'}`
	}

	// Imported data is not automatically agronomically verified.
	crop.verificationStatus = 'verify'

	audit.push({
		id: crop.id,
		species: target,
		status: hasData ? 'imported_needs_review' : 'incomplete',
		temperature: Boolean(temperature),
		rainfall: Boolean(rainfall),
		ph: Boolean(ph),
	})
}

writeFileSync(file, JSON.stringify(database, null, 2) + '\n')

writeFileSync(
	new URL('./ecocrop-audit.json', import.meta.url),
	JSON.stringify(audit, null, 2) + '\n',
)

console.log('Crop records:', database.crops.length)
console.log('Source species:', records.length)
console.log(
	'Imported:',
	audit.filter(x => x.status === 'imported_needs_review').length,
)
console.log(
	'Manual review:',
	audit.filter(x => x.status !== 'imported_needs_review').length,
)
console.log('Verification still required')
