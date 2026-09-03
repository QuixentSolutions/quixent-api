import 'dotenv/config';
import { connectTurfSpotDB } from '../config/db';

// Seeds approved sample turfs for local testing. ownerId is synthetic — turf
// list/detail views don't populate owner info. Reviewer names fall back to
// "TurfSpot user".
//
// Usage (from quixent-api root):
//   SEED_LAT=11.3410 SEED_LNG=77.7172 npx ts-node turf-spot-api/src/seed/seedTurfs.ts

const centerLat = Number(process.env.SEED_LAT ?? 11.3410); // Erode, per the POC mocks
const centerLng = Number(process.env.SEED_LNG ?? 77.7172);
const FAKE_OWNER_ID = '000000000000000000000010';

function near(dLat: number, dLng: number) {
  return { lat: centerLat + dLat, lng: centerLng + dLng };
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKEND = ['sat', 'sun'];

const samples = [
  {
    name: 'ABC Football Turf', sports: ['football'], city: 'Erode',
    address: 'Perundurai Rd, Erode', ...near(0.004, 0.003),
    facilities: ['parking', 'washroom', 'changing_room'], basePricePerHour: 800,
    pricingRules: [
      { label: 'Weekday', days: WEEKDAYS, startTime: '06:00', endTime: '18:00', pricePerHour: 700 },
      { label: 'Weekday Peak', days: WEEKDAYS, startTime: '18:00', endTime: '23:00', pricePerHour: 1200 },
      { label: 'Weekend', days: WEEKEND, startTime: '06:00', endTime: '23:00', pricePerHour: 1000 },
    ],
  },
  {
    name: 'Green Arena Cricket', sports: ['cricket'], city: 'Erode',
    address: 'Brough Rd, Erode', ...near(-0.006, 0.005),
    facilities: ['parking', 'washroom', 'floodlights'], basePricePerHour: 1200,
    pricingRules: [
      { label: 'Weekday', days: WEEKDAYS, startTime: '06:00', endTime: '18:00', pricePerHour: 1000 },
      { label: 'Peak', days: [...WEEKDAYS, ...WEEKEND], startTime: '18:00', endTime: '23:00', pricePerHour: 1500 },
    ],
  },
  {
    name: 'SmashPoint Badminton', sports: ['badminton'], city: 'Erode',
    address: 'Sathy Rd, Erode', ...near(0.002, -0.004),
    facilities: ['parking', 'washroom', 'ac'], basePricePerHour: 400,
    pricingRules: [{ label: 'All day', days: [...WEEKDAYS, ...WEEKEND], startTime: '06:00', endTime: '23:00', pricePerHour: 400 }],
  },
];

async function main() {
  await connectTurfSpotDB();
  const { default: Turf } = await import('../models/turf/Turf');

  for (const s of samples) {
    const exists = await Turf.findOne({ name: s.name, ownerId: FAKE_OWNER_ID });
    if (exists) {
      console.log(`[seed] "${s.name}" exists — skipping`);
      continue;
    }
    await Turf.create({
      ownerId: FAKE_OWNER_ID,
      name: s.name,
      sports: s.sports,
      description: `${s.name} — sample seeded turf.`,
      address: s.address,
      city: s.city,
      location: { type: 'Point', coordinates: [s.lng, s.lat] },
      facilities: s.facilities,
      photos: [],
      operatingHours: { open: '06:00', close: '23:00' },
      slotDurationMins: 60,
      basePricePerHour: s.basePricePerHour,
      pricingRules: s.pricingRules,
      status: 'approved',
    });
    console.log(`[seed] created "${s.name}" at ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`);
  }

  console.log(`[seed] done — center ${centerLat}, ${centerLng}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
