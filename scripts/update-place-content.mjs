import { readFile, writeFile } from 'node:fs/promises';
import { enrichPlaces } from './place-content.mjs';
const path = new URL('../public/data/places.json', import.meta.url);
const data = JSON.parse(await readFile(path, 'utf8'));
data.places = await enrichPlaces(data.places);
await writeFile(path, JSON.stringify(data));
console.log(`Updated ${data.places.filter(p => p.visitGuide).length} place visit guides; retained all ${data.places.length} map places.`);
