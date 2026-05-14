# Phase 1 Execution Guide - Table Classification + Join Hints

**Status:** Ready for AI Assistant Execution  
**Phase:** 1 of 4 (Development Only)  
**Objective:** Classify all database tables (REQUIRED/MAYBE/NOT-REQUIRED) and document join hints for parallel discovery in Phase 2

---

## Overview

Phase 1 has been redesigned with three constraints in mind:

1. ✓ **No hardcoding for specific questions** — All classifications are general, not tailored to the 16 test questions
2. ✓ **Development-only phases** — Production deployment only after all 4 phases complete
3. ✓ **Parallel query execution** — Join hints enable Phase 2 to fetch related table schemas simultaneously (not sequentially)

---

## What is Phase 1?

**Phase 1 = Table Classification + Join Hints**

**Table Classification:** Sort all ~500 database tables into 3 buckets:
- **REQUIRED** (~40-50 tables) — Core business tables, always included
- **MAYBE** (~30-40 tables) — Optional lookups, use when needed
- **NOT-REQUIRED** (~400 tables) — Temp/backup/framework, never use

**Join Hints:** For each REQUIRED table, document which lookup/reference tables are typically joined to it. Example:
```
MCC_GRIEVANCES
  → Typical Join Targets: MDM_MCC_COMPTYPE, MDM_SHR_SERVICECONN, LKP_GRIEVSTATUS
  
Why: When querying grievances, you almost always need complaint type names, 
consumer info, and status descriptions from these lookup tables.
```

**Why Join Hints?**
- Phase 2 uses join hints to determine which tables to fetch in parallel
- Instead of: query MCC_GRIEVANCES structure → wait → query MDM_MCC_COMPTYPE → wait → query LKP_GRIEVSTATUS
- It does: query all 3 simultaneously (parallel) → wait once
- Result: Discovery time drops from 8-10 seconds to 2-3 seconds

---

## Phase 1 Execution Plan

### Step 1: Classify MCC Module
**AI Assistant Task:** Execute `PROMPT_AI_PHASE1_MCC_MODULE.md`

**What to do:**
1. Query all MCC_* tables
2. Classify each as REQUIRED/MAYBE/NOT-REQUIRED
3. Document join hints (typical join targets)
4. Validate with sample business questions
5. Save to `docs/final_docs/db-table-classification.md`

**Time:** 30-40 minutes  
**Output size:** ~10-15 KB (MCC section only)

**Success criteria:**
- All MCC_* tables classified
- Join hints documented for each REQUIRED table
- Sample questions work (grievances by type, top consumers, tanker requests)
- Evidence provided for every NOT-REQUIRED table

---

### Step 2: Classify RBS Module
**AI Assistant Task:** Execute `PROMPT_AI_PHASE1_RBS_MODULE.md`

**What to do:**
1. Query all RBS_* tables
2. Classify each as REQUIRED/MAYBE/NOT-REQUIRED
3. Document join hints
4. Validate with sample business questions
5. **APPEND to existing file** (don't replace MCC section)

**Time:** 30-40 minutes  
**Output size:** ~10-15 KB (RBS section only)

**Success criteria:**
- All RBS_* tables classified
- Join hints documented
- Sample questions work (disconnections + orders, billing analysis)
- Evidence documented
- File now has MCC + RBS sections

---

### Step 3: Classify SHARED/Cross-Module Tables
**AI Assistant Task:** Execute `PROMPT_AI_PHASE1_SHARED_MODULE.md`

**What to do:**
1. Query all remaining tables (MDM_*, LKP_*, others)
2. Classify each as REQUIRED/MAYBE/NOT-REQUIRED
3. Document join hints
4. Validate with sample business questions (from all modules)
5. **APPEND to existing file** (now has MCC + RBS + SHARED)

**Time:** 30-40 minutes  
**Output size:** ~15-20 KB (SHARED section only)

**Success criteria:**
- All remaining tables classified
- Join hints documented
- Sample questions from MCC, RBS, and combined modules work
- Evidence documented
- File now has final summary table with all 3 modules complete
- **TOTAL file size:** ~35-50 KB (all modules)

---

## Deliverable Format

### File: `docs/final_docs/db-table-classification.md`

After all 3 modules, the file should look like:

```markdown
# Database Table Classification by Module

## SUMMARY: ALL 3 MODULES COMPLETE

| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total |
|---|---|---|---|---|
| MCC    | 8        | 5     | 12           | 25    |
| RBS    | 6        | 4     | 10           | 20    |
| SHARED | 8        | 5     | 25           | 38    |
| **TOTAL** | **22** | **14** | **47** | **83** |

---

## MODULE 1: MCC (Metro Customer Care) - COMPLETE

### REQUIRED Tables
[Table with columns: Table Name, Row Count, Purpose, Primary Use, Typical Join Targets]

### MAYBE Tables
[Table with columns: Table Name, Condition to Use, Purpose, Typical Join Targets]

### NOT-REQUIRED Tables
[Table with columns: Table Name, Reason Excluded, Category]

### Join Hints for Phase 2 Discovery (MCC Module)
[Table with columns: Main Table, Typical Join Targets, Why They're Related]

---

## MODULE 2: RBS (Revenue Billing System) - COMPLETE

[Same structure as MCC]

---

## MODULE 3: SHARED / CROSS-MODULE - COMPLETE

[Same structure as MCC]

---
```

**Key points:**
- Summary table at top (shows progress)
- 3 modules, each with REQUIRED/MAYBE/NOT-REQUIRED sections
- Each module has Join Hints section (new addition from v2.0 plan)
- Total: ~50-100 REQUIRED+MAYBE tables (out of 500)
- Total NOT-REQUIRED: ~400 tables (eliminated from future queries)

---

## What Happens After Phase 1?

### Immediate (Development):
1. **Phase 1 Output validated:** All tables properly classified, join hints documented
2. **Phase 2 begins:** Schema documentation team uses join hints to create "Discovery Bundles"
   - Example: "When querying MCC_GRIEVANCES, fetch these 4 schemas in parallel"
   - Enables 3-4x faster discovery

### Later (Development):
3. **Phase 3:** Join patterns and known issues documented
4. **Phase 4:** Session learning system setup
5. **Production:** Deploy complete optimization after all 4 phases ready

### Impact:
- Query discovery time: 8-10 seconds → 2-3 seconds (per query)
- First-attempt success: 60-70% → 95%+
- Average time per question: 2-4 minutes → 10-20 seconds

---

## Join Hints: The Critical New Addition

**Old Phase 1 output:**
```
MCC_GRIEVANCES: REQUIRED
MDM_MCC_COMPTYPE: REQUIRED
LKP_GRIEVSTATUS: REQUIRED
```

**New Phase 1 output (v2.0):**
```
MCC_GRIEVANCES: REQUIRED
  Typical Join Targets: MDM_MCC_COMPTYPE, MDM_SHR_SERVICECONN, LKP_GRIEVSTATUS
  Why: Complete grievance detail requires type names, consumer info, status descriptions
```

**Why this matters:**
- Phase 2 looks at MCC_GRIEVANCES and says: "Oh, I need to fetch 3 lookups with it"
- Instead of fetching them one-by-one (8-10 seconds), fetch all 3 at once (2-3 seconds)
- This is why join hints are documented in Phase 1, not discovered in Phase 2

---

## Execution Checklist

**Before starting MCC module:**
- [ ] AI assistant has read `PROMPT_AI_PHASE1_MCC_MODULE.md`
- [ ] AI assistant has read `docs/step-1_segregation-approach.md` (methodology)
- [ ] `docs/final_docs/db-table-classification.md` is empty/ready for output

**After MCC module complete:**
- [ ] MCC section is in `db-table-classification.md`
- [ ] All MCC_* tables classified (REQUIRED/MAYBE/NOT-REQUIRED)
- [ ] Join hints documented for each REQUIRED table
- [ ] Sample questions validate correctly
- [ ] File saved

**Before starting RBS module:**
- [ ] AI assistant has read `PROMPT_AI_PHASE1_RBS_MODULE.md`
- [ ] AI assistant has read existing `db-table-classification.md` (has MCC section)
- [ ] Instructions: APPEND RBS section, don't replace

**After RBS module complete:**
- [ ] RBS section appended to file (file now has MCC + RBS)
- [ ] All RBS_* tables classified
- [ ] Join hints documented
- [ ] Sample questions validate
- [ ] File saved with updated summary table

**Before starting SHARED module:**
- [ ] AI assistant has read `PROMPT_AI_PHASE1_SHARED_MODULE.md`
- [ ] AI assistant has read existing file (has MCC + RBS)
- [ ] Instructions: APPEND SHARED section, don't replace

**After SHARED module complete:**
- [ ] SHARED section appended (file now complete with all 3 modules)
- [ ] All remaining tables classified
- [ ] Join hints documented
- [ ] Sample questions from all modules validate
- [ ] Final summary table shows all 3 modules complete
- [ ] File saved

**Phase 1 Done when:**
- [ ] All 500+ tables classified
- [ ] Total REQUIRED+MAYBE: ~70-100 tables (reduced from 500)
- [ ] Total NOT-REQUIRED: ~400 tables (eliminated)
- [ ] Join hints documented for all REQUIRED tables
- [ ] Evidence provided for all NOT-REQUIRED classifications
- [ ] All sample questions pass validation
- [ ] File is clean, organized, and saved

---

## Prompt Sequence

**To execute Phase 1, use these prompts in order:**

### Prompt 1 (MCC Module):
```
File: docs/PROMPT_AI_PHASE1_MCC_MODULE.md
Send this entire prompt to an AI assistant
Expected output: MCC section in docs/final_docs/db-table-classification.md
Time: 30-40 minutes
```

### Prompt 2 (RBS Module):
```
File: docs/PROMPT_AI_PHASE1_RBS_MODULE.md
Send this entire prompt to an AI assistant
Expected output: RBS section APPENDED to db-table-classification.md
Time: 30-40 minutes
```

### Prompt 3 (SHARED Module):
```
File: docs/PROMPT_AI_PHASE1_SHARED_MODULE.md
Send this entire prompt to an AI assistant
Expected output: SHARED section APPENDED to db-table-classification.md
Time: 30-40 minutes
```

**Total Phase 1 Time:** ~2 hours (3 modules × 30-40 min each)

---

## Quality Assurance

After Phase 1 completes, validate:

1. **Completeness:** All tables classified
2. **Evidence:** Every NOT-REQUIRED table has documented reason
3. **Join Hints:** Every REQUIRED table has documented join targets
4. **Sample Questions:** All test questions from 16-question dataset work
5. **File Format:** Clean markdown, organized by module, summary table at top
6. **Classification Logic:** No obvious misclassifications (e.g., empty backup table marked REQUIRED)

---

## What NOT to Do in Phase 1

❌ Don't hardcode for the 16 test questions  
✓ Classify tables based on general usefulness

❌ Don't get stuck on borderline cases  
✓ When unsure, classify as MAYBE (Phase 2 will clarify)

❌ Don't classify without evidence  
✓ Document why each NOT-REQUIRED table is excluded

❌ Don't create separate files  
✓ All output goes to one file: `db-table-classification.md`

❌ Don't replace previous modules  
✓ APPEND each new module to the same file

---

## Next Steps After Phase 1

1. **Validate Phase 1 output** — All tables classified? Join hints documented?
2. **Proceed to Phase 2** — Schema documentation (will use join hints for discovery bundles)
3. **Then Phase 3** — Join patterns and known issues
4. **Then Phase 4** — Session learning
5. **Final check** — Use readiness checklist before production deployment

---

## Documents Referenced in Phase 1

**For methodology:**
- `docs/step-1_segregation-approach.md` — Classification methodology (7 steps)

**For strategy context:**
- `docs/db-optimization-plan-v2.md` — Full 4-phase strategy (shows how Phase 1 fits)

**For prompts:**
- `docs/PROMPT_AI_PHASE1_MCC_MODULE.md` — Detailed MCC prompt
- `docs/PROMPT_AI_PHASE1_RBS_MODULE.md` — Detailed RBS prompt
- `docs/PROMPT_AI_PHASE1_SHARED_MODULE.md` — Detailed SHARED prompt

**Outputs to:**
- `docs/final_docs/db-table-classification.md` — Final classified list (created by this phase)

---

## Key Innovation in Phase 1 v2.0

**Old approach:** Classify tables, stop
**New approach:** Classify tables + document join hints

**Why this matters:**
- Join hints become "parallel discovery bundles" in Phase 2
- Instead of sequential schema discovery (8-10 seconds), AI fetches all related schemas in parallel (2-3 seconds)
- This is the single biggest lever for query speed improvement
- Without join hints, Phase 2 has to rediscover joins every time
- With join hints, Phase 2 knows exactly what to fetch in parallel

**Impact:**
- Enables 3-8x faster query composition (across all phases)
- Compounds with Phase 2, 3, 4 optimizations
- Makes the entire 4-phase strategy work

---

## Questions?

If an AI assistant gets stuck during Phase 1 execution:
1. Check the relevant prompt file (MCC/RBS/SHARED)
2. Re-read the 7-step classification process in `step-1_segregation-approach.md`
3. Ask: "Is this table used to answer real business questions?" If no → NOT-REQUIRED
4. When unsure, classify as MAYBE and move on
5. Validate at the end with sample questions

**Phase 1 is straightforward:** Classify tables by evidence, document join hints, validate with sample questions. No complex logic required.

Good luck with Phase 1 execution!
