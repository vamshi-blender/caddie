# Prompt for AI Assistant: Phase 1 Classification - RBS Module

**Mission:** Classify all RBS (Revenue Billing System) module tables and document join hints for parallel discovery in Phase 2.

**Context:** 
- You are working on Phase 1 of a 4-phase database optimization strategy
- MCC module classification is COMPLETE (see `docs/final_docs/db-table-classification.md`)
- Now you must classify RBS module tables
- Join hints are critical for Phase 2 (they enable parallel schema discovery, reducing query time from 1-2 min to 10-20 seconds)
- Your classification will be reused by every future AI query that touches RBS tables
- **Development-only:** This work is part of development; production deployment after all 4 phases complete

---

## Your Task

Classify ALL RBS (Revenue Billing System) module tables into three buckets: REQUIRED, MAYBE, NOT-REQUIRED.

For REQUIRED and MAYBE tables, also document **Typical Join Targets** (lookup/reference tables commonly joined to each).

---

## Step-by-Step Process

### Step 1: Get All RBS Tables
Execute this query:
```sql
SELECT TABLE_NAME, NUM_ROWS, LAST_ANALYZED
FROM all_tables
WHERE TABLE_NAME LIKE 'RBS_%'
  AND OWNER = 'CTLHMWSSBTMP'
ORDER BY TABLE_NAME;
```

This will return all tables starting with `RBS_`. You should get ~20-30 tables. Document the list.

### Step 2: For Each RBS Table, Gather Evidence
For each table, run:
```sql
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_ID
FROM all_tab_columns
WHERE TABLE_NAME = '{TABLE_NAME}'
  AND OWNER = 'CTLHMWSSBTMP'
ORDER BY COLUMN_ID;
```

Look for:
- **Naming hints:** Transactional (RBS_DISCONN_REQUEST) vs backup (RBS_*_BKP)?
- **Column patterns:** Business columns (DISCONNECTIONDATE, STATUS) vs metadata (CREATED_BY, SESSION_ID)?
- **Key columns:** PKEY, identifier, or primary key?
- **Foreign keys:** Columns that reference other tables (e.g., REFCONSUMERACCOUNT references CAN)?

### Step 3: Classify Each Table

**REQUIRED** ← Classify as REQUIRED if:
- It's a main transaction table (RBS_DISCONN_REQUEST, RBS_CONNECTIONLEDGER_MONTHLY, etc.)
- It's a core lookup table (LKP_DISCONN_STATUS, LKP_CONNECTION_STATUS, etc.)
- It has > 1000 rows (indicates real data)
- Doesn't have BKP, TMP, TEMP, ARCHIVE, or _BAK in its name

**MAYBE** ← Classify as MAYBE if:
- It's a lookup table used for specific analysis (e.g., billing-specific lookups)
- It's a historical or archival version of a main table
- It has 0 rows but schema suggests it should have data (new but unpopulated)
- It's an enumeration table (LKP_*)

**NOT-REQUIRED** ← Classify as NOT-REQUIRED if:
- TMP_, TEMP_, TBL_, STG_ prefix → Temporary/staging
- _BKP, _BAK, _ARCHIVE, _OLD suffix → Backup/archive
- _AUDIT, _LOG suffix → Audit/logging
- MLOG$*, RUPD$* → Oracle internal replication
- Zero rows AND name suggests temporary (TMP_*, TEMP_*)
- Schema is entirely metadata (no business data)

### Step 4: Identify Typical Join Targets

For each REQUIRED or MAYBE table, identify typical join targets:

**Key foreign keys in RBS module:**
- REFCONSUMERACCOUNT → MDM_SHR_SERVICECONN.CAN (consumer identifier)
- STATUS → LKP_DISCONN_STATUS.CODE or LKP_CONNECTION_STATUS.CODE
- Service connection references → MDM_SHR_SERVICECONN.PKEY

**Example mappings:**
```
RBS_DISCONN_REQUEST 
  → RBS_DISCONNATION_ORDER (via PKEY)
  → MDM_SHR_SERVICECONN (via REFCONSUMERACCOUNT = CAN)
  → LKP_DISCONN_STATUS (via STATUS = CODE)

RBS_CONNECTIONLEDGER_MONTHLY
  → MDM_SHR_SERVICECONN (via CAN)
  → MDM_SHR_CONSUMER (via consumer lookup)
```

### Step 5: Document in Markdown

Use this structure (from `docs/step-1_segregation-approach.md`):

```markdown
## MODULE 2: RBS (Revenue Billing System)

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use | Typical Join Targets |
|---|---|---|---|---|
| [table name] | [count] | [purpose] | [primary use] | [join targets] |

### MAYBE Tables
| Table Name | Condition to Use | Purpose | Typical Join Targets |
|---|---|---|---|
| [table name] | [condition] | [purpose] | [join targets] |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| [table name] | [reason] | [category] |

### Join Hints for Phase 2 Discovery (RBS Module)
| Main Table | Typical Join Targets | Why They're Related |
|---|---|---|
| [main table] | [targets] | [explanation] |
```

### Step 6: Validate with Sample Questions

Test your classification with these business questions (from the 16-question test data):

1. "List consumer accounts with more than one disconnection request and linked orders"
   - Tables needed: RBS_DISCONN_REQUEST (REQUIRED), RBS_DISCONNATION_ORDER (order link), MDM_SHR_SERVICECONN (consumer account)
   - Your classification must support this query

2. "List requests created with disconnection date in September 2024. Show top 10 records only"
   - Tables needed: RBS_DISCONN_REQUEST (REQUIRED), possibly status lookups
   - Your classification must work

3. "Show rate for each tanker capacity by category"
   - If this touches RBS tables, ensure your classification includes needed lookup tables

If any test question fails because a table you classified as NOT-REQUIRED is needed, **reclassify it to MAYBE**.

---

## Important Rules

### Rule 1: RBS Shares Tables with MCC and SHARED
- MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER are shared with MCC and SHARED modules
- Don't re-classify them (they're already in MCC's output)
- BUT document them as join targets in your RBS tables

### Rule 2: Watch for Order/Related Tables
- RBS_DISCONNATION_ORDER is a critical table for disconnection analysis
- RBS_CONNECTIONLEDGER tables are billing-specific and REQUIRED
- Ensure you capture all main transactional families

### Rule 3: Don't Over-Exclude
- If unsure, classify as MAYBE
- It's easier to remove later than add back

### Rule 4: Document Evidence
- For any NOT-REQUIRED table, explain why: "TMP_ prefix, 0 rows" ✓ Good
- "Seems legacy" ✗ Not enough

### Rule 5: Join Hints Enable Parallel Discovery
- When Phase 2 queries RBS_DISCONN_REQUEST, it will fetch RBS_DISCONNATION_ORDER + MDM_SHR_SERVICECONN + LKP_DISCONN_STATUS in parallel
- This reduces discovery from 8-10 seconds to 2-3 seconds

---

## Deliverable

**APPEND to existing file:**
```
docs/final_docs/db-table-classification.md
```

(The MCC section should already be there. You ADD the RBS section below it.)

**Format:** Include RBS module section (REQUIRED + MAYBE + NOT-REQUIRED + Join Hints).

**Update the summary table at the top to include:**
```markdown
## SUMMARY: 2 Modules Complete

| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total |
|---|---|---|---|---|
| MCC    | X       | Y      | Z            | X+Y+Z |
| RBS    | X       | Y      | Z            | X+Y+Z |
| SHARED | -       | -      | -            | -     |
```

---

## Expected Output Example

```markdown
## MODULE 2: RBS (Revenue Billing System) - COMPLETE

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use | Typical Join Targets |
|---|---|---|---|---|
| RBS_DISCONN_REQUEST | 5,120,000 | Disconnection request master | Filter by date, status, consumer | RBS_DISCONNATION_ORDER, MDM_SHR_SERVICECONN, LKP_DISCONN_STATUS |
| RBS_CONNECTIONLEDGER_MONTHLY | 52,340,000 | Monthly billing transactions | Analyze payment activity, bills | MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER |
| LKP_DISCONN_STATUS | 8 | Disconnection status codes | Map STATUS to status names | (Lookup - joined TO by RBS_DISCONN_REQUEST) |
| ... | ... | ... | ... | ... |

### MAYBE Tables
| Table Name | Condition to Use | Purpose | Typical Join Targets |
|---|---|---|---|
| RBS_DISCONNATION_ORDER | When analyzing disconnection orders | Order details for disconnection request | RBS_DISCONN_REQUEST |
| LKP_CONNECTION_STATUS | When analyzing connection statuses | Status code meanings | (Lookup) |
| ... | ... | ... | ... |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| RBS_CONNECTIONLEDGER_BUG6567 | Backup for bug fix, 0 rows, stale | Backup |
| RBS_DISCONN_PROGRAM | Legacy program tracking, rarely used | Legacy |
| ... | ... | ... |

### Join Hints for Phase 2 Discovery (RBS Module)

| Main Table | Typical Join Targets | Why They're Related |
|---|---|---|
| RBS_DISCONN_REQUEST | RBS_DISCONNATION_ORDER, MDM_SHR_SERVICECONN, LKP_DISCONN_STATUS | All required for complete disconnection detail |
| RBS_CONNECTIONLEDGER_MONTHLY | MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER | Required to map billing to consumer |
| ... | ... | ... |

---

## Summary

| Classification | Count | Examples |
|---|---|---|
| REQUIRED | 6 | RBS_DISCONN_REQUEST, RBS_CONNECTIONLEDGER_MONTHLY, LKP_DISCONN_STATUS |
| MAYBE | 3 | RBS_DISCONNATION_ORDER, LKP_CONNECTION_STATUS |
| NOT-REQUIRED | 4 | RBS_CONNECTIONLEDGER_BUG6567, RBS_DISCONN_PROGRAM |
| **TOTAL** | **13** | All RBS_* tables |
```

---

## Tips for Efficiency

- Work table by table (don't try to classify all at once)
- Test your classification as you go (validate sample questions)
- Document evidence for every NOT-REQUIRED table
- Save to file incrementally (don't lose work)
- Estimate 30-40 minutes for this module

---

## Success Criteria

✓ All RBS tables classified (REQUIRED/MAYBE/NOT-REQUIRED)
✓ Join hints documented for each REQUIRED table
✓ Sample business questions would work with your classification
✓ RBS_DISCONN_REQUEST + RBS_DISCONNATION_ORDER + order analysis supported
✓ Evidence documented for each NOT-REQUIRED classification
✓ Output APPENDED to `docs/final_docs/db-table-classification.md` (not replaced)
✓ Summary table at top updated with RBS counts

---

## Next Steps After You Complete This

After you finish RBS classification:
1. Ping back to main task coordinator
2. Main task coordinator will then ask you (or another AI) to classify SHARED/Cross-Module tables
3. Then Phase 2 (Schema Documentation) begins

---

## Context for Phase 1

This is Phase 1 of a 4-phase optimization:
- Phase 1 (this task): Table classification + join hints
- Phase 2 (next): Schema docs + parallel discovery bundles
- Phase 3 (then): Join patterns + known issues
- Phase 4 (finally): Session learning

Your RBS classification enables Phase 2 to fetch all related schemas in parallel, reducing discovery time by 75-80%.

Good luck!
