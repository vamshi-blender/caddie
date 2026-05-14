# Phase 1 Ready to Execute ✓

**Status:** All materials prepared  
**Target AI Assistants:** 3 (one per module)  
**Total Execution Time:** ~2 hours  
**Outcome:** Complete table classification + join hints (foundation for all subsequent phases)

---

## Summary of Changes Made

### 1. Updated Strategy Document
**File:** `docs/db-optimization-plan-v2.md`

**Changes:**
- Phase 1 now includes "Join Hints" (typical join targets for each table)
- Phase 2 now includes "Discovery Bundles" (parallel query groups based on join hints)
- All phases now explicitly designed for development-only, with production deployment checklist
- Parallel query capability integrated throughout

**Key insight:** Join hints from Phase 1 enable Phase 2 to reduce discovery time by 75% (8-10 seconds → 2-3 seconds)

### 2. Updated Phase 1 Methodology
**File:** `docs/step-1_segregation-approach.md`

**Changes:**
- Added "Join Hints" as part of Step 6 (documentation)
- Added example join hint tables for each module
- Added explanation of how join hints enable parallel discovery

---

## Files Ready for AI Assistants

### 3 AI-Ready Prompts (Copy-paste ready):

1. **`docs/PROMPT_AI_PHASE1_MCC_MODULE.md`**
   - Complete step-by-step instructions
   - Sample validation questions
   - Success criteria
   - Time estimate: 30-40 min
   - Output: MCC section in `db-table-classification.md`

2. **`docs/PROMPT_AI_PHASE1_RBS_MODULE.md`**
   - Complete step-by-step instructions
   - Builds on MCC output (appends, doesn't replace)
   - Sample validation questions
   - Success criteria
   - Time estimate: 30-40 min
   - Output: RBS section appended to `db-table-classification.md`

3. **`docs/PROMPT_AI_PHASE1_SHARED_MODULE.md`**
   - Complete step-by-step instructions
   - Builds on RBS output (appends, doesn't replace)
   - Sample validation questions
   - Success criteria
   - Time estimate: 30-40 min
   - Output: SHARED section appended to `db-table-classification.md`

### Execution Guide:

**`docs/PHASE1_EXECUTION_GUIDE.md`**
- Overview of Phase 1 changes
- Execution checklist
- Prompt sequence
- QA criteria
- What NOT to do

---

## Key Differences from v1.0

| Aspect | v1.0 | v2.0 | Why Changed |
|---|---|---|---|
| Phase 1 Output | Table classification only | + Join hints | Enables Phase 2 parallel discovery (75% faster) |
| Discovery Approach | Sequential | Parallel | 8-10 seq queries → 4 parallel queries (2-3s wait) |
| Join Information | Discovered in Phase 2 | Pre-documented in Phase 1 | Avoids re-discovery overhead |
| Phases | Any order | Development → Production sequential | Aligns with constraints |
| Hardcoding | Risk of test-question bias | Avoided via generic patterns | Generalizes to any question |

---

## Ready to Execute

**Step 1: Send MCC Prompt to AI Assistant #1**
```
Send file: docs/PROMPT_AI_PHASE1_MCC_MODULE.md
Expected completion: 30-40 minutes
Verify: MCC section appears in docs/final_docs/db-table-classification.md
```

**Step 2: Send RBS Prompt to AI Assistant #2** (after MCC complete)
```
Send file: docs/PROMPT_AI_PHASE1_RBS_MODULE.md
Expected completion: 30-40 minutes
Verify: RBS section appended to existing file
```

**Step 3: Send SHARED Prompt to AI Assistant #3** (after RBS complete)
```
Send file: docs/PROMPT_AI_PHASE1_SHARED_MODULE.md
Expected completion: 30-40 minutes
Verify: SHARED section appended, final summary table complete
```

**Total Phase 1 Duration:** ~2 hours

---

## What Each AI Assistant Needs to Know

### AI Assistant #1 (MCC Module):
- You're classifying MCC module tables (MCC_* prefix)
- Your output is the FOUNDATION for all subsequent work
- Document join hints (critical for Phase 2 parallel discovery)
- Validate your work against 4 sample business questions
- Save to `docs/final_docs/db-table-classification.md`

### AI Assistant #2 (RBS Module):
- You're classifying RBS module tables (RBS_* prefix)
- MCC classification is already done (in the file you'll read)
- APPEND your RBS section to the existing file (don't replace)
- Document join hints just like MCC assistant did
- Validate your work against 3 sample business questions
- Update the summary table to show MCC + RBS counts

### AI Assistant #3 (SHARED Module):
- You're classifying remaining tables (MDM_*, LKP_*, others)
- This completes Phase 1 (MCC + RBS are already done)
- APPEND your SHARED section to the existing file
- Document join hints for all REQUIRED tables
- Validate your work against questions from ALL modules
- Update summary table to show final counts (all 3 modules)

---

## Success Criteria for Phase 1

**Overall:**
- [ ] All ~500 database tables classified (REQUIRED/MAYBE/NOT-REQUIRED)
- [ ] Join hints documented for all REQUIRED tables
- [ ] Final count: ~70-100 REQUIRED+MAYBE, ~400 NOT-REQUIRED
- [ ] File is clean, organized, complete
- [ ] All sample validation questions pass

**Per Module:**
- MCC: 20-30 tables, 5-8 REQUIRED, 3-5 MAYBE, rest NOT-REQUIRED
- RBS: 15-25 tables, 5-8 REQUIRED, 2-4 MAYBE, rest NOT-REQUIRED
- SHARED: 50-100 tables, 8-12 REQUIRED, 5-10 MAYBE, rest NOT-REQUIRED

**Join Hints:**
- Every REQUIRED table has documented join targets
- Every join hint explains WHY those lookups are related
- Join hints are generic (not hardcoded to specific questions)

**Evidence:**
- Every NOT-REQUIRED table has documented reason for exclusion
- Reasons are evidence-based ("TMP_ prefix, 0 rows, metadata columns") not subjective

---

## What Happens After Phase 1

After all 3 modules complete and Phase 1 is validated:

**Phase 2 (Schema Documentation):**
- Uses join hints to create "Discovery Bundles"
- Example: "When querying MCC_GRIEVANCES, fetch these 4 schemas in parallel"
- Documents all columns, data types, enums, business rules
- Reduces discovery time from 8-10 seconds to 2-3 seconds

**Phase 3 (Join Patterns + Issues):**
- Documents proven query templates
- Lists common failure modes and solutions
- Pre-prevents 25% of join failures

**Phase 4 (Session Learning):**
- Logs every question and its outcome
- Refines patterns based on real usage
- Compounds improvement over time

**Production Deployment:**
- Only after ALL 4 phases complete
- Uses readiness checklist to validate

---

## Support

If any AI assistant gets stuck:

**For methodology questions:**
- Read: `docs/step-1_segregation-approach.md` (7-step process)

**For strategy questions:**
- Read: `docs/db-optimization-plan-v2.md` (full 4-phase strategy)

**For execution questions:**
- Read: `docs/PHASE1_EXECUTION_GUIDE.md` (checklist, QA, what not to do)

**For specific module questions:**
- MCC: `docs/PROMPT_AI_PHASE1_MCC_MODULE.md`
- RBS: `docs/PROMPT_AI_PHASE1_RBS_MODULE.md`
- SHARED: `docs/PROMPT_AI_PHASE1_SHARED_MODULE.md`

---

## Files Structure Overview

```
docs/
├── db-optimization-plan-v2.md          # Full 4-phase strategy (UPDATED)
├── step-1_segregation-approach.md      # Phase 1 methodology (UPDATED with join hints)
├── db-query-approach.md                # Reference (unchanged)
├── PHASE1_EXECUTION_GUIDE.md           # Execution guide (NEW)
├── PROMPT_AI_PHASE1_MCC_MODULE.md      # MCC prompt (NEW)
├── PROMPT_AI_PHASE1_RBS_MODULE.md      # RBS prompt (NEW)
├── PROMPT_AI_PHASE1_SHARED_MODULE.md   # SHARED prompt (NEW)
└── final_docs/
    └── db-table-classification.md      # OUTPUT (will be created by AI assistants)
```

---

## Timeline

**Now:** Phase 1 materials ready ✓
**Next 2 hours:** Phase 1 execution (3 AI assistants, 3 modules)
**After:** Phase 1 validation
**Then:** Phase 2 (Schema Documentation)
**Then:** Phase 3 (Join Patterns)
**Then:** Phase 4 (Session Learning)
**Finally:** Production Deployment (all 4 phases complete)

---

## Key Insight for AI Assistants

**The critical innovation in this approach:**

Join hints from Phase 1 → Discovery bundles in Phase 2 → Parallel query execution

Old way:
```
Query MCC_GRIEVANCES structure (2s)
Query MDM_MCC_COMPTYPE structure (2s)
Query LKP_GRIEVSTATUS structure (2s)
Total wait: 6 seconds (sequential)
```

New way:
```
Query all 3 schemas in parallel (2s)
Total wait: 2 seconds (parallel)
```

This is why Phase 1 v2.0 includes join hints — they're the key to Phase 2's performance improvement.

---

## Ready? Go!

All materials are prepared. Send the first prompt to AI Assistant #1 for MCC module classification.

After MCC completes, send RBS prompt to AI Assistant #2.
After RBS completes, send SHARED prompt to AI Assistant #3.

Total time: ~2 hours
Total outcome: Foundation for 3-8x query speedup

Let's go! 🚀
