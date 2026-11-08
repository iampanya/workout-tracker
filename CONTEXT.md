# Weight Training Tracker

A multi-user weight-training log with **Google sign-in** (open — anyone with a Google account can
join). This glossary pins down the project-specific vocabulary; general programming terms are
intentionally omitted.

## Language

### Identity & access

**User**:
The auth identity row (`public.users`), created by Auth.js on first Google sign-in and linked to a
Google `Account`. Keyed by UUID; every data table's `user_id` references it.
_Avoid_: Auth user (legacy GoTrue term), account (ambiguous with the OAuth `accounts` row).

**Profile**:
A user's app-level row (`profiles`, keyed to `users.id`), provisioned automatically by the
`on_public_user_created` trigger on first sign-in. Holds a display `username`, a `referral_code`, and
`referred_by`.
_Avoid_: Account.

**Username**:
A display handle auto-derived from the email local-part at sign-in (sanitized to `[a-z0-9_]`,
lowercased, unique; on collision `_` + a widening slice of the user's uuid is appended, e.g.
`john_a1b`). Shown in the top bar / Profile. **Not** a login credential — login is
Google only.
_Avoid_: Handle, login (it is no longer the login identity).

**Isolation**:
Per-user data separation enforced in the **service layer** — every query filters by `user_id` (RLS is
disabled). Cross-user isolation tests guard each service.
_Avoid_: RLS (removed), row-level security.

### Referral code (vestigial)

**Referral code**:
A user's permanent, personal 8-char code (`profiles.referral_code`, `not null unique`). One per user.
Signup is open, so it **no longer gates anything**, and the UI no longer shows it (the Profile "Invite
friends" card just shares the landing page). Kept because the column is `not null unique` and cheap to
keep.
_Avoid_: Invite code (retired), promo code, token.

**Regenerate**:
Replacing a user's referral code with a fresh one. Exists only in the service layer — no UI calls it.
_Avoid_: Reset, rotate, refresh.

**Referred by**:
`profiles.referred_by` — retained column, but null for accounts created via Google sign-in (there is no
signup-time referral capture anymore).
_Avoid_: Inviter, sponsor, parent.

### Training

**Working set**:
Any logged set that is not a warmup. Only working sets count toward PRs, volume, set counts, and set
numbers.
_Avoid_: Real set, main set.

**Warmup set**:
A set flagged as a warmup. Shown as `W`; it has no set number and is excluded from PRs, volume, and
set counts (it may appear alongside them, e.g. "2 sets + 2W").
_Avoid_: Prep set.

**Set number**:
A working set's position among that exercise's working sets within one workout, in logged order
(1, 2, 3…). Warmups and deleted sets never leave a gap — e.g. `W, W, 1, 2, W, 3`. Not the stored
sequence.
_Avoid_: Set index.

**PR (personal record)**:
For an exercise, the heaviest working-set weight ever logged, together with the most reps done at that
weight — written `100 kg × 6`. A **new PR** is heavier, or the same weight for more reps; an exact tie
is not new.
_Avoid_: Max, best (ambiguous with top set / e1RM).

**Top set**:
The best working set within one workout, by the same rule as a PR (heaviest, then most reps). A top set
is per workout; a PR is all-time.
_Avoid_: Best set.

**Muscle group**:
The fixed body-area label on an exercise: Chest, Back, Legs, Shoulders, Arms, Core. Optional — an
exercise without one is listed under "Other". Each group has its own color across the UI.
_Avoid_: Body part, category.

**Recent exercises**:
The exercises a user did most recently in **completed** workouts, newest first (in-progress workouts
and archived exercises don't count). Shown at the top of the exercise picker.
_Avoid_: History (that's the list of workouts), favorites.

**Rep range**:
The target reps for an exercise in a routine (`routine_exercises.target_reps_min/max`, set together). Without one — or outside a routine — the default is 8–12.

**Next target**:
The weight × reps suggested for an exercise's next session (`nextTarget`, `lib/insights/progression.ts`): add a rep until every top set reaches the top of the rep range, then add weight by the exercise's **Weight step** and restart at the bottom; two stalled sessions below the range at the same weight drop the weight one step.

**Weight step**:
How much an exercise's next target adds or removes when it changes weight. The user's custom value for that exercise (`exercise_settings`), else the most common gap between the top working weights of their completed sessions for it (accepted only if the gap occurs at least twice and is at most 10 kg), else the muscle-group default (Legs +5, Chest/Back +2.5, others +1.25 kg). Separate from the +/− stepper on the weight field, which always moves 2.5 kg.

**Plateau**:
An exercise whose best estimated 1RM of its last 3 sessions is between 0% and −5% of its best before them (needs 4+ sessions in the 8-week window). Above 0% is progressing, −5% or lower is declining.

**Deload signal**:
Shown on `/insights` when 2+ scored exercises are declining and they are at least 40% of those scored.

### Body composition

**Body scan**:
One body-composition measurement at a moment in time (`body_scans`, unique per user + `measured_at`):
weight plus optional metrics such as body fat %, skeletal muscle and visceral fat.
_Avoid_: Weigh-in (a scan is more than weight), reading.

**Imported scan**:
A scan from an arboleaf smart-scale PDF, converted to JSON by Claude Code and imported on `/body`. Carries
per-segment values and the scale's report. Corrected by re-importing (same `measured_at` replaces it),
not edited.
_Avoid_: Synced scan (there is no device sync).

**Manual scan**:
A scan typed in by hand on `/body` (`source = "manual"`). Weight is required; fat mass is derived from
weight × fat %. The only kind of scan that can be edited.
_Avoid_: Custom scan.

**Body goal**:
A target for one body metric (`body_goals`, at most one fat goal), remembering the value it started from.
_Avoid_: Target weight (a goal may be a fat %, not weight).
