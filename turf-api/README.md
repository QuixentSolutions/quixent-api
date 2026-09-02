# TurfSpot module (`/turf`)

Turf-booking sub-module of `quixent-api`. Turf owners register venues, a
superadmin approves the listings, and players browse approved turfs and book
hourly slots.
Payments are **out of scope for now** — every booking is `unpaid` / pay-at-venue.

Same architecture as `thallu-vandi-api`: one Express `Router` exported from
`index.ts`, its own logical Mongo database (`turf`) on the shared Atlas cluster,
and its own Azure Blob container (`turf`).

## Mount

`index.ts` (repo root) connects `connectTurfDB()` and mounts the router at
`/turf`.

## Data model (`src/models`)

| Model | Purpose |
|---|---|
| `Turf` | Owner's venue: sports, surface, amenities, address + geo point, photos, `pricePerHour` + optional `priceRules`, operating hours, `slotDurationMinutes`, `weeklyClosedDays`, `status` (pending/approved/rejected), rating. |
| `Booking` | A player's reservation of one or more consecutive base slots on a date. `status` = pending/confirmed/cancelled/completed/no_show. Partial unique index on `(turfId, date, startTime)` for live bookings prevents double-booking. |
| `Review` | One per user per turf, gated on having a booking there. Recomputes `Turf.ratingAvg/Count`. |
| `BlockedSlot` | Owner-declared unavailable window (maintenance / private event); treated like a booking in availability math. |

## Routes

### Public — `/turf/turfs`
| Method | Path | Description |
|---|---|---|
| GET | `/turfs` | Browse approved+active turfs. Query: `city, sport, q, lat, lng, radiusKm, minPrice, maxPrice, sort, page, limit`. |
| GET | `/turfs/cities` | Distinct cities with live turfs. |
| GET | `/turfs/:id` | Approved turf detail. |
| GET | `/turfs/:id/availability?date=YYYY-MM-DD` | Slot grid for a day with `available` + `reason` + per-slot `price`. |
| GET | `/turfs/:id/reviews` | Reviews (with reviewer name). |
| POST | `/turfs/:id/reviews` | Auth. Upsert a review (must have a booking at this turf). |

### Bookings — `/turf/bookings` (auth)
| Method | Path | Description |
|---|---|---|
| POST | `/bookings` | `{ turfId, date, startTime, slotCount?, sport?, playerCount?, notes? }` → confirmed booking. |
| GET | `/bookings/mine?scope=upcoming\|past\|all&status=` | Player's bookings, each decorated with its `turf`. |
| GET | `/bookings/:id` | One of the player's bookings. |
| PATCH | `/bookings/:id/cancel` | `{ reason? }`. Blocked within `TURFSPOT_CANCEL_CUTOFF_HOURS` of the slot. |

### Owner — `/turf/owner` (auth; ownership-based, no role)
| Method | Path | Description |
|---|---|---|
| GET | `/owner/stats` | Dashboard totals. |
| GET/POST | `/owner/turfs` | List / create (created `pending`). |
| GET/PATCH/DELETE | `/owner/turfs/:id` | Manage one turf. Material edits to a live turf reset it to `pending`. Delete blocked while upcoming bookings exist. |
| GET | `/owner/bookings?turfId=&date=&scope=&status=` | Bookings across the owner's turfs, decorated with player name/mobile. |
| PATCH | `/owner/bookings/:id/confirm` \| `/cancel` \| `/no-show` | Manage a booking. |
| GET/POST | `/owner/turfs/:id/blocks` | List / create blocked slots. |
| DELETE | `/owner/blocks/:id` | Remove a blocked slot. |

### Admin — `/turf/admin` (auth + `TURFSPOT_SUPERADMIN_PHONES`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Platform totals. |
| GET | `/admin/turfs?status=` / `/admin/turfs/pending` | Moderation queues. |
| PATCH | `/admin/turfs/:id/approve` | Publish a listing. |
| PATCH | `/admin/turfs/:id/reject` | `{ reason }`. |

### Uploads — `/turf/uploads` (auth)
`POST /uploads/image` (multipart, `folder` = `turf-photos` \| `review-photos`)
and `POST /uploads/image-base64`.

### Internal
`DELETE /turf/user-data` (`x-internal-secret`) — cascade cleanup, called by the
auth service on account deletion.

## Env

See `.env.example`. Keys live in the shared root `.env`.

## Seed

```bash
SEED_LAT=12.9716 SEED_LNG=77.5946 SEED_CITY=Bengaluru npx ts-node turf-api/src/seed/seedTurfs.ts
```
