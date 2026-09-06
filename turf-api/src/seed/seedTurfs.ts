import 'dotenv/config';
import { connectTurfDB } from '../config/db';

// Seeds sample approved turfs for local testing. ownerId is synthetic — it
// doesn't need to match a real shared-auth account for browse/detail/
// availability screens to work (booking does need a real logged-in user).
//
// Usage (from the quixent-api root):
//   SEED_LAT=12.9716 SEED_LNG=77.5946 SEED_CITY=Bengaluru \
//   npx ts-node turf-api/src/seed/seedTurfs.ts

const centerLat = Number(process.env.SEED_LAT ?? 12.9716);
const centerLng = Number(process.env.SEED_LNG ?? 77.5946);
const city = process.env.SEED_CITY ?? 'Bengaluru';

const FAKE_OWNER_ID = '000000000000000000000010';

function near(latOffset: number, lngOffset: number) {
  return { lat: centerLat + latOffset, lng: centerLng + lngOffset };
}

const samples: any[] = [
  {
    name: 'GreenField Arena',
    description: 'FIFA-standard 5-a-side and 7-a-side artificial turf with floodlights and covered seating.',
    sports: ['football', 'cricket'],
    surface: 'artificial-turf',
    size: '7-a-side',
    amenities: ['parking', 'floodlights', 'changing-room', 'washroom', 'drinking-water', 'seating', 'first-aid'],
    ...near(0.006, 0.004),
    address: '5th Cross, Indiranagar',
    pricePerHour: 1200,
    priceRules: [{ label: 'Peak evening', startHour: 18, endHour: 23, pricePerHour: 1600 }],
    openTime: '06:00',
    closeTime: '23:00',
  },
  {
    name: 'PowerPlay Box Cricket',
    description: 'Enclosed box-cricket turf, perfect for corporate matches and weekend leagues.',
    sports: ['cricket', 'box-cricket'],
    surface: 'artificial-turf',
    size: 'Box',
    amenities: ['parking', 'floodlights', 'washroom', 'drinking-water', 'equipment-rental', 'cafeteria'],
    ...near(-0.008, 0.003),
    address: 'Outer Ring Road, Marathahalli',
    pricePerHour: 900,
    priceRules: [{ label: 'Weekend', days: [0, 6], startHour: 6, endHour: 24, pricePerHour: 1100 }],
    openTime: '05:00',
    closeTime: '24:00',
  },
  {
    name: 'SmashPoint Badminton & Futsal',
    description: 'Indoor synthetic courts with A/C. Badminton, futsal and pickleball.',
    sports: ['badminton', 'futsal', 'pickleball'],
    surface: 'synthetic',
    size: 'Court',
    amenities: ['parking', 'changing-room', 'washroom', 'drinking-water', 'air-conditioning', 'equipment-rental'],
    ...near(0.003, -0.007),
    address: 'HSR Layout, Sector 2',
    pricePerHour: 600,
    openTime: '06:00',
    closeTime: '22:00',
  },
  {
    name: 'Turf 360',
    description: 'Rooftop turf with panoramic city views, ideal for evening football.',
    sports: ['football'],
    surface: 'artificial-turf',
    size: '5-a-side',
    amenities: ['floodlights', 'washroom', 'drinking-water', 'seating'],
    ...near(-0.004, -0.005),
    address: 'Koramangala 4th Block',
    pricePerHour: 1000,
    priceRules: [{ label: 'Peak', startHour: 17, endHour: 23, pricePerHour: 1400 }],
    openTime: '07:00',
    closeTime: '23:00',
    weeklyClosedDays: [1],
  },
];

async function main() {
  await connectTurfDB();
  const { default: Turf } = await import('../models/Turf');

  for (const s of samples) {
    const existing = await Turf.findOne({ name: s.name, ownerId: FAKE_OWNER_ID });
    if (existing) {
      console.log(`[seed] "${s.name}" already exists — skipping`);
      continue;
    }
    await Turf.create({
      ownerId: FAKE_OWNER_ID,
      name: s.name,
      description: s.description,
      sports: s.sports,
      surface: s.surface,
      size: s.size,
      amenities: s.amenities,
      address: s.address,
      city,
      location: { type: 'Point', coordinates: [s.lng, s.lat] },
      photos: [],
      pricePerHour: s.pricePerHour,
      priceRules: s.priceRules ?? [],
      openTime: s.openTime,
      closeTime: s.closeTime,
      slotDurationMinutes: 60,
      weeklyClosedDays: s.weeklyClosedDays ?? [],
      status: 'approved',
      isActive: true,
    });
    console.log(`[seed] created "${s.name}" in ${city} at ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`);
  }

  console.log(`[seed] done — center ${centerLat}, ${centerLng}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
