# Prompt for AI Assistant: Phase 1 Classification - MCC Module

**Mission:** Classify all MCC (Metro Customer Care) module tables and document join hints for parallel discovery in Phase 2.

**Context:** 
- You are working on Phase 1 of a 4-phase database optimization strategy
- Previous AI agent classified MCC tables but didn't include join hints
- Join hints are critical for Phase 2 (they enable parallel schema discovery, which reduces query time from 1-2 min to 10-20 seconds)
- Your classification will be reused by every future AI query that touches MCC tables
- **Development-only:** This work is part of development; production deployment happens only after all 4 phases complete

---

## Your Task

Classify ALL MCC (Metro Customer Care) module tables into three buckets: REQUIRED, MAYBE, NOT-REQUIRED.

For REQUIRED and MAYBE tables, also document **Typical Join Targets** (the lookup/reference tables that are commonly joined to each table).

---

## Step-by-Step Process

### Step 1: Get All MCC Tables
Execute this query:
```sql
SELECT TABLE_NAME, NUM_ROWS, LAST_ANALYZED
FROM all_tables
WHERE TABLE_NAME LIKE 'MCC_%'
  AND OWNER = 'CTLHMWSSBTMP'
ORDER BY TABLE_NAME;
```

This will return all tables starting with `MCC_`. You should get ~25-40 tables. Document the list.

### Step 2: For Each MCC Table, Gather Evidence
For each table, run:
```sql
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_ID
FROM all_tab_columns
WHERE TABLE_NAME = '{TABLE_NAME}'
  AND OWNER = 'CTLHMWSSBTMP'
ORDER BY COLUMN_ID;
```

Look for:
- **Naming hints:** Does the name suggest transactional data (MCC_GRIEVANCES) or temporary/backup (MCC_*_BKP)?
- **Column patterns:** Are there mostly business columns (RECVDDATE, GRIEVANCETYPEID) or metadata columns (CREATED_BY, SESSION_ID)?
- **Key columns:** Does it have a PKEY or primary identifier?
- **Foreign keys:** Does it have columns that reference other tables (e.g., GRIEVANCETYPEID looks like a foreign key)?

### Step 3: Classify Each Table

**REQUIRED** ← Classify as REQUIRED if:
- It's a main transaction table (MCC_GRIEVANCES, MCC_CONSUMERS_CONNECTIONS, etc.)
- It's a core lookup table (MDM_MCC_COMPTYPE, LKP_GRIEVSTATUS, etc.)
- It has > 1000 rows (indicates real data, not temp)
- It doesn't have BKP, TMP, TEMP, ARCHIVE, or _BAK in its name

**MAYBE** ← Classify as MAYBE if:
- It's a lookup table but only used for specific analysis (e.g., MCC_TANKER_RATES)
- It's a historical or archival version of a main table (e.g., MCC_GRIEVANCES_HISTORY)
- It has 0 rows but the schema suggests it should have data (new but unpopulated)
- It's an enumeration or code table (LKP_*, MDM_MCC_*)

**NOT-REQUIRED** ← Classify as NOT-REQUIRED if:
- It has TMP_, TEMP_, TBL_, STG_ prefix → Temporary/staging
- It has _BKP, _BAK, _ARCHIVE, _OLD suffix → Backup/archive
- It has _AUDIT, _LOG suffix → Audit/logging
- It's a MLOG$* or RUPD$* table → Oracle internal replication
- It has zero rows AND the name suggests it's temporary (TMP_*, TEMP_*)
- The schema is entirely metadata columns (no business data)

### Step 4: Identify Typical Join Targets

For each REQUIRED or MAYBE table, identify which tables it typically joins to:

**How to identify joins:**
1. Look at column names that suggest foreign keys (e.g., GRIEVANCETYPEID → looks like it references MDM_MCC_COMPTYPE.CODE)
2. Run a quick validation query:
```sql
SELECT * FROM {TABLE_NAME} LIMIT 1;
```
Look at the data and infer what tables would provide context (e.g., MCC_GRIEVANCES has GRIEVANCETYPEID, so it would join to a complaint type lookup)

3. Document the join targets in a table like this:

```markdown
| Table Name | Typical Join Targets | Why They're Related |
|---|---|---|
| MCC_GRIEVANCES | MDM_MCC_COMPTYPE, MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER, LKP_GRIEVSTATUS | All needed for complete grievance detail |
| MCC_TANKER_RATES | (None - this is a lookup table) | Lookup table, joined TO by other tables |
```

### Step 5: Document in Markdown

Use this structure (from `docs/step-1_segregation-approach.md`):

```markdown
## MODULE 1: MCC (Metro Customer Care)

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use | Typical Join Targets |
|---|---|---|---|---|
| MCC_GRIEVANCES | [actual count] | [purpose] | [primary use] | [join targets] |
| [next table] | ... | ... | ... | ... |

### MAYBE Tables
| Table Name | Condition to Use | Purpose | Typical Join Targets |
|---|---|---|---|
| [table name] | [when to use] | [purpose] | [join targets] |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| [table name] | [reason] | [category: Backup/Temp/Log/etc] |

### Join Hints for Phase 2 Discovery (MCC Module)
| Main Table | Typical Join Targets | Why They're Related |
|---|---|---|
| [main table] | [target1, target2, ...] | [brief explanation] |
```

### Step 6: Validate with Sample Questions

Test your classification with these business questions (from `docs/step-1_segregation-approach.md`):

1. "Show grievances by type and status in March 2025"
   - Tables needed: MCC_GRIEVANCES (REQUIRED?), MDM_MCC_COMPTYPE (lookup?), LKP_GRIEVSTATUS (lookup?)
   - Your classification should include all three

2. "Top 5 consumers with highest complaints"
   - Tables needed: MCC_GRIEVANCES (REQUIRED?), MDM_SHR_SERVICECONN (to map CAN)
   - Your classification should support this

3. "Tanker requests by quarter 2023"
   - Tables needed: MCC_GRIEVANCES (REQUIRED?), MCC_TANKER_RATES (optional lookup?)
   - Your classification should allow both

If any test question fails because a table you classified as NOT-REQUIRED is needed, **reclassify it to MAYBE**.

---

## Important Rules

### Rule 1: Don't Over-Exclude
- If unsure, classify as MAYBE (not NOT-REQUIRED)
- It's easier to remove a table later than add one back
- Better to include and ignore than exclude and miss

### Rule 2: Document Your Evidence
For any table you classify as NOT-REQUIRED, explain WHY:
- "TMP_ prefix, 0 rows, schema is metadata-only" ✓ Good evidence
- "Seems unused" ✗ Not enough evidence

### Rule 3: Join Hints Are For Phase 2
- Join hints help the next phase know which tables to fetch in parallel
- Example: When querying MCC_GRIEVANCES, Phase 2 will fetch MDM_MCC_COMPTYPE + MDM_SHR_SERVICECONN + LKP_GRIEVSTATUS all at once (parallel) instead of one by one (sequential)
- This reduces discovery time from 8-10 seconds to 2-3 seconds

### Rule 4: Don't Hardcode for Specific Questions
- Classify tables based on general usability, not the 16 test questions
- Your classification should work for ANY MCC question, not just the ones we tested

---

## Deliverable

Save your output to:
```
docs/final_docs/db-table-classification.md
```

Format: Include the MCC module section (REQUIRED + MAYBE + NOT-REQUIRED + Join Hints) as shown in Step 5.

**Example of what the output should look like:**

```markdown
# Database Table Classification by Module

## MODULE 1: MCC (Metro Customer Care) - COMPLETE

### REQUIRED Tables
| Table Name | Row Count | Purpose | Primary Use | Typical Join Targets |
|---|---|---|---|---|
| MCC_GRIEVANCES | 25,450,000 | Main complaint/grievance data | Filter by date, type, status, consumer | MDM_MCC_COMPTYPE, MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER, LKP_GRIEVSTATUS |
| MDM_MCC_COMPTYPE | 12 | Complaint type lookup | Map GRIEVANCETYPEID to type names | (Lookup - joined TO by MCC_GRIEVANCES) |
| MCC_CONSUMERS_CONNECTIONS | 3,240,000 | Consumer-connection link | Link consumer to service connections | MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER |
| LKP_GRIEVSTATUS | 7 | Grievance status codes | Map GRIEVSTATUS to status names | (Lookup - joined TO by MCC_GRIEVANCES) |
| ... | ... | ... | ... | ... |

### MAYBE Tables
| Table Name | Condition to Use | Purpose | Typical Join Targets |
|---|---|---|---|
| MCC_TANKER_RATES | When analyzing tanker costs | Tanker pricing by capacity/category | (Lookup table) |
| MCC_GRIEVANCES_HISTORY | For historical analysis | Past grievance data | MCC_GRIEVANCES, MDM_MCC_COMPTYPE |
| ... | ... | ... | ... |

### NOT-REQUIRED Tables
| Table Name | Reason Excluded | Category |
|---|---|---|
| MCC_GRIEVANCES_BKP | Backup table, 0 rows, stale data | Backup |
| MCC_TANKERGRIEVANCE_TEMP | Temporary working table, TMP_ prefix, 0 rows | Temp/staging |
| ... | ... | ... |

### Join Hints for Phase 2 Discovery (MCC Module)

**When Phase 2 queries MCC_GRIEVANCES, it should fetch these in parallel:**

| Main Table | Typical Join Targets | Why They're Related |
|---|---|---|
| MCC_GRIEVANCES | MDM_MCC_COMPTYPE, MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER, LKP_GRIEVSTATUS | All required for complete grievance detail (type names, consumer info, status descriptions) |
| MCC_CONSUMERS_CONNECTIONS | MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER | All required for complete connection/consumer mapping |
| ... | ... | ... |

---

## Summary

| Classification | Count | Examples |
|---|---|---|
| REQUIRED | 5 | MCC_GRIEVANCES, MDM_MCC_COMPTYPE, LKP_GRIEVSTATUS, MCC_CONSUMERS_CONNECTIONS |
| MAYBE | 3 | MCC_TANKER_RATES, MCC_GRIEVANCES_HISTORY |
| NOT-REQUIRED | 5 | MCC_GRIEVANCES_BKP, MCC_TANKERGRIEVANCE_TEMP, etc |
| **TOTAL** | **13** | All MCC_ tables |
```

---

## Questions to Ask Yourself While Classifying

**For every table, ask:**
1. "Would a business user ask a question that requires this table?" 
   - YES → REQUIRED or MAYBE
   - NO → NOT-REQUIRED

2. "Does this table have real business data or is it metadata/logging/temp?"
   - Business data → REQUIRED or MAYBE
   - Metadata/logging/temp → NOT-REQUIRED

3. "If someone asks 'top grievances by type', will my classification work?"
   - If it needs MCC_GRIEVANCES + lookup tables → those must be REQUIRED or MAYBE
   - If backup tables are excluded → good, they should be NOT-REQUIRED

4. "What tables would Phase 2 need to fetch in parallel with this one?"
   - Those are the "Typical Join Targets"

---

## Tips for Efficiency

- **Don't re-check:** Once you classify a table, move on (no second-guessing)
- **Document as you go:** Fill in the markdown table row by row
- **Test as you go:** After every 5-10 tables, validate against the sample questions
- **Save incrementally:** Save your progress to the output file (don't lose work)

---

## Success Criteria

✓ All MCC tables are classified (REQUIRED/MAYBE/NOT-REQUIRED)
✓ Join hints are documented for each REQUIRED table
✓ Sample business questions (grievances by type, top consumers, tanker requests) would work with your classification
✓ NO NOT-REQUIRED tables are actually needed for those sample questions
✓ Evidence is documented for each NOT-REQUIRED classification
✓ Output saved to `docs/final_docs/db-table-classification.md`

---

## Context Notes

This is Phase 1 of a 4-phase optimization strategy:
- **Phase 1** (this task): Table classification + join hints
- **Phase 2** (next): Schema documentation + parallel discovery bundles
- **Phase 3** (then): Join patterns + known issues + templates
- **Phase 4** (finally): Session learning + pattern refinement

Your work here enables Phase 2 to:
- Fetch schemas for all related tables in parallel (not sequential)
- Reduce discovery time from 16-20 seconds to 2-3 seconds
- Improve first-attempt success rate from 60-70% to 95%+

**Time estimate:** 30-40 minutes for this task  
**Effort:** Straightforward classification + minimal testing

Good luck!
