# Phase 1: Table Segregation & Classification Methodology

**Objective:** Classify all database tables into Required/Maybe/Not-Required buckets  
**Goal:** Reduce query failures by 25%, eliminate wasted table-discovery queries  
**Output:** `db-table-classification.md` (list of classified tables)  
**Effort:** ~20-30 minutes (run once)

---

## Why Table Segregation Matters

Without classification:
- AI spends 15-20% of queries discovering table existence
- 25% of failures come from joining to wrong/empty tables
- Each question requires re-discovering same table patterns

With classification:
- Table decisions pre-made: use REQUIRED or MAYBE, skip NOT-REQUIRED
- Join failures prevented: avoid empty lookups, broken relationships
- Query time reduced by 60-80%

---

## 7-Step Classification Process

### Step 1: Define Classification Buckets

Classify every table into one of three categories:

**REQUIRED** - Business-critical tables (always include)
- Main transactional tables (MCC_*, RBS_* without BKP/TMP suffix)
- Core lookup tables that decode information
- Examples: MCC_GRIEVANCES, MDM_SHR_CONSUMER, MDM_SHR_SERVICECONN, RBS_DISCONN_REQUEST

**MAYBE** - Context-dependent (include when needed)
- Lookup tables for specific analysis (e.g., MDM_SHR_DIVISION for location queries)
- Historical tables (if temporal analysis is needed)
- Status/enumeration tables (LKP_*, unless already captured in REQUIRED)

**NOT-REQUIRED** - Exclude (never needed for business analysis)
- Temp/staging: TMP_*, TBL_*, TEMP_*, STG_*
- Backups/archives: *_BKP*, *_BAK*, *_OLD*
- Audit/logs: *_AUDIT*, *_LOG*, MLOG$*, RUPD$*
- Replication/sync: EIF_* (unless analyzing integrations)
- Internal framework: WRR$*, WRH$*, PROD_*

### Step 2: Collect Schema Evidence & Filter by Row Count

For each table in the database, gather:
- **Row count estimate** (from DB statistics)
- **Columns and data types** (from all_tab_columns)
- **Primary/foreign keys** (from constraint tables)
- **Last analyzed date** (freshness of stats)
- **Naming pattern** (prefix indicates purpose)
- **Referenced by** (do core queries join to it?)

**Important:** Check table row counts first. Tables with **0 records** are strong candidates for NOT-REQUIRED classification. However, **do not automatically exclude zero-row tables** — validate each one:

1. **Check table name & purpose:** Does the name suggest it should have data? (e.g., TMP_*, TEMP_* expect zero rows; MDM_* should have data)
2. **Inspect columns:** Do the columns indicate it's a core business table or a temporary/staging table?
3. **Verify it's not newly created:** Some lookup tables may be empty until data is loaded
4. **Better approach:** Use multiple signals (Step 4) to decide, even if row count is zero. A zero-row MDM_* table might still be REQUIRED if its schema indicates future importance.

**Rule of thumb:** If a table has 0 rows AND has TMP/TEMP/STG/BKP/LOG in its name, exclude it. Otherwise, investigate further before excluding.

### Step 3: Score Each Table for Usability

Apply classification logic:
- Answer: "Does this help answer real business questions?"
  - YES → REQUIRED or MAYBE
  - NO → NOT-REQUIRED
- Answer: "Is this only metadata or framework?"
  - YES → NOT-REQUIRED
  - NO → Continue to Step 4

### Step 4: Use Multiple Signals (Don't Just Rely on Names)

Exclude a table only when MULTIPLE signals agree:

| Signal | Examples | Action |
|---|---|---|
| Naming pattern | TMP_, LOG_, BAK_, MLOG$ | Mark as NOT-REQUIRED |
| Metadata-heavy columns | CREATED_BY, SESSION_ID, PROCESS_ID | Mark as NOT-REQUIRED |
| No business relationships | Isolated, not joined to core tables | Mark as NOT-REQUIRED |
| High churn, low value | Constantly updated but rarely queried | Mark as NOT-REQUIRED |
| Not in core join paths | Not referenced by grievance/consumer/connection queries | Mark as NOT-REQUIRED |

**Rule:** A table is NOT-REQUIRED only if 3+ signals agree. If unsure, classify as MAYBE.

### Step 5: Validate Against Real Query Patterns

Test classification with sample business questions:

1. "Show grievances by type and status in March 2025"
   - Tables needed: MCC_GRIEVANCES (REQUIRED), MDM_MCC_COMPTYPE (MAYBE)
   - Confirms: GRIEVANCES_VIEW_* should be excluded

2. "Top 5 consumers with highest complaints"
   - Tables needed: MCC_GRIEVANCES (REQUIRED), MDM_SHR_SERVICECONN (REQUIRED)
   - Confirms: Backup tables excluded

3. "Service connections by circle in March 2025"
   - Tables needed: MDM_SHR_SERVICECONN (REQUIRED), MCC_SECT_SUBDIVN_DIVN_CIRCLE (MAYBE)
   - Confirms: MDM_SHR_DIVISION is MAYBE (not always used)

4. "Tanker requests by quarter 2023"
   - Tables needed: MCC_GRIEVANCES (REQUIRED), MCC_TANKER_RATES (MAYBE)
   - Confirms: Tanker lookups classified correctly

**Action:** If a test question breaks due to a classified-out table, reclassify it to MAYBE.

### Step 6: Document All Decisions (Grouped by Module)

Create a markdown document organized by **business modules**, not alphabetically. This makes it easier for users/AI to find tables relevant to their questions.

**Known Modules:**
- **MCC** = Metro Customer Care (complaint/grievance management)
- **RBS** = Revenue Billing System (billing, disconnections, collections)
- Other modules may exist (identify during classification)

**Document Structure:**

For EACH module (MCC, RBS, etc.), organize tables by classification:

```markdown
# Database Table Classification by Module

## MODULE 1: MCC (Metro Customer Care)

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use |
|---|---|---|---|
| MCC_GRIEVANCES | 25M+ | Main complaint/grievance data | Filter by date, type, status, consumer |
| MDM_MCC_COMPTYPE | 15K | Complaint type lookup | Map GRIEVANCETYPEID to type names |
| MCC_CONSUMERS_CONNECTIONS | 3M | Consumer-connection link | Link consumer to service connections |
| ... | ... | ... | ... |

### MAYBE Tables
| Table Name | Condition to Use | Purpose |
|---|---|---|
| MCC_TANKER_RATES | When analyzing tanker costs | Tanker pricing by capacity/category |
| MCC_TANKERGRVPOLICY | Rare: specific tanker policy analysis | Tanker grievance policies |
| ... | ... | ... |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| MCC_GRIEVANCES_BKP | Backup table (stale data) | Backup |
| MCC_TANKERGRIEVANCE_TEMP | Temporary working table | Temp/staging |
| ... | ... | ... |

---

## MODULE 2: RBS (Revenue Billing System)

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use |
|---|---|---|---|
| RBS_DISCONN_REQUEST | 5M+ | Disconnection request master | Filter by date, status, consumer |
| RBS_CONNECTIONLEDGER_MONTHLY | 50M+ | Monthly billing transactions | Analyze payment activity, bills |
| MDM_SHR_SERVICECONN | 1.4M | Service connection master | Map CAN to consumer, location, status |
| MDM_SHR_CONSUMER | 1.5M | Consumer master details | Get consumer names, contacts |
| ... | ... | ... | ... |

### MAYBE Tables
| Table Name | Condition to Use | Purpose |
|---|---|---|
| LKP_CONNECTION_STATUS | When analyzing connection statuses | Status codes and meanings |
| LKP_DISCONN_STATUS | When analyzing disconnection statuses | Disconnection status codes |
| MDM_SHR_DIVISION | When analyzing location/division data | Division name lookup |
| ... | ... | ... |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| RBS_CONNECTIONLEDGER_BUG6567 | Backup/duplicate for bug fix | Backup |
| RBS_DISCONN_PROGRAM | Legacy program tracking | Legacy |
| ... | ... | ... |

---

## MODULE 3: SHARED/CROSS-MODULE

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use |
|---|---|---|---|
| MDM_SHR_SERVICECONN | 1.4M | Service connection master | Core link between all modules |
| MDM_SHR_CONSUMER | 1.5M | Consumer master | Customer information |
| MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV | 10K | Location hierarchy | Circle, division, area mapping |
| CONSUMER_ALTERNATE_CONTACT | 2M | Alternate contact details | Additional phone numbers |
| ... | ... | ... | ... |

### MAYBE Tables
| Table Name | Condition to Use | Purpose |
|---|---|---|
| MDM_SHR_CONSUMERHISTORY | For historical consumer data | Past consumer information |
| MDM_SHR_SERVICECONNHISTORY | For historical connection data | Past connection information |
| ... | ... | ... |

### NOT-REQUIRED Tables
(Usually empty in shared/cross-module)
| Table Name | Reason Excluded | Category |
|---|---|---|
| ... | ... | ... |

---

## SUMMARY

| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total |
|---|---|---|---|---|
| MCC | X | Y | Z | X+Y+Z |
| RBS | X | Y | Z | X+Y+Z |
| SHARED | X | Y | Z | X+Y+Z |
| **TOTAL** | **X** | **Y** | **Z** | **500+** |

```

**Why Group by Module?**
- Users ask questions about MCC (complaints) or RBS (billing) - not all tables
- Faster table lookup: "I need MCC tables for grievance questions"
- Easier to maintain: New tables added to relevant module section
- Better documentation: Module-specific examples and patterns

### Step 7: Iterate Before Hard-Coding

Don't make exclusions permanent on first pass:

**Round 1 (Conservative):**
- Exclude only obvious noise (TMP_*, *_BKP*, *_LOG*)
- Classify everything else as REQUIRED or MAYBE

**Round 2 (Test & Validate):**
- Run sample business questions from Step 5
- Check which MAYBE tables are actually used
- Move unused lookups to NOT-REQUIRED

**Round 3 (Expand Confidence):**
- Based on learnings from Round 2, expand NOT-REQUIRED list
- Document patterns of what was never needed

**End State:**
- Confident list with minimal second-guessing
- Backed by actual test results

---

## Key Classification Rules

### For REQUIRED Tables
- Include ALL main transactional tables (MCC_*, RBS_*)
- Include ALL lookup tables you've used in queries
- Exception: Exclude variants with BKP/ARCH/OLD/TMP suffix

### For MAYBE Tables
- Include lookups that are sometimes needed (division, complaint type)
- Include historical tables if temporal analysis might be needed
- Include status/enum tables not already in REQUIRED

### For NOT-REQUIRED Tables
- Exclude ALL temp/staging (prefix: TMP_, TBL_, TEMP_, STG_)
- Exclude ALL backups (suffix: _BKP*, _BAK*, _OLD*)
- Exclude ALL audit/logs (suffix: _AUDIT*, _LOG*, prefix: MLOG$, RUPD$)
- Exclude ALL framework (prefix: WRR$, WRH$, PROD_)
- Exclude EIF_* unless specifically analyzing integrations

---

## Expected Results

After completing Phase 1:
- **Tables in scope:** REQUIRED + MAYBE (reduce from 500+ to ~80-100 tables)
- **Query planning time:** 30-40% faster (don't search through noise)
- **Join failure rate:** Drop from 25% to 5% (avoid empty lookups)
- **Document produced:** Clean list with classification for future reference

This classification feeds into Phase 2 (Schema Documentation), where we define columns, data types, and sample values for REQUIRED + MAYBE tables only.

---

## Handling Large Classification Tasks (Avoiding Context Overflow)

Since the Oracle database contains 500+ tables, classifying them all in a single session risks hitting context limits. Use this **incremental update strategy**:

### Strategy: Classify by Module in Batches

**Module Batches (to be classified in separate runs):**
- **Batch 1:** MCC (Metro Customer Care) module tables
- **Batch 2:** RBS (Revenue Billing System) module tables
- **Batch 3:** Shared/Cross-module tables (MDM_*, LKP_*)
- **Batch 4:** Infrastructure & Other modules (if identified)

### Incremental Update Process

**Per Batch (20-30 min execution):**
1. Query all tables belonging to one module (e.g., WHERE name LIKE 'MCC_%')
2. Classify each table (REQUIRED/MAYBE/NOT-REQUIRED) with evidence
3. Document in temporary results
4. Append to `docs/final_docs/db-table-classification.md`

**Execution Flow:**

```
Session 1: Classify MCC Tables
├─ Query: SELECT * FROM all_tables WHERE TABLE_NAME LIKE 'MCC_%'
├─ Classification: Apply Steps 1-4 to MCC tables only
├─ Output: MCC section in db-table-classification.md
└─ Update: Append to docs/final_docs/db-table-classification.md

Session 2: Classify RBS Tables
├─ Query: SELECT * FROM all_tables WHERE TABLE_NAME LIKE 'RBS_%'
├─ Classification: Apply Steps 1-4 to RBS tables only
├─ Output: RBS section in db-table-classification.md
└─ Update: Append to docs/final_docs/db-table-classification.md

Session 3: Classify Shared/Cross-Module (MDM_*, LKP_*, etc.)
├─ Classification: Apply Steps 1-4 to remaining tables
├─ Output: SHARED section in db-table-classification.md
└─ Update: Append to docs/final_docs/db-table-classification.md
```

### Document Update Pattern

**On each session:**
1. Read existing `docs/final_docs/db-table-classification.md` (may be empty initially)
2. Classify tables for the current module
3. **Append new module section** to the document (don't replace)
4. Keep running summary at top (total counts)

**Example progression:**

```
# After Session 1
## SUMMARY: 1 Module Complete
| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total |
| MCC    | 8        | 5     | 12           | 25    |
| RBS    | -        | -     | -            | -     |

## MODULE 1: MCC (COMPLETE)
[Full MCC table classification]

---

# After Session 2
## SUMMARY: 2 Modules Complete
| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total |
| MCC    | 8        | 5     | 12           | 25    |
| RBS    | 12       | 8     | 18           | 38    |

## MODULE 1: MCC (COMPLETE)
[Full MCC table classification]

---

## MODULE 2: RBS (COMPLETE)
[Full RBS table classification]

---

# After Session 3
## SUMMARY: ALL MODULES COMPLETE
[Final summary table with all counts]

## MODULE 1: MCC (COMPLETE)
...
## MODULE 2: RBS (COMPLETE)
...
## MODULE 3: SHARED/CROSS-MODULE (COMPLETE)
...
```

### Context Management Tips

- **Per session limit:** Classify ~25-40 tables per session (avoids context overflow)
- **Progress tracking:** Update summary table at each session end
- **Intermediate saves:** Save to `docs/final_docs/db-table-classification.md` after each batch
- **No re-work:** Once a module is classified and saved, don't re-classify it

---

## Quick Start

1. Query `all_tables WHERE OWNER = 'CTLHMWSSBTMP'` (get full list)
2. Identify modules: MCC, RBS, others
3. **For each module (in separate sessions):**
   - Filter tables by module prefix
   - Apply Steps 1-4 (classification logic)
   - Document in module section (Step 6)
   - Validate with sample questions (Step 5)
4. Append module results to `docs/final_docs/db-table-classification.md`
5. Iterate across all modules (Step 7)

**Time per module:** 20-30 minutes  
**Total effort:** ~1.5-2 hours (across multiple sessions)  
**Reuse rate:** Use this classification in every future query
