# Weight Training Tracker

A multi-user, invite-gated weight-training log. This glossary pins down the project-specific
vocabulary; general programming terms are intentionally omitted.

## Language

### Identity & access

**Profile**:
A user's app-level identity row (`profiles`), keyed to their auth user. Holds the login `username`,
their `referral_code`, and who `referred_by` them.
_Avoid_: Account (ambiguous with the auth user).

**Username**:
The login handle (lowercased, unique). The app never logs in by email.
_Avoid_: Handle, login.

### Invites

**Referral code**:
A user's permanent, personal 8-char code (`profiles.referral_code`, `not null unique`). One per user,
**multi-use**, no expiry. It gates signup: a new account must present a valid referral code.
_Avoid_: Invite code (the retired single-use concept), promo code, token.

**Invite link**:
The shareable artifact wrapping a referral code: `/signup?invite=<referral_code>`. Opening it prefills
and locks the signup form's code field.
_Avoid_: Signup link, referral URL.

**Regenerate**:
Replacing a user's referral code with a fresh one, which immediately invalidates the previous code and
any invite links built from it. The safety valve for a leaked link.
_Avoid_: Reset, rotate, refresh.

**Referred by**:
The user whose referral code a new account signed up with (`profiles.referred_by`). Null for accounts
that predate referral tracking (e.g. a bootstrapped first account).
_Avoid_: Inviter (use only informally), sponsor, parent.
