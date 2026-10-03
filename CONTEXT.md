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
A display handle auto-derived from the email local-part at sign-in (lowercased, unique; a numeric
suffix is added on collision). Shown in the top bar / Profile. **Not** a login credential — login is
Google only.
_Avoid_: Handle, login (it is no longer the login identity).

**Isolation**:
Per-user data separation enforced in the **service layer** — every query filters by `user_id` (RLS is
disabled). Cross-user isolation tests guard each service.
_Avoid_: RLS (removed), row-level security.

### Referral code (vestigial)

**Referral code**:
A user's permanent, personal 8-char code (`profiles.referral_code`, `not null unique`). One per user.
Signup is open, so it **no longer gates anything** — it's a personal code surfaced on the Profile page
that can be regenerated. Kept because the column is `not null unique` and cheap to keep.
_Avoid_: Invite code (retired), promo code, token.

**Regenerate**:
Replacing a user's referral code with a fresh one.
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
