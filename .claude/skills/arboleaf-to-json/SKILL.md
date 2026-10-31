---
name: arboleaf-to-json
description: Convert an arboleaf body-composition PDF export into the workout tracker's body-scan import JSON (version 1). Use when the user shares an arboleaf PDF or asks to import a scale scan into the Body page.
---

# arboleaf PDF → body-scan import JSON

arboleaf exports one **image-only** PDF per measurement (no text layer — read it with the Read tool,
which renders the pages as images). Two layouts exist (2-page and 3-page); both carry the same values.
`lib/body/schema.ts` is the source of truth for the format — re-read it if anything here disagrees.

If the PDF is under `~/Downloads`, Read may fail with `EPERM` (macOS privacy). Ask the user to copy it
into the repo root (`*.pdf` is gitignored).

## Output

Write `body-scans/<YYYY-MM-DD-HHmm>.json` (gitignored — never commit it, never `git add -f`). Several
scans can go in one file. Then tell the user to open **ร่างกาย / Body → Import scan** and choose the file
(or paste its contents); the page validates and previews before saving. Re-importing the same scan
time replaces the saved one, so fixing a misread value is just "edit the JSON, import again".

```json
{ "version": 1, "source": "arboleaf", "scans": [ { …scan… } ] }
```

## Rules

- `measured_at`: the report's "Time" is `DD/MM/YYYY HH:mm` Bangkok local →
  `"YYYY-MM-DDTHH:mm:00+07:00"`. Never write a time without the offset.
- Numbers only — strip `kg`, `%`, `L`, `kcal`. Omit anything the report doesn't show; never estimate.
- Read every number twice against the image before writing; the values are small and easy to misread.
- Verdicts and labels stay in the report's own English (they're shown verbatim).

## Field mapping

| JSON key | Report label |
|---|---|
| `weight_kg` | Weight (kg) |
| `bmi` | BMI |
| `body_fat_pct` | PBF / Body Fat Percentage |
| `body_fat_kg` | Body Fat Mass |
| `skeletal_muscle_kg` | Skeletal Muscle (kg) |
| `skeletal_muscle_pct` | Skeletal Muscle (%) |
| `muscle_mass_pct` | Muscle Mass Percentage |
| `soft_lean_mass_kg` | Soft Lean Mass |
| `fat_free_mass_kg` | Fat Free Mass / LBM |
| `body_water_l` | Body Water (L) |
| `body_water_pct` | Body Water Percentage |
| `protein_kg` | Protein (kg) |
| `protein_pct` | Protein Percentage |
| `bone_mass_kg` | Bone Mass (kg) |
| `bone_mass_pct` | Bone Mass Percentage |
| `visceral_fat` | Visceral Fat |
| `subcutaneous_fat_pct` | Subcutaneous Fat Percentage |
| `subcutaneous_fat_kg` | Subcutaneous Fat (kg) |
| `bmr_kcal` | BMR |
| `smi` | SMI |
| `waist_hip_ratio` | Waist-Hip Ratio |
| `fitness_score` | Fitness score (the number out of 100) |
| `height_cm`, `age` | Header: Height, Age |

`segments` — keys `left_arm`, `right_arm`, `trunk`, `left_leg`, `right_leg` (the figure's L/R labels;
the trunk is the middle callout):
- "Muscle Balance" callout `3.1kg / 94.4% Sufficient` → `lean_kg: 3.1, lean_pct: 94.4, lean_eval: "Sufficient"`
- "Segmental Fat Analysis" callout `0.89kg / 141.8% Sufficient` → `fat_kg`, `fat_pct`, `fat_eval`
- "Balanced muscle mass ratio" % → `muscle_ratio_pct`; "Segmental fat percentage analysis" % → `fat_ratio_pct`

`report`:
- `ranges`: each "Normal Range" as `[min, max]` under the metric's JSON key; open ends are `null`
  (`<=0.9` → `[null, 0.9]`).
- `evaluations`: verdicts that belong to one metric, under its JSON key — Nutrition Evaluation (Body
  Water → `body_water_l`, Protein → `protein_kg`, Body Fat Mass → `body_fat_kg`, Bone Mass →
  `bone_mass_kg`) and Fat Analysis (BMI → `bmi`, PBF → `body_fat_pct`). Use the checked box's text.
- `assessments`: the other checklist rows, labelled as in the report: `"Upper extremity balance"`,
  `"Lower extremity balance"`, `"Upper and lower extremities balance"`, `"Upper extremity strength"`,
  `"Lower extremity strength"`, `"Muscle strength"` → the checked box's text.
- `weight_control`: Normal weight → `normal_weight_kg`; Weight Control → `weight_kg`; Fat mass control →
  `fat_kg`; Muscle control → `muscle_kg` (keep the sign).
- `advice`: the "Analysis and Advice" paragraph.

## Example (synthetic numbers)

```json
{
  "version": 1,
  "source": "arboleaf",
  "scans": [
    {
      "measured_at": "2026-10-18T09:58:00+07:00",
      "weight_kg": 80, "bmi": 24.7, "body_fat_pct": 22, "body_fat_kg": 17.6,
      "skeletal_muscle_kg": 35, "skeletal_muscle_pct": 43.8, "muscle_mass_pct": 72.5,
      "soft_lean_mass_kg": 58, "fat_free_mass_kg": 62.4, "body_water_l": 45.5, "body_water_pct": 56.9,
      "protein_kg": 12.4, "protein_pct": 15.5, "bone_mass_kg": 4, "bone_mass_pct": 5,
      "visceral_fat": 8, "subcutaneous_fat_pct": 19.5, "subcutaneous_fat_kg": 15.6, "bmr_kcal": 1720,
      "smi": 8.4, "waist_hip_ratio": 0.9, "fitness_score": 72, "height_cm": 180, "age": 35,
      "segments": {
        "left_arm": { "lean_kg": 3.4, "lean_pct": 98, "lean_eval": "Sufficient", "fat_kg": 0.9, "fat_pct": 140, "fat_eval": "Sufficient", "muscle_ratio_pct": 4.3, "fat_ratio_pct": 1.1 },
        "right_arm": { "lean_kg": 3.6, "lean_pct": 101, "lean_eval": "Sufficient", "fat_kg": 0.9, "fat_pct": 140, "fat_eval": "Sufficient", "muscle_ratio_pct": 4.5, "fat_ratio_pct": 1.1 },
        "trunk": { "lean_kg": 28, "lean_pct": 99, "lean_eval": "Sufficient", "fat_kg": 9, "fat_pct": 200, "fat_eval": "Over", "muscle_ratio_pct": 35, "fat_ratio_pct": 11.3 },
        "left_leg": { "lean_kg": 10, "lean_pct": 103, "lean_eval": "Sufficient", "fat_kg": 2.7, "fat_pct": 145, "fat_eval": "Sufficient", "muscle_ratio_pct": 12.5, "fat_ratio_pct": 3.4 },
        "right_leg": { "lean_kg": 10.4, "lean_pct": 104, "lean_eval": "Sufficient", "fat_kg": 2.7, "fat_pct": 145, "fat_eval": "Sufficient", "muscle_ratio_pct": 13, "fat_ratio_pct": 3.4 }
      },
      "report": {
        "ranges": { "weight_kg": [60, 81], "body_fat_pct": [10, 20], "waist_hip_ratio": [null, 0.9] },
        "evaluations": { "body_fat_pct": "Mild obesity", "bmi": "Normal" },
        "assessments": { "Lower extremity balance": "Slightly uneven" },
        "weight_control": { "normal_weight_kg": 74, "weight_kg": -6, "fat_kg": -7, "muscle_kg": 1 },
        "advice": "Combine strength training with cardio."
      }
    }
  ]
}
```
