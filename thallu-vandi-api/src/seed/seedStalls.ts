import 'dotenv/config';
import { connectThalluVandiDB } from '../config/db';
// Dynamic imports (not static top-level) — model files call thalluVandiDb.model()
// at evaluation time, so they can't load until connectThalluVandiDB() has run.
// Same reason the root index.ts dynamically imports each module's router.

// Seeds sample approved stalls for local testing. vendorId/reviewer userId
// are synthetic — they don't need to match a real shared-auth account, since
// the stall list/detail views don't populate vendor info, and a missing
// reviewer name just falls back to "Anonymous" in the app.
//
// Usage: SEED_LAT=9.8433 SEED_LNG=78.4809 npx ts-node -r tsconfig-paths/register thallu-vandi-api/src/seed/seedStalls.ts
// (run from the quixent-api root)

const centerLat = Number(process.env.SEED_LAT ?? 12.9716);
const centerLng = Number(process.env.SEED_LNG ?? 77.5946);

function near(latOffset: number, lngOffset: number) {
  return { lat: centerLat + latOffset, lng: centerLng + lngOffset };
}

const FAKE_VENDOR_ID = '000000000000000000000001';
const FAKE_CUSTOMER_ID = '000000000000000000000002';

// Same URLs as the mobile app's constants/theme.ts category fallback images
// (Wikimedia Commons, CC-licensed, free for commercial use) — real photos
// instead of leaving `photos: []` and relying on the app's emoji fallback.
const CATEGORY_IMAGE: Record<string, string> = {
  chai: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/GurgaonManMakingChai.jpg/960px-GurgaonManMakingChai.jpg',
  dosa: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Masala_dosa_01.jpg/960px-Masala_dosa_01.jpg',
  chaat: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Pani_Puri-Street_food.jpg/960px-Pani_Puri-Street_food.jpg',
  juice: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sugarcane_Juice_Machine.jpg/960px-Sugarcane_Juice_Machine.jpg',
  snacks: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Samosa_4.jpg/960px-Samosa_4.jpg',
  other: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Indian_street_food_on_wheels.jpg/960px-Indian_street_food_on_wheels.jpg',
};

const sampleStalls = [
  {
    name: 'Ravi Chai Point',
    category: 'chai',
    ...near(0.004, 0.003),
    menuItems: [
      { name: 'Cutting Chai', price: 10 },
      { name: 'Special Masala Chai', price: 15 },
      { name: 'Bun Maska', price: 20 },
    ],
  },
  {
    name: "Amma's Dosa Corner",
    category: 'dosa',
    ...near(-0.006, 0.002),
    menuItems: [
      { name: 'Plain Dosa', price: 40 },
      { name: 'Masala Dosa', price: 60 },
      { name: 'Rava Dosa', price: 70 },
      { name: 'Chutney & Sambar Extra', price: 10 },
    ],
  },
  {
    name: 'Chaska Chaat Wala',
    category: 'chaat',
    ...near(0.002, -0.005),
    menuItems: [
      { name: 'Pani Puri', price: 30 },
      { name: 'Bhel Puri', price: 40 },
      { name: 'Sev Puri', price: 40 },
    ],
  },
  {
    name: 'Fresh Squeeze Juice Corner',
    category: 'juice',
    ...near(-0.003, -0.004),
    menuItems: [
      { name: 'Orange Juice', price: 40 },
      { name: 'Sugarcane Juice', price: 30 },
      { name: 'Mixed Fruit Juice', price: 50 },
    ],
  },
  {
    name: 'Midnight Momo Stall',
    category: 'snacks',
    ...near(0.007, -0.001),
    menuItems: [
      { name: 'Veg Momo (8pc)', price: 60 },
      { name: 'Chicken Momo (8pc)', price: 90 },
      { name: 'Fried Momo', price: 80 },
    ],
  },
  {
    name: "Bhai's Bhaji Pav",
    category: 'snacks',
    ...near(-0.001, 0.006),
    menuItems: [
      { name: 'Pav Bhaji', price: 70 },
      { name: 'Cheese Pav Bhaji', price: 90 },
    ],
  },
];

async function main() {
  await connectThalluVandiDB();

  const { default: Stall } = await import('../models/Stall');
  const { default: Review } = await import('../models/Review');

  for (const sample of sampleStalls) {
    const existing = await Stall.findOne({ name: sample.name, vendorId: FAKE_VENDOR_ID });
    if (existing) {
      console.log(`[seed] "${sample.name}" already exists — skipping`);
      continue;
    }

    const stall = await Stall.create({
      vendorId: FAKE_VENDOR_ID,
      name: sample.name,
      category: sample.category,
      location: { type: 'Point', coordinates: [sample.lng, sample.lat] },
      photos: [CATEGORY_IMAGE[sample.category] ?? CATEGORY_IMAGE.other],
      menuItems: sample.menuItems,
      status: 'approved',
    });

    if (['Ravi Chai Point', "Amma's Dosa Corner"].includes(sample.name)) {
      await Review.create({
        stallId: stall._id,
        userId: FAKE_CUSTOMER_ID,
        rating: 5,
        text: 'Great taste, quick service!',
      });
      await Stall.findByIdAndUpdate(stall._id, { ratingAvg: 5, ratingCount: 1 });
    }

    console.log(`[seed] created "${sample.name}" (${sample.category}) at ${sample.lat.toFixed(4)}, ${sample.lng.toFixed(4)}`);
  }

  console.log(`[seed] done — center point was ${centerLat}, ${centerLng}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
