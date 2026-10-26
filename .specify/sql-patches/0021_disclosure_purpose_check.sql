-- Disclosures may only carry a purpose the accounting knows how to describe
-- (domain/disclosure.ts DISCLOSURE_PURPOSES; the disclosure integration test
-- checks the two lists match). Anything else would be listed as "other".

ALTER TABLE public.disclosures DROP CONSTRAINT IF EXISTS disclosures_purpose_check;
ALTER TABLE public.disclosures ADD CONSTRAINT disclosures_purpose_check CHECK (purpose IN (
  'abuse_report', 'state_incident_report', 'health_oversight', 'court', 'law_enforcement',
  'coroner', 'public_health', 'serious_threat', 'research', 'other_required'
));
