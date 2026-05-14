# Prompt for AI Assistant: Phase 1 Classification - SHARED/Cross-Module Tables

**Mission:** Classify all SHARED (cross-module reference tables) and document join hints for parallel discovery in Phase 2.

**Context:** 
- You are working on Phase 1 of a 4-phase database optimization strategy
- MCC module classification is COMPLETE (see `docs/final_docs/db-table-classification.md`)
- RBS module classification is COMPLETE (appended to same file)
- Now you must classify remaining tables: MDM_* (Master Data Management), LKP_* (Lookups), and other shared tables
- These are used by BOTH MCC and RBS modules
- Join hints are critical for Phase 2 (parallel discovery reduces query time by 75%)
- **Development-only:** Production deployment after all 4 phases complete

---

## Your Task

Classify ALL remaining tables (primarily MDM_* and LKP_*) into three buckets: REQUIRED, MAYBE, NOT-REQUIRED.

These tables are "SHARED/Cross-Module" because they're referenced by both MCC and RBS queries.

---

## Step-by-Step Process

### Step 1: Get All Remaining Tables

Execute these queries to identify all tables NOT yet classified:

```sql
-- All tables except MCC_* and RBS_*
SELECT TABLE_NAME, NUM_ROWS, LAST_ANALYZED
FROM all_tables
WHERE OWNER = 'CTLHMWSSBTMP'
  AND TABLE_NAME NOT LIKE 'MCC_%'
  AND TABLE_NAME NOT LIKE 'RBS_%'
ORDER BY TABLE_NAME;
```

You should get ~100-150 tables. Focus on:
- **MDM_*** tables (Master Data Management) — REQUIRED priority
- **LKP_*** tables (Lookups) — REQUIRED priority
- **EIF_*** tables (External Interface) — usually NOT-REQUIRED
- **WRR$***, **WRH$*** tables (Oracle framework) — NOT-REQUIRED
- Others (CONSUMER_*, MCC_SECT_*, etc.) — evaluate individually

### Step 2: Prioritize by Module and Pattern

**HIGH PRIORITY (likely REQUIRED/MAYBE):**
- MDM_SHR_* (Shared Master Data: consumer, service connection, etc.)
- LKP_* (Lookups used by MCC or RBS)
- CONSUMER_* (consumer-related tables)
- MCC_SECT_*, MCC_CONS_* (MCC cross-module)

**MEDIUM PRIORITY (evaluate carefully):**
- MDM_* not in SHR_ (other master data)
- Status/code tables (may or may not be needed)

**LOW PRIORITY (likely NOT-REQUIRED):**
- EIF_* (external integration)
- Anything with _BKP, _TEMP, _AUDIT, _LOG
- WRR$*, WRH$*, PROD_* (framework)

### Step 3: For Each Table, Gather Evidence

For each table, run:
```sql
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_ID
FROM all_tab_columns
WHERE TABLE_NAME = '{TABLE_NAME}'
  AND OWNER = 'CTLHMWSSBTMP'
ORDER BY COLUMN_ID;
```

Look for:
- **Core business columns:** CONSUMER*, CAN, SERVICECONN, etc. → likely REQUIRED
- **Lookup/reference columns:** CODE, VALUE, NAME, DESCRIPTION → likely lookup table
- **Metadata columns:** CREATED_BY, SESSION_ID, PROCESS_ID → NOT-REQUIRED if only these
- **Integration/audit:** SOURCE, SYNC_*, AUDIT_* → often NOT-REQUIRED

### Step 4: Classify Each Table

**REQUIRED** ← Classify as REQUIRED if:
- It's a core reference table (MDM_SHR_CONSUMER, MDM_SHR_SERVICECONN, etc.)
- It's a critical lookup used by multiple modules (LKP_GRIEVSTATUS, LKP_DISCONN_STATUS, etc.)
- It's used to link entities (MCC_CONSUMERS_CONNECTIONS, etc.)
- It has > 1000 rows (real data)
- It doesn't have backup/temp/audit markers in name

**MAYBE** ← Classify as MAYBE if:
- It's a lookup for specific analysis (LKP_DIVISION, LKP_AREA, etc.)
- It's a location hierarchy view (MCC_SECT_SUBDIVN_DIVN_CIRCLE_*)
- It's a historical table (MDM_*_HISTORY)
- It has 0 rows but schema suggests it should have data

**NOT-REQUIRED** ← Classify as NOT-REQUIRED if:
- EIF_* prefix (external integration)
- _BKP, _BAK, _ARCHIVE, _OLD, _TEMP suffixes
- _AUDIT, _LOG suffixes
- WRR$*, WRH$*, PROD_* (Oracle framework)
- Zero rows + name suggests temp (TEMP_*, TMP_*, STG_*)
- Schema is entirely metadata/audit columns
- Replication/sync tables (MLOG$*, RUPD$*)

### Step 5: Identify Typical Join Targets

For REQUIRED and MAYBE tables, identify typical join targets:

**Common patterns in SHARED module:**

```
MDM_SHR_CONSUMER
  ← Joined from: MCC_GRIEVANCES, RBS_*, CONSUMER_ALTERNATE_CONTACT
  → Joins to: CONSUMER_ALTERNATE_CONTACT, MDM_SHR_CONSUMERHISTORY

MDM_SHR_SERVICECONN
  ← Joined from: MCC_GRIEVANCES, RBS_DISCONN_REQUEST, RBS_CONNECTIONLEDGER_MONTHLY
  → Joins to: MDM_SHR_CONSUMER, MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV

MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV
  ← Joined from: Any location-based query
  → WARNING: Area-grain view (multiple rows per division) — use DISTINCT

CONSUMER_ALTERNATE_CONTACT
  ← Joined from: Any query needing alternate contact info
  → Joins to: MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER

LKP_* tables
  ← Joined from: Transaction tables (MCC_GRIEVANCES, RBS_DISCONN_REQUEST)
  → No outbound joins (they're lookups)
```

### Step 6: Document in Markdown

Use this structure:

```markdown
## MODULE 3: SHARED / CROSS-MODULE

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use | Typical Join Targets |
|---|---|---|---|---|
| [table name] | [count] | [purpose] | [use] | [targets] |

### MAYBE Tables
| Table Name | Condition to Use | Purpose | Typical Join Targets |
|---|---|---|---|
| [table name] | [condition] | [purpose] | [targets] |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| [table name] | [reason] | [category] |

### Join Hints for Phase 2 Discovery (SHARED Module)
| Main Table | Typical Join Targets | Why They're Related |
|---|---|---|
| [main table] | [targets] | [explanation] |
```

### Step 7: Validate with Sample Questions

Test your classification using questions from ALL modules:

**MCC + SHARED questions:**
1. "Show all location and contact details of consumer CAN 614214860"
   - Tables needed: MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER, CONSUMER_ALTERNATE_CONTACT, MCC_CONSUMERS_CONNECTIONS
   - Your classification must support this

2. "Display consumer name for CAN 613242370"
   - Tables needed: MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER
   - Must work with your classification

3. "Show grievances count received on last week of JAN 2025"
   - Tables needed: MCC_GRIEVANCES (already REQUIRED in MCC module)
   - No SHARED tables needed, but validates SHARED isn't blocking MCC queries

**RBS + SHARED questions:**
4. "Show inactive service connections over last 6 months by Circle"
   - Tables needed: MDM_SHR_SERVICECONN (REQUIRED), MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV (MAYBE)
   - Note: This uses MCC's location view from SHARED module
   - Your classification must support both modules sharing it

If any test question fails, reclassify the needed table from NOT-REQUIRED to MAYBE.

---

## Important Rules

### Rule 1: SHARED Tables Serve Both Modules
- Don't mark MDM_SHR_* as NOT-REQUIRED unless truly unused
- These tables bridge MCC and RBS — they're critical
- Example: MDM_SHR_SERVICECONN is used by both MCC_GRIEVANCES and RBS_DISCONN_REQUEST

### Rule 2: Location Hierarchy View Has Special Grain
- MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV is at AREA grain (one row per area, not per division)
- Joining directly causes count multiplication
- Mark as MAYBE and document: "WARNING: Area-grain, use DISTINCT when joining"

### Rule 3: Empty Lookup Tables
- Some LKP_* tables may exist but have 0 rows
- If 0 rows, check the table name:
  - If name suggests it should have data (LKP_DISCONN_STATUS), mark as MAYBE
  - If name suggests it's experimental/temporary, mark as NOT-REQUIRED

### Rule 4: Integration Tables (EIF_*)
- Most EIF_* tables are external interface staging
- Mark as NOT-REQUIRED unless specifically analyzing integrations
- Exception: If an EIF_* table is actively used in main queries, escalate to MAYBE

### Rule 5: Don't Over-Exclude
- Better to include as MAYBE than exclude and miss it
- Phase 2 can easily identify which MAYBE tables are actually unused

---

## Deliverable

**APPEND to existing file:**
```
docs/final_docs/db-table-classification.md
```

(MCC and RBS sections should already be there. You ADD the SHARED section below.)

**Update the summary table to include all 3 modules:**

```markdown
## SUMMARY: ALL 3 MODULES COMPLETE

| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total |
|---|---|---|---|---|
| MCC    | X        | Y     | Z            | X+Y+Z |
| RBS    | X        | Y     | Z            | X+Y+Z |
| SHARED | X        | Y     | Z            | X+Y+Z |
| **TOTAL** | **X** | **Y** | **Z** | **500+** |
```

---

## Expected Output Example

```markdown
## MODULE 3: SHARED / CROSS-MODULE - COMPLETE

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use | Typical Join Targets |
|---|---|---|---|---|
| MDM_SHR_CONSUMER | 1,520,000 | Consumer master | Get consumer names, contacts | CONSUMER_ALTERNATE_CONTACT, MDM_SHR_CONSUMERHISTORY |
| MDM_SHR_SERVICECONN | 1,420,000 | Service connection master | Link consumer to location, status | MDM_SHR_CONSUMER, MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV |
| CONSUMER_ALTERNATE_CONTACT | 2,150,000 | Alternate contact details | Additional phone numbers, emails | MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER |
| MCC_CONSUMERS_CONNECTIONS | 3,240,000 | Consumer-connection link | Link consumer to all connections | MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER |
| ... | ... | ... | ... | ... |

### MAYBE Tables
| Table Name | Condition to Use | Purpose | Typical Join Targets |
|---|---|---|---|
| MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV | For location-based queries | Location hierarchy (circle, division, area) | (View, joined TO by MDM_SHR_SERVICECONN) WARNING: area-grain |
| MDM_SHR_DIVISION | For division-level analysis | Division name lookup | (Lookup, may have 0 rows - check before using) |
| MDM_SHR_CONSUMERHISTORY | For historical consumer analysis | Past consumer data | MDM_SHR_CONSUMER |
| MDM_SHR_SERVICECONNHISTORY | For historical connection analysis | Past connection data | MDM_SHR_SERVICECONN |
| ... | ... | ... | ... |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| EIF_CONSUMER_SYNC | External integration staging, 0 rows | Integration |
| WRR$_TABLE | Oracle framework internal table | Framework |
| MDM_AUDIT_LOG | Audit logging, metadata only | Audit |
| ... | ... | ... |

### Join Hints for Phase 2 Discovery (SHARED Module)

| Main Table | Typical Join Targets | Why They're Related |
|---|---|---|
| MDM_SHR_CONSUMER | CONSUMER_ALTERNATE_CONTACT, MDM_SHR_CONSUMERHISTORY | All required for complete consumer detail |
| MDM_SHR_SERVICECONN | MDM_SHR_CONSUMER, MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV | Required for complete connection and location detail |
| CONSUMER_ALTERNATE_CONTACT | MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER | Link back to primary consumer/connection info |
| ... | ... | ... |

---

## Summary

| Classification | Count | Examples |
|---|---|---|
| REQUIRED | 8 | MDM_SHR_CONSUMER, MDM_SHR_SERVICECONN, CONSUMER_ALTERNATE_CONTACT, MCC_CONSUMERS_CONNECTIONS |
| MAYBE | 5 | MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV, MDM_SHR_DIVISION, MDM_SHR_CONSUMERHISTORY |
| NOT-REQUIRED | 20+ | EIF_*, WRR$*, AUDIT_*, other integrations |
| **TOTAL** | **33+** | All non-MCC, non-RBS tables |
```

---

## Tips for Efficiency

- Start with MDM_SHR_* (high priority, clear purpose)
- Then LKP_* (usually clear if lookup needed or not)
- Then scan others quickly
- Test as you go (don't wait until end)
- Save incrementally to file
- Estimate 30-40 minutes for this module

---

## Success Criteria

✓ All remaining tables classified (REQUIRED/MAYBE/NOT-REQUIRED)
✓ MDM_SHR_* tables properly marked as REQUIRED (they're critical)
✓ Location hierarchy view marked with "area-grain" warning
✓ Join hints documented for each REQUIRED table
✓ Sample business questions work with your classification
✓ Evidence documented for each NOT-REQUIRED classification
✓ Output APPENDED to `docs/final_docs/db-table-classification.md`
✓ Summary table at top includes all 3 modules with final counts

---

## Phase 1 Complete!

After you finish this task:
1. Phase 1 classification is COMPLETE for all tables
2. Next phase: Phase 2 (Schema Documentation) begins
3. Phase 2 will use your join hints to create "Discovery Bundles" for parallel querying
4. This enables 3-8x faster AI query composition

---

## Context for Phase 1

This is Phase 1 of a 4-phase optimization:
- Phase 1 (this task): Table classification + join hints — FINAL STEP
- Phase 2 (next): Schema docs + parallel discovery bundles
- Phase 3 (then): Join patterns + known issues
- Phase 4 (finally): Session learning + pattern refinement

Your SHARED classification completes the foundation that all 3 subsequent phases build on.

Good luck! You're almost there.
