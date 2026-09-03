// Source of truth for stall categories, served to clients via GET /stalls/categories.
// The Stall schema itself stores `categories` as free-form strings (no enum) —
// this list exists so the mobile app doesn't hardcode it and require a full
// rebuild/release every time it changes.
export const CATEGORIES = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Masala_dosa_01.jpg/960px-Masala_dosa_01.jpg',
  },
  {
    key: 'lunch',
    label: 'Lunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Pani_Puri-Street_food.jpg/960px-Pani_Puri-Street_food.jpg',
  },
  {
    key: 'dinner',
    label: 'Dinner',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Indian_street_food_on_wheels.jpg/960px-Indian_street_food_on_wheels.jpg',
  },
  {
    key: 'snacks',
    label: 'Snacks',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Samosa_4.jpg/960px-Samosa_4.jpg',
  },
  {
    key: 'beverages',
    label: 'Beverages',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/GurgaonManMakingChai.jpg/960px-GurgaonManMakingChai.jpg',
  },
  {
    key: 'other',
    label: 'Other',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sugarcane_Juice_Machine.jpg/960px-Sugarcane_Juice_Machine.jpg',
  },
];
