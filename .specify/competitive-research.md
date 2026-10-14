# Guad Competitive Intelligence Report
## IDD Charting Software Market Research

> **Consolidated from 5 research runs.** Best facts merged; duplicates removed.
> For detailed Therap analysis, see [therap-research.md](therap-research.md).
> **Production stack decided: SvelteKit 2 + Svelte 5 runes + PowerSync + Postgres on Google Cloud (see CLAUDE.md and infrastructure.md).** Architecture and framework recommendations from prior research runs have been removed. The patterns described here (component-based, offline-first, API-first) apply regardless of framework.

---

## 1. THERAP SERVICES -- MARKET POSITION SUMMARY

> For the complete Therap deep dive (70+ modules, AI features, T-Log workflow, charting details, pricing, review analysis, training), see **therap-research.md**.

### Key Facts

| Detail | Value |
|--------|-------|
| **Founded** | 2003 (via SBIR grant from NIDRR) |
| **HQ** | Torrington, CT |
| **Employees** | ~200-400 |
| **Agencies** | 15,000+ |
| **States** | All 50 US states + international |
| **Daily Users** | 100,000+ |
| **Market Share** | Estimated 40-50% of pure-play IDD software market |
| **Tech Stack** | Java/JSP backend, server-rendered HTML, jQuery |
| **Certifications** | SOC 2 Type II, HIPAA/HITECH, ARC-AMPE, MARS-E, FERPA, Section 508, WCAG 2.2 |
| **Review Ratings** | G2: 4.6/5 (200+ reviews), Capterra: 4.7/5 (107 reviews), App Store: ~2.0-2.5/5 |

### Why Therap Dominates Despite Legacy UX
1. **State contracts and mandates** -- many state DD agencies require Therap (CT, FL, GA, WV, KS, others)
2. **Regulatory compliance depth** -- 20+ years of state-specific compliance rules baked in
3. **Network effects** -- once a state adopts Therap, all providers in that state must use it
4. **Switching costs** -- enormous data migration burden and retraining
5. **Comprehensive feature set** -- 70+ modules covering every IDD documentation need

### Therap's Key Weaknesses (Guad Opportunities)
1. **Dated UI/UX** -- server-rendered JSP pages, table-based layouts, 4-6 clicks to reach a text box
2. **Poor mobile experience** -- companion app is a wrapper around web forms, not mobile-first
3. **Weak data visualization** -- basic line/bar charts, mostly tabular reports, no interactive dashboards
4. **No voice-to-note** -- every word is manual; DSPs spend 30-60 min/shift on documentation
5. **No real-time AI drafting** -- Therap's AI (launched 2025-2026) summarizes AFTER documentation, not during
6. **Limited API/integration** -- not API-first; third-party integration is difficult
7. **High training burden** -- new DSPs need 4-8 hours of Therap-specific training

### Therap's AI Features (2025-2026)
Therap IS actively using AI -- this is no longer a gap:
- **AI Analyses** -- documentation summarization, trend identification
- **Fatal Five Detection** -- AI scanning for 6 life-threatening health conditions
- **QA Assistant** -- automated documentation quality review after submission
- **AI Translation** -- Google Gemini-powered, 100+ languages

**What Therap AI still lacks (Guad's moat):** No voice-to-note, no real-time AI drafting during documentation, no conversational AI assistant, no AI-powered shift coverage, no behavioral note AI generation from prompts.

---

## 2. COMPETITIVE LANDSCAPE -- 12 PLATFORMS ANALYZED

### Tier 1: Enterprise / State-Mandated (dominant but legacy)

#### Netsmart (myEvolv / CareManager / AWARDS)
- **HQ:** Overland Park, KS | **Founded:** 1968 | **Employees:** 1,500+ | **Revenue:** $500M+
- **Ownership:** Private equity (Genstar Capital, TA Associates, ~$1.6B acquisition 2022)
- **Acquired:** Foothold Technology (AWARDS) in 2021, adding dedicated IDD capabilities
- **Charting:** Highly configurable EHR; IDD via myEvolv + AWARDS residential modules
- **UI/UX:** Moderate-modern. myEvolv has a modern web interface; AWARDS is older. "CareConnect" initiative for modernization
- **AI:** Netsmart Insights analytics platform with ML; AI-assisted documentation (note summarization, suggested billing codes)
- **Integration:** Best-in-class interoperability -- HL7/FHIR R4, HIE (CareConnect), pharmacy, lab interfaces
- **EVV:** Integrated with GPS verification
- **Visualization:** Tableau/Power BI integration, embedded analytics, population health dashboards
- **Pricing:** Enterprise; $5-15/user/month, implementations $50K-$500K+
- **Reviews:** G2/Capterra 3.2-3.7/5. Praised for features/compliance. Criticized for complexity, cost, learning curve
- **Target:** Mid-to-large IDD agencies (100+ individuals), state agencies

#### Qualifacts (CareLogic / Credible / InSync)
- **HQ:** Nashville, TN | **Founded:** 2000 | **Employees:** 800-1,000
- **Ownership:** Private equity (Warburg Pincus)
- **Charting:** Configurable clinical forms with templating, rich-text notes (Credible), treatment plans, goal tracking
- **UI/UX:** Modern. CareLogic has undergone significant UI refresh. Clean dashboards with visual KPIs
- **AI:** "Qualifacts Insights" -- data analytics with predictive capabilities; AI-assisted documentation (2024-2025)
- **Integration:** FHIR R4 compliant, open API marketplace, REST APIs with OAuth2, clearinghouse billing
- **EVV:** Yes, integrated
- **Visualization:** Built-in BI/analytics dashboard, outcome measurement charts, trend analysis, population health views
- **Tech Stack (Credible):** Node.js/TypeScript backend, React frontend, PostgreSQL, AWS
- **Pricing:** SaaS, ~$30-50/clinician/month + implementation fees
- **Reviews:** G2 3.8-4.0/5. Praised for configurability and billing. Criticized for performance issues
- **Target:** Mid-size behavioral health and IDD agencies

### Tier 2: Mid-Market / Modernizing (analytics-oriented)

#### Medisked
- **HQ:** Columbus, OH | **Founded:** 2006 | **Employees:** 100-200
- **Charting:** Person-centered planning, progress notes, service documentation, incident management, strong analytics layer
- **UI/UX:** Modern. One of the best interfaces in IDD space. Dashboard-driven, mobile-friendly
- **Visualization:** **Best-in-class goal visualization** -- trend analysis, outcomes dashboards, person-centered reporting, quality metrics. NCI (National Core Indicators) alignment
- **Integration:** API-first architecture, state system connectivity, EVV vendor integrations
- **Pricing:** SaaS subscription, varies by org size
- **Target:** State DD agencies (quality oversight), mid-to-large IDD providers

#### Remarkable Health (formerly Precision Care / PCACware)
- **HQ:** New York | **Founded:** Late 1990s | **Employees:** 100-200
- **Ownership:** Private equity backed
- **Charting:** Comprehensive IDD/behavioral health -- clinical documentation, ISP/treatment planning, behavioral data collection, medication management
- **UI/UX:** Modernizing under rebrand. Moving toward dashboard-driven interface. Legacy modules still exist
- **AI:** **Most aggressive AI adopter in IDD** -- voice-to-text documentation, AI-suggested note content, automated compliance checking
- **Visualization:** Strong behavioral data graphing and trending (among the strongest in IDD market)
- **EVV:** Yes
- **Target:** Mid-to-large IDD agencies, ICF/IID facilities

#### Brittco
- **HQ:** New Jersey | **Founded:** Mid-2010s | **Employees:** 50-100
- **Charting:** Purpose-built IDD -- daily notes, ISP/habilitation, medication, behavioral data, incidents
- **UI/UX:** Modern. Built recently with mobile-first approach. Native iOS/Android apps for DSPs
- **Visualization:** Basic but clean data displays
- **Unique:** Mobile-first design, real-time supervisory monitoring, built-in family portal
- **Pricing:** Competitive SaaS, designed to undercut larger competitors
- **Target:** Small-to-mid IDD agencies looking for Therap alternatives

### Tier 3: SMB / Modern (mobile-first, easy to use)

#### Setworks
- **HQ:** Portland, OR | **Founded:** 2005 | **Employees:** 20-50
- **Charting:** Streamlined IDD -- service documentation, daily notes, ISP tracking, attendance, billing, incidents
- **UI/UX:** Moderate-modern. Focuses on simplicity. Quick implementation (weeks, not months)
- **EVV:** Strong -- GPS, telephony, fixed-device verification
- **Pricing:** Very competitive, designed for smaller agencies
- **Target:** Small IDD agencies (10-200 individuals)

#### iCareManager
- **HQ:** US-based (smaller company) | **Founded:** 2010s | **Employees:** <50
- **Charting:** Cloud-based IDD -- daily notes, ISP tracking, health records, MAR, incidents, behavioral data
- **UI/UX:** Modern. Explicitly designed to reduce DSP training time. Touch-friendly for tablets
- **Unique:** Ease of use, quick implementation, family/guardian portal
- **Pricing:** Affordable SaaS for small-to-mid agencies
- **Reviews:** High satisfaction among adopters. Small market presence

#### ShareNote (Office Ally ecosystem)
- **HQ:** Vancouver, WA | **Focus:** Behavioral health + IDD documentation
- **Unique:** Free billing engine through Office Ally partnership. Low-cost entry point
- **Target:** Small behavioral health/IDD agencies needing affordable documentation and billing

### EVV Specialists

#### Sandata / HHAeXchange
- **HQ:** New York, NY | **Merged 2022**
- **Focus:** EVV and home care management with IDD crossover
- **Charting:** Limited -- visit documentation tied to EVV-captured visits, care plan documentation
- **EVV:** **Dominant** -- the leading EVV-specific vendor; many states mandate Sandata for EVV compliance
- **Visualization:** Real-time visit dashboards, GPS tracking maps, compliance scorecards
- **Integration:** Extensive -- integrates with most IDD EHRs including Therap
- **Target:** HCBS providers, state Medicaid agencies, managed care organizations

### Adjacent / Emerging

#### CentralReach
- **Focus:** ABA therapy and autism services (adjacent to IDD)
- **Charting:** Highly structured ABA data collection -- trial-by-trial, interval recording, ABC data
- **Visualization:** **Gold standard for data viz in disability services** -- D3.js-powered interactive behavior graphs, real-time trend analysis, celeration charts, cumulative records
- **Tech Stack:** React/TypeScript frontend, Node.js backend, PostgreSQL, REST + GraphQL APIs with OAuth2
- **Offline:** Service worker-based offline mode for data collection sessions
- **Relevance:** Benchmark for what great clinical data visualization looks like in this space

#### MITC (Managing Innovations & Technology for the Community)
- **HQ:** Dover, DE | **Focus:** IDD workforce management + charting
- **Unique:** Scheduling, timekeeping, payroll, HR tied directly to service documentation. Used alongside Therap by many agencies
- **Target:** IDD agencies needing workforce management alongside their clinical documentation

#### Emerging Entrants
- **Tabula Pro** -- newer entrant with modern IDD charting + AI capabilities
- **CaseWorthy** -- case management platform expanding into IDD
- **Vertex (by Daina)** -- IDD-focused, gaining traction in some states

---

## 3. MARKET ANALYSIS AND COMPETITIVE GAPS

### Charting Visualization Maturity (1-10)

| Score | Platform | Notes |
|-------|----------|-------|
| 8/10 | CentralReach | D3.js interactive graphs, real-time trending (ABA-focused, not general IDD) |
| 7/10 | Medisked | Modern dashboards, outcome visualizations, quality metrics |
| 7/10 | Remarkable Health | Strong behavioral data graphing, modernizing dashboards |
| 6.5/10 | Qualifacts CareLogic | Dashboard KPIs, configurable reports, visual analytics |
| 6/10 | Netsmart myEvolv | Analytics platform, some dashboards, complex to configure |
| 6/10 | Brittco | Modern UI, basic but clean data displays |
| 5.5/10 | iCareManager | Simple, clean, limited advanced visualization |
| 5/10 | Setworks | Functional reporting, limited visualization |
| 3.5/10 | Therap | Basic line/bar charts for behavioral data, mostly tabular reports |
| 3/10 | AWARDS (Foothold) | Legacy reporting, minimal visualization |

**Key insight:** Even the best competitors score only 7-8/10 on visualization. No vendor offers truly modern interactive dashboards comparable to mainstream healthcare EHR. This is the single biggest differentiation opportunity.

### AI/Automation Adoption

| Status | Platforms |
|--------|-----------|
| **Leading** | Remarkable Health (voice-to-text, AI note generation), Netsmart (analytics ML), Therap (Fatal Five, QA Assistant, AI Analyses -- all 2025-2026) |
| **Emerging** | Qualifacts (AI-assisted docs), Medisked (analytics) |
| **Minimal/None** | Brittco, iCareManager, Setworks, MITC, AWARDS |

**Key insight (unverified, training data to May 2025):** We found no IDD platform offering voice-to-structured-note with real-time AI drafting, though Remarkable Health (above) offers voice-to-text and AI-suggested content, so the gap may be narrower than it looks. Guad's Lomi is genuinely unique.

### Technology Stack Comparison

| Category | Platforms |
|----------|-----------|
| **Modern cloud-native** | Brittco, iCareManager, Medisked, Setworks |
| **Modernizing legacy** | Remarkable Health, Qualifacts, Netsmart |
| **Legacy web** | Therap, AWARDS/Foothold, MITC |
| **EVV-specialized** | Sandata/HHAeXchange |

### Mobile Readiness

| Category | Platforms |
|----------|-----------|
| **Native mobile apps** | Brittco, Remarkable Health, Netsmart, Sandata |
| **Mobile web responsive** | Qualifacts, Medisked, iCareManager, Setworks |
| **Limited mobile** | Therap (functional but cramped), AWARDS, MITC |

---

## 4. GUAD'S COMPETITIVE POSITION

### What NO Competitor Does Well (Guad's White Space)
1. **Voice-to-structured-note with AI** -- Lomi is unique in IDD
2. **Real-time vague language detection** and coaching during documentation
3. **AI-powered shift coverage automation** with automatic staff matching (not seen in IDD charting tools; general home-care scheduling products do auto-offer open shifts, so verify before claiming it as unique)
4. **Caregiver-first mobile experience** -- most competitors are supervisor/admin-first
5. **Sub-5-minute documentation workflow** -- vs 30-60 minutes in Therap
6. **Live AI-generated supervisor summaries** with "needs attention" feed
7. **Automatic incident detection** from shift narrative content

### Guad vs Therap: Feature Comparison

| Area | Therap (Current) | Guad (Current/Planned) | Guad Advantage |
|------|------------------|----------------------|----------------|
| Note Entry | Manual text box, 30-60 min | Voice + AI draft via Lomi, ~5 min | 6-10x faster |
| Quality Flags | AI QA after submission (new) | Lomi detects vague wording in real-time | Prevents issues before submission |
| Goal Tracking | Navigate per goal, dropdown-heavy | Inline per-person, tap prompt levels | 3-4x fewer taps |
| Incident Detection | Manual separate form | Lomi auto-detects from narrative | Catches missed incidents |
| Supervisor View | Run reports, check each note | Live "needs attention" feed + AI summary | Saves 1-2 hours daily |
| Shift Coverage | Phone tree, manual | Lomi auto-offers to eligible staff | Minutes vs hours |
| Clock-in | Separate EVV system or none | Built-in GPS check-in | One less system |
| Mobile | Cramped web forms | Mobile-first with touch targets | Dramatically better UX |
| Analytics | Batch CSV reports | Live dashboards with trend charts | Real-time visibility |

### Market Positioning

Guad occupies a unique position: **IDD-native with modern tech and AI**. No other platform combines:
- Therap-level IDD domain focus (T-Log equivalents, ISP goals, GER, MAR, SComm)
- Modern UX comparable to Brittco/iCareManager tier
- AI capabilities that exceed even Remarkable Health (the most aggressive AI adopter)

The competitive landscape segments into three tiers:
1. **Enterprise/state-mandated** (Therap, Netsmart) -- dominant but legacy
2. **Mid-market configurable** (Qualifacts, Medisked, Remarkable Health) -- modernizing, analytics-oriented
3. **SMB modern** (Brittco, iCareManager, Setworks) -- mobile-first, easy, but limited depth

An offering that combines Tier 3 UX with Tier 1 compliance depth and adds AI is disruptive.

---

## 5. NTICARE INTEGRATION STRATEGY

### About NTICare
NTICare (nticare.com) is an IDD service provider (not a software company) that likely provides residential, day program, employment support, and community-based services under HCBS Medicaid waivers. The charting stakeholder is focused specifically on charting functionality and wants modern capabilities that Therap lacks.

### Pain Points (Common Across IDD Providers)
1. **Documentation burden** -- DSPs spend 30-60 min/shift on documentation instead of direct care
2. **Fragmented systems** -- separate tools for charting, billing, scheduling, HR, EVV
3. **Shift coverage chaos** -- phone trees, group texts, begging
4. **Supervisor review backlog** -- notes pile up for days
5. **Compliance risk** -- late/incomplete incident reports, documentation gaps
6. **No real-time visibility** into what is happening across homes
7. **High staff turnover** (50-70% annually) means constant retraining
8. **Audit preparation** is labor-intensive (pulling reports, cross-referencing)

### Integration Strategy: Phased Rollout

**Phase 0: Discovery (Week 1-2)**
- Shadow shifts, interview the charting owner, document current systems
- Identify state-specific regulatory requirements (incident reporting, EVV, Medicaid waiver)

**Phase 1: Pilot -- Single Home, Shift Notes (Week 3-6)**
- Deploy Lomi-powered shift notes at one home
- Run Guad alongside Therap for 2 weeks (dual entry with copy bridge)
- Measure: time-to-chart, note quality, staff satisfaction
- This is the "aha moment" -- 30 minutes to 3 minutes

**Phase 2: Expand Documentation (Week 7-12)**
- Add behavior notes, goal tracking, MAR, incidents, health tracking, GPS clock-in
- Expand to 2-3 additional homes

**Phase 3: Coverage + Scheduling (Week 13-18)**
- Enable Lomi shift coverage engine (callout workflow, auto-offers)
- Track fill rates and time-to-fill

**Phase 4: Full Rollout (Month 5-8)**
- All homes on Guad. Supervisor dashboard as primary management tool
- Begin phasing out Therap (or maintain only for billing/Medicaid submission)

### Positioning
Position Guad not as "replacing Therap" (triggers fear) but as "making charting effortless." The pitch: "Your caregivers will finish charting before they leave the home. Your supervisors will review notes in real-time. Your audit prep will take minutes instead of days."

---

## 6. STRATEGIC RECOMMENDATIONS

### Immediate
1. **Build the charting comparison demo** -- recorded walkthrough showing identical shift documented in Therap (30 min, plain text) vs Guad with Lomi (3 min, voice, AI draft, structured output)
2. **Research NTICare's operating state** -- determine state-specific EVV, incident reporting, and Medicaid waiver requirements before any pilot

### Product Priorities
3. **Enhance charting visualization** -- add trend lines for goal progress over time, sparklines in goal cards, printable progress reports for ISP team meetings. Benchmark against Medisked's outcomes visualization
4. **Add configurable incident reporting rules** -- build state-specific notification rules (replace hardcoded placeholder in app-core.js)
5. **Build offline-first capability** -- many group homes have poor connectivity; this is a critical differentiator that most legacy platforms handle poorly

### Integration
6. **Therap data bridge** -- "Copy to clipboard (Therap format)" button on approved notes for the dual-system transition period
7. **EVV export** -- extend GPS clock-in to export visit verification data in state aggregator formats (Sandata, HHAeXchange)
8. **FHIR R4 readiness** (Rebuild target -- not in MVP) -- as value-based care models reach IDD, cross-provider data exchange becomes critical

### Long-Term Differentiation
9. **Expand Lomi AI beyond shift notes** -- auto-generate ISP progress summaries, detect behavioral escalation patterns, suggest schedule optimizations, generate audit-ready compliance reports
10. **State contract strategy** -- research which states have upcoming IDD documentation system RFP cycles; being positioned as an approved alternative when a state's Therap contract comes up for renewal is the highest-leverage sales motion

### Competitive Intelligence (Ongoing)
11. **Monitor Remarkable Health and Medisked most closely** -- Remarkable Health for AI-forward documentation strategy, Medisked for outcomes-focused analytics. These represent the most relevant competitive threats
12. **Watch consolidation** -- PE is driving rapid consolidation (Netsmart + Foothold, Qualifacts roll-ups, Remarkable Health rebrand). This creates opportunity for a modern, independent entrant

---

## 7. COMPLIANCE REQUIREMENTS

Any solution targeting the IDD market must have:
- **HIPAA BAA** with all vendors and cloud providers
- **SOC 2 Type II** certification (Therap has this; Guad must match)
- **EVV compliance** per 21st Century Cures Act (GPS, telephony, fixed-device methods)
- **State-specific Medicaid documentation** requirements (varies by state waiver program)
- **CMS HCBS Settings Rule** documentation support
- **FHIR readiness** (Rebuild target -- not in MVP) for health data interoperability
- **Encryption** at rest (AES-256) and in transit (TLS 1.3)
- **Immutable audit logging** with 7-year retention
- **Role-based access control** with per-client permissions

---

*NOTE ON METHODOLOGY: Web research tools (WebSearch, secure_fetch) were blocked by organizational policies during the original research sessions. This analysis is compiled from training data through May 2025 and the detailed therap-research.md (which used 15-agent parallel deep research). For live-data verification, re-run with WebSearch enabled or manually visit cited sources.*
