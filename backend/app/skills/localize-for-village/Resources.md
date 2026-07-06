# Resources: village_context schema and seeded data

## Schema (MongoDB collection `village_context`)
```json
{
  "village_id": "string — groups facts by village",
  "category": "crops | market | geography | festival | daily_life",
  "fact": "one grounded, concrete fact — never a generality"
}
```

## Currently seeded (via `python -m app.seed`)

`village_id = "chintamani_apmc"`:
- **crops** — Farmers here mainly grow tomatoes, mangoes, and ragi (finger millet).
- **market** — The weekly APMC market day is Wednesday; produce is sold by the crate and by weight in kilograms.
- **geography** — The village is near a seasonal lake (kere) used for irrigation during the monsoon.
- **festival** — Ugadi and the local jatre (village fair) are the two biggest yearly community events.
- **daily_life** — Most families keep a few chickens or a milch cow; children often help count eggs or measure milk in litres before school.

## Adding a new village
Insert more `{village_id, category, fact}` documents into `village_context`
(see `app/seed.py` for the pattern) — no code changes needed. The skill and
the underlying agent both read by `village_id` at request time, so a new
village becomes usable immediately after seeding.