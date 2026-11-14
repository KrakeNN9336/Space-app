import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('./crops.json', import.meta.url)
const database = JSON.parse(readFileSync(file, 'utf8'))

const additions = [
	['rice', 'Rice', 'Рис', 'cereal', '🌾'],
	['sorghum', 'Sorghum', 'Сорго', 'cereal', '🌾'],
	['millet', 'Millet', 'Просо', 'cereal', '🌾'],
	['chickpea', 'Chickpea', 'Нут', 'legume', '🫘'],
	['lentil', 'Lentil', 'Сочевиця', 'legume', '🫘'],
	['oats', 'Oats', 'Овес', 'cereal', '🌾'],
	['rye', 'Rye', 'Жито', 'cereal', '🌾'],
	['buckwheat', 'Buckwheat', 'Гречка', 'cereal', '🌾'],
	['sugar_beet', 'Sugar beet', 'Цукровий буряк', 'root', '🌱'],
	['cotton', 'Cotton', 'Бавовник', 'industrial', '🌿'],
	['groundnut', 'Groundnut', 'Арахіс', 'legume', '🥜'],
	['cassava', 'Cassava', 'Маніок', 'root', '🌱'],
	['sweet_potato', 'Sweet potato', 'Батат', 'root', '🍠'],
	['common_bean', 'Common bean', 'Квасоля', 'legume', '🫘'],
	['cover_rye', 'Cover crop rye', 'Жито як сидерат', 'cover', '🌱'],
]

const families = {
	winter_wheat: 'Poaceae',
	spring_wheat: 'Poaceae',
	barley: 'Poaceae',
	corn: 'Poaceae',
	soybean: 'Fabaceae',
	pea: 'Fabaceae',
	sunflower: 'Asteraceae',
	rapeseed: 'Brassicaceae',
	potato: 'Solanaceae',
	clover: 'Fabaceae',
	rice: 'Poaceae',
	sorghum: 'Poaceae',
	millet: 'Poaceae',
	chickpea: 'Fabaceae',
	lentil: 'Fabaceae',
	oats: 'Poaceae',
	rye: 'Poaceae',
	buckwheat: 'Polygonaceae',
	sugar_beet: 'Amaranthaceae',
	cotton: 'Malvaceae',
	groundnut: 'Fabaceae',
	cassava: 'Euphorbiaceae',
	sweet_potato: 'Convolvulaceae',
	common_bean: 'Fabaceae',
	cover_rye: 'Poaceae',
}

const existingIds = new Set(database.crops.map(c => c.id))

for (const [id, en, uk, group, icon] of additions) {
	if (!existingIds.has(id)) {
		database.crops.push({
			id,
			name: { en, uk },
			group,
			icon,
		})
		existingIds.add(id)
	}
}

const emptyRange = () => ({
	min: null,
	optMin: null,
	optMax: null,
	max: null,
})

database.crops = database.crops.map(crop => ({
	...crop,
	family: crop.family ?? families[crop.id] ?? null,
	type: crop.type ?? crop.group,
	tempRange: crop.tempRange ?? emptyRange(),
	precipRange: crop.precipRange ?? emptyRange(),
	phRange: crop.phRange ?? emptyRange(),
	seasonDays: crop.seasonDays ?? null,
	droughtSensitivity: crop.droughtSensitivity ?? null,
	floodSensitivity: crop.floodSensitivity ?? null,
	frostSensitivity: crop.frostSensitivity ?? null,
	goodPredecessors: crop.goodPredecessors ?? [],
	badPredecessors: crop.badPredecessors ?? [],
	econScore: crop.econScore ?? null,
	source: crop.source ?? null,
	verificationStatus: crop.verificationStatus ?? 'verify',
}))

const ids = database.crops.map(c => c.id)
const originalIds = [
	'winter_wheat',
	'spring_wheat',
	'barley',
	'corn',
	'soybean',
	'pea',
	'sunflower',
	'rapeseed',
	'potato',
	'clover',
]

if (
	database.crops.length !== 25 ||
	new Set(ids).size !== 25 ||
	!originalIds.every(id => ids.includes(id))
) {
	throw new Error('Crop catalog validation failed')
}

database._note =
	'25 crop records. Agronomic values marked verify require source validation. Null means unknown.'

writeFileSync(file, JSON.stringify(database, null, 2) + '\n')

console.log('OK: 25 crops')
console.log('Original IDs preserved')
console.log('Agronomic values pending verification')
