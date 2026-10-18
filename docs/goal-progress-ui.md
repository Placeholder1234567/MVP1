# Saved goal progress

Active and stopped goal cards show the past fourteen calendar days of signed/approved note trials saved in the encrypted device cache. Dates use the agency time zone and each note's shift start day. The display is explicitly a saved subset, not an authoritative full report; reconnecting updates it, and Care reports provides the separate server export.

The UI reuses the export domain's weighted trial calculations. Refused and unknown attempted codes remain in the denominator; not-attempted records and their ignored trials are separated. Empty attempted records, unknown codes and unreadable records are visible. Missing days have no percentage rather than a zero. Goal targets or achievement are never inferred, and current wording is not presented as a historical definition snapshot.

Projection joins require the same agency, home, person, goal and note; drafts, returned notes, future days and records outside the fourteen-day window are excluded. The read-only view never submits or edits clinical records. It works offline from the existing cache without new persistence, services or schema changes. Browser tests create a synthetic goal, save a trial draft, sign it explicitly, verify the counts offline and retain progress after stopping the goal.

The card shows the independent share as a progress ring (80% and up green, 50–79% lemon, under 50% red, with the number in the middle), a daily sparkline once two or more days have trials, and a trend arrow comparing this week's independent share with last week's when both weeks have trials. The arrow is green for a rise and red for a fall of more than 5%; it is not a target or achievement judgement.
