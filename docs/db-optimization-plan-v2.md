# Complete Database Optimization Strategy - 4 Phases (Revised)

**Status:** Implementation Ready  
**Version:** 2.0 (Updated for parallel query execution + development-only phases)  
**Objective:** Reduce query failures from 30-40% to <5%, decrease iterations from 5-6 to 1-2, improve response time from 3-5 minutes to <15 seconds

---

## What This Plan Solves

### Current Problems
- 30-40% of queries fail on first attempt
- Average 4-6 iterations per user question
- 30-50% of time spent on schema discovery, not data retrieval
- **Key discovery bottleneck:** AI makes sequential discovery queries (column list → join keys → enum values) instead of parallel
- Repeated mistakes (wrong join columns, empty lookups, wrong tables)
- No learning between sessions

### Desired State (After All 4 Phases in Production)
- <5% query failure rate (95%+ success)
- 1-2 iterations per question (60% reduction)
- 5-10 second response time (80-90% faster)
- Zero schema discovery time (pre-documented)
- **Parallel query capability:** AI can fetch multiple lookups simultaneously (reduces discovery from 3-5 sequential queries to 1 parallel batch)
- Learning compounds across sessions (failures stored, patterns reused)

---

## Key Insight: Discovery Delay is Sequential, Not Just Frequent

Analysis of 16-question test reveals the root cause:

**Current bottleneck:**
```
AI Question: "Top consumers with most complaints"
1. Query: SELECT * FROM all_tab_columns WHERE table='MCC_GRIEVANCES' (2s)
2. Query: What columns join to consumer? (2s)
3. Query: What's the enum for status? (2s)
4. Query: Sample data check (2s)
5. Query: Run actual business query (1s)
Total: 9 seconds of discovery + 1 second of actual work
```

**Solution: Parallel discovery**
```
AI Question: "Top consumers with most complaints"
1. PARALLEL queries (all at once):
   - Get MCC_GRIEVANCES structure
   - Get join targets (MDM_SHR_SERVICECONN, MDM_MCC_COMPTYPE)
   - Get enum/status lookups
   (Total wait: 2s instead of 8s)
2. Query: Run actual business query (1s)
Total: 3 seconds instead of 9 seconds
```

---

## 4-Phase Implementation Strategy (Revised)

### PHASE 1: Table Segregation & Classification

**Duration:** 20-30 minutes (one-time)  
**Goal:** Classify all tables, reduce scope from 500+ to ~100  
**Output:** `db-table-classification.md`

#### What It Does
- Separates all tables into 3 buckets: REQUIRED, MAYBE, NOT-REQUIRED
- Eliminates wasted queries on empty/temp/backup tables
- Identifies which module families solve which problem domains
- **NEW:** For each REQUIRED table, list all related lookup tables that typically join to it

#### How It Works
1. Get all tables from Oracle database
2. Classify by naming pattern (MDM_*, MCC_*, RBS_*, TBL_*, TMP_*, EIF_*, etc.)
3. For each REQUIRED table, identify its typical join targets
4. Validate with sample business questions
5. Document decisions grouped by module

#### Key Classification Rules
- **REQUIRED:** All main transaction tables (MCC_GRIEVANCES, MDM_SHR_CONSUMER, etc.), all core lookups
- **MAYBE:** Optional lookups (division, type), historical tables
- **NOT-REQUIRED:** TMP_*, TBL_*, *_BKP*, *_LOG*, MLOG$*, EIF_*, WRR$*

#### NEW Addition: Join Target Hints
For each REQUIRED table, document its typical join targets:

```markdown
## MCC_GRIEVANCES (REQUIRED)

**Typical Join Targets (pre-load these when querying grievances):**
- MDM_MCC_COMPTYPE (for complaint type names)
- MDM_SHR_SERVICECONN (for consumer/location details)
- MDM_SHR_CONSUMER (for consumer names)
- LKP_GRIEVSTATUS (for status code meanings)

**Why this helps:** When querying grievances, AI can dispatch parallel schema discovery for all 4 lookup tables at once, instead of discovering each join target sequentially.
```

#### Immediate Benefit
- No more "table doesn't exist" queries
- No more joining to empty lookup tables
- 30-40% reduction in total queries per question
- **NEW:** Enables AI to batch-query all join targets simultaneously (reduces discovery time by 60%)

---

### PHASE 2: Schema Definition & Documentation

**Duration:** 30-40 minutes (one-time)  
**Goal:** Pre-document all columns, enums, join keys, and data types  
**Output:** `db-schema-reference.md`

#### What It Does
- Documents EVERY column in REQUIRED + MAYBE tables
- Captures data types, sample values, enumerations
- Maps foreign keys and join paths (exact column pairs)
- Documents business rule filters (how to express "unresolved", "inactive", etc.)
- Documents view grain and cardinality warnings
- **NEW:** Organizes by "discovery bundles" for parallel loading

#### How It Works

For each REQUIRED + MAYBE table, document:

```markdown
## MCC_GRIEVANCES

### Table Metadata
- Row Count: 25,000,000
- Purpose: Main complaint/grievance transaction table
- Last Analyzed: 2025-05-09

### Quick Filter Guide (for AI to understand business semantics)
| Business Term | SQL Filter | Example |
|---|---|---|
| Unresolved | RECTIFIEDDATE IS NULL | WHERE RECTIFIEDDATE IS NULL |
| Received in month X | EXTRACT(MONTH FROM RECVDDATE) = X | WHERE EXTRACT(MONTH FROM RECVDDATE) = 3 |
| Tanker request | TANKERQTY > 0 | WHERE TANKERQTY > 0 |

### Columns
| Column | Data Type | Foreign Key | Enum | Purpose | Sample |
|---|---|---|---|---|---|
| RECVDDATE | DATE | - | - | When grievance received | 2025-04-15 |
| GRIEVANCETYPEID | NUMBER | MDM_MCC_COMPTYPE.CODE | 1-12 | Complaint type code | 5 |
| RECTIFIEDDATE | TIMESTAMP(4) | - | - | When resolved (NULL if unresolved) | 2025-04-20 14:30:45 |
| GRIEVSTATUS | NUMBER | LKP_GRIEVSTATUS.CODE | 1=New, 2=InProgress, 3=Resolved, 4=Reopened, 5=OnHold, 6=Closed, 7=Pending | Status code | 3 |
| CONSUMERREF | NUMBER | MDM_SHR_SERVICECONN.CAN | - | Link to service connection | 614214860 |
| TANKERQTY | NUMBER | - | 0=No, 1-3=Tanker tier | Tanker quantity tier | 2 |
| DIVISIONREF | NUMBER | MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV.DIVNOUID | - | Division code (WARNING: view is area-grain, use DISTINCT) | 15 |

### Join Paths (for AI to use in parallel discovery)
| To Table | Join Key(s) | Use When |
|---|---|---|
| MDM_MCC_COMPTYPE | GRIEVANCETYPEID = CODE | Showing complaint type names |
| MDM_SHR_SERVICECONN | CONSUMERREF = CAN | Showing consumer/location details |
| MDM_SHR_CONSUMER | via CONSUMERREF→CAN→CONSUMERPKEY | Showing consumer names/contact |
| LKP_GRIEVSTATUS | GRIEVSTATUS = CODE | Showing status names |
| MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV | DIVISIONREF = DIVNOUID | Showing division/circle names (WARNING: area-grain, deduplicate) |

### Known Issues & Workarounds
- **Issue:** DIVISIONREF joins return multiple rows (view is at area granularity)
  - **Solution:** Use `SELECT DISTINCT DIVNOUID, DIVNNAME FROM MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV` before joining
- **Issue:** RECTIFIEDDATE is TIMESTAMP but RECVDDATE is DATE (type mismatch in arithmetic)
  - **Solution:** Cast DATE to TIMESTAMP: `EXTRACT(DAY FROM (RECTIFIEDDATE - CAST(RECVDDATE AS TIMESTAMP)))`
- **Issue:** TANKERQTY values (1,2,3) don't represent litres; they're pricing tiers
  - **Solution:** Use TANKERQTY only for tier identification, not calculations

### Parallel Discovery Bundle
**When querying grievances, AI should simultaneously fetch:**
- This table's structure (columns, types)
- All 4 join targets' structures (MDM_MCC_COMPTYPE, MDM_SHR_SERVICECONN, LKP_GRIEVSTATUS, etc.)
- Status/enum lookups for each join target
- **Result:** One parallel batch query instead of 5-8 sequential queries
```

#### Key Information Captured
- **Data types:** VARCHAR, NUMBER, DATE, FLOAT, TIMESTAMP with precision
- **Foreign keys:** Exact column pairs for joins
- **Enumerations:** All status/code values with human-readable meanings
- **Business rules:** How to operationally interpret business terms ("unresolved", "inactive", "tanker request")
- **Cardinality warnings:** Which views/tables have multi-row-per-entity grain
- **Sample values:** What real data looks like

#### NEW: Discovery Bundles for Parallel Execution
```markdown
## Discovery Bundles (for parallel schema fetching)

### Bundle: MCC Grievance Query
When an AI detects "grievance" + "by type/status/consumer" pattern:

**Dispatch these 4 queries in PARALLEL (all at once):**
1. `SELECT column_name, data_type FROM all_tab_columns WHERE table='MCC_GRIEVANCES'`
2. `SELECT column_name, data_type FROM all_tab_columns WHERE table='MDM_MCC_COMPTYPE'`
3. `SELECT column_name, data_type FROM all_tab_columns WHERE table='MDM_SHR_SERVICECONN'`
4. `SELECT code, meaning FROM LKP_GRIEVSTATUS` (actual lookup data)

**Wait for all 4 to complete (parallel: ~2s instead of sequential: ~8s)**

**Then:** Use combined schema + lookups to write the business query

### Bundle: RBS Disconnection Query
When an AI detects "disconnection" + "order" pattern:

**Dispatch these 3 queries in PARALLEL:**
1. `SELECT column_name FROM all_tab_columns WHERE table='RBS_DISCONN_REQUEST'`
2. `SELECT column_name FROM all_tab_columns WHERE table='RBS_DISCONNATION_ORDER'`
3. `SELECT column_name FROM all_tab_columns WHERE table='MDM_SHR_SERVICECONN'`

**Wait for all 3 to complete (parallel: ~2s)**

**Then:** Construct the multi-table join with confidence
```

#### Immediate Benefit
- No more sequential "what columns exist?" queries
- No more "what does status 6 mean?" confusion
- 15% reduction in total queries per question
- **NEW:** Parallel discovery reduces wait time by 60-75% (from 8-10 seconds to 2-3 seconds)

---

### PHASE 3: Data Flow, Relationship Mapping & Query Templates

**Duration:** 20-30 minutes (one-time)  
**Goal:** Document all proven join patterns and known issues  
**Output:** `db-data-flow.md`

#### What It Does
- Documents all proven join patterns (with exact column pairs)
- Lists common join mistakes and workarounds
- Pre-builds query templates for frequent patterns
- Captures known issues and their solutions
- **NEW:** Organizes templates by question pattern (not by table)

#### How It Works

**Part A: Join Patterns (organized by question type, not table)**

```markdown
## Pattern: "Top N by Category" (used in 30% of questions)

**Pattern:** Grievances/Disconnections/Requests grouped by type/status/consumer

**Tables involved:** 
- Main transaction (MCC_GRIEVANCES, RBS_DISCONN_REQUEST)
- Lookup (MDM_MCC_COMPTYPE, LKP_GRIEVSTATUS)

**Template:**
```sql
SELECT {CATEGORY_COLUMN}.{DISPLAY_COLUMN}, COUNT(*) as count
FROM {MAIN_TABLE} t
LEFT JOIN {LOOKUP_TABLE} l ON t.{FK_COLUMN} = l.{PK_COLUMN}
WHERE t.{DATE_COLUMN} >= DATE '{START_DATE}'
  AND t.{DATE_COLUMN} < DATE '{END_DATE}'
GROUP BY {CATEGORY_COLUMN}.{DISPLAY_COLUMN}
ORDER BY count DESC
FETCH FIRST N ROWS ONLY;
```

**Variants:**
- Grievances by type: MCC_GRIEVANCES.GRIEVANCETYPEID → MDM_MCC_COMPTYPE.CODE
- Grievances by status: MCC_GRIEVANCES.GRIEVSTATUS → LKP_GRIEVSTATUS.CODE
- Disconnections by status: RBS_DISCONN_REQUEST.STATUS → LKP_DISCONN_STATUS.STATUS_CODE

**Data types to watch:**
- Status columns are often NUMBER or VARCHAR (check before joining)
- Date columns vary (DATE vs TIMESTAMP) — cast if mixing arithmetic
---

## Pattern: "Entity Details Lookup" (used in 20% of questions)

**Pattern:** Get all attributes of a specific entity (consumer, connection, grievance)

**Tables involved:** 
- Main entity table (MDM_SHR_SERVICECONN, MDM_SHR_CONSUMER)
- Related detail tables (CONSUMER_ALTERNATE_CONTACT, MCC_CONSUMERS_CONNECTIONS)

**Template:**
```sql
SELECT sc.*, c.*, ca.*, cc.*
FROM MDM_SHR_SERVICECONN sc
LEFT JOIN MDM_SHR_CONSUMER c ON sc.CONSUMERPKEY = c.PKEY
LEFT JOIN CONSUMER_ALTERNATE_CONTACT ca ON sc.CAN = ca.CAN
LEFT JOIN MCC_CONSUMERS_CONNECTIONS cc ON sc.CAN = cc.CAN
WHERE sc.CAN = {CAN_NUMBER};
```

**Key join columns:**
- CAN is the primary consumer identifier (consistent across tables)
- CONSUMERPKEY in MDM_SHR_SERVICECONN links to MDM_SHR_CONSUMER.PKEY
- Don't assume all tables use PKEY — check each table's key column
---

## Pattern: "Multi-Table Aggregation with Location Hierarchy" (used in 15% of questions)

**Pattern:** Aggregate by location (circle, division, area)

**Tables involved:**
- Main data (MCC_GRIEVANCES, RBS_DISCONN_REQUEST)
- Location view (MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV)

**Template:**
```sql
SELECT NVL(loc.CIRCLENAME, 'UNKNOWN') AS circle,
       COUNT(*) as record_count
FROM {MAIN_TABLE} t
LEFT JOIN (
  SELECT DISTINCT {LOCATION_KEY}, {LOCATION_NAME}
  FROM MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV
) loc ON t.{LOCATION_REF} = loc.{LOCATION_KEY}
WHERE t.{DATE_COLUMN} >= DATE '{START_DATE}'
  AND t.{DATE_COLUMN} < DATE '{END_DATE}'
GROUP BY NVL(loc.CIRCLENAME, 'UNKNOWN')
ORDER BY record_count DESC;
```

**CRITICAL WARNING:** 
- MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV is at AREA grain (multiple rows per division/circle)
- Must use `SELECT DISTINCT` or GROUP BY will multiply counts
- Only join if you specifically need area-level detail

**Variants:**
- By circle: AREAID → AREAID, group by CIRCLENAME
- By division: DIVISIONREF → DIVNOUID, group by DISTINCT DIVNNAME
- By section: Use SECTIONID if available
```

**Part B: Known Issues & Workarounds**

```markdown
## Issue 1: View Cardinality Multiplication

**Tables:** MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV

**Problem:** 
This view has one row per AREA, not per DIVISION or CIRCLE. Joining directly causes count multiplication.

```
Example:
- If division "North" has 5 areas
- And you join MCC_GRIEVANCES to the view by DIVISIONREF
- Each grievance gets matched to all 5 area rows
- COUNT(*) becomes 5x larger than actual
```

**Solution:** 
Use DISTINCT to deduplicate location hierarchy before joining:
```sql
SELECT DISTINCT DIVNOUID, DIVNNAME FROM MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV
```

**When discovered:** Division complaint queries (multiple agents, May 2025)

---

## Issue 2: Data Type Mismatch in Date Arithmetic

**Tables:** MCC_GRIEVANCES

**Problem:**
- RECVDDATE is DATE type
- RECTIFIEDDATE is TIMESTAMP(4) type
- Subtracting them directly causes type coercion errors in some calculations

**Solution:**
Cast to matching type before arithmetic:
```sql
EXTRACT(DAY FROM (RECTIFIEDDATE - CAST(RECVDDATE AS TIMESTAMP)))
```

**When discovered:** Response time calculation queries (May 2025)

---

## Issue 3: Join Key Name Inconsistency

**Tables:** Multiple (MDM_SHR_SERVICECONN, CONSUMER_ALTERNATE_CONTACT, MDM_SHR_CONSUMER)

**Problem:**
Different tables use different column names for the same concept:
- Consumer primary key: sometimes PKEY, sometimes CONSUMERPKEY, sometimes CONSUMERID
- Service connection identifier: sometimes CAN, sometimes SERVICECONNECTIONID
- Don't assume naming conventions are consistent

**Solution:**
Always validate column names with `all_tab_columns` before joining. Document the exact join columns for each pair.

**When discovered:** Multiple consumer lookup queries (May 2025)

---

## Issue 4: Empty Lookup Tables

**Tables:** MDM_SHR_DIVISION, MDM_SHR_AREA (and others)

**Problem:**
Some lookup tables exist in the schema but contain zero rows (created but not populated).

**Solution:**
- Use alternative tables/views (e.g., MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV instead of MDM_SHR_DIVISION)
- Or query the numeric IDs directly without lookup
- Document which lookup tables are actually populated

**When discovered:** Division complaint analysis (May 2025)

---

## Issue 5: Tanker Quantity Semantics

**Tables:** MCC_GRIEVANCES, MCC_TANKER_RATES

**Problem:**
- TANKERQTY in MCC_GRIEVANCES (1, 2, 3) represents pricing TIER, not litre quantity
- TANKERQTY in MCC_TANKER_RATES is the same tier identifier
- Do NOT divide TANKERAMOUNT by TANKERQTY (this is a nonsensical calculation)
- Do NOT treat TANKERQTY as volume

**Solution:**
- Use TANKERQTY only to identify tanker request type (tier 1, 2, or 3)
- For actual litre amounts, query MCC_TANKER_RATES with the TANKERQTY value to get the quantity
- Or use a denormalized column if available (e.g., "Tanker Quantity in Litres")

**When discovered:** Tanker rate analysis (May 2025)
```

#### Immediate Benefit
- Copy-paste ready join templates (reduces query composition time by 50%)
- Known issues are pre-solved (avoids 25% of join failures)
- Question patterns are pre-mapped (AI recognizes "top N by category" = specific template)
- 20% reduction in query composition time

---

### PHASE 4: Session Learning & Pattern Refinement

**Duration:** Setup 10 min (one-time), 2-3 min per session (ongoing)  
**Goal:** Compound learning — reuse successes, avoid repeated failures  
**Output:** `db-session-learnings.md` (updated after each session)

#### What It Does
- Stores every query execution (success + failure)
- Captures why queries succeeded or failed
- Documents reusable patterns and edge cases
- Builds a searchable library of "how to answer X?"
- **NEW:** Tracks which discovery bundles and templates were most effective

#### How It Works

**After Every Question:**

```yaml
Query_ID: q_20250509_grievances_march_2025
User_Question: "Show grievances by type and status in March 2025"

## Classification & Planning Phase
Tables_Used: MCC_GRIEVANCES, MDM_MCC_COMPTYPE, LKP_GRIEVSTATUS
Pattern_Matched: "Top N by Category" (Pattern A)
Discovery_Bundle_Used: "MCC Grievance Query"

## Execution
Parallel_Queries_Executed: 4 (MCC_GRIEVANCES structure, MDM_MCC_COMPTYPE structure, LKP_GRIEVSTATUS structure, actual data)
Parallel_Query_Time: 2.1 seconds
Business_Query_Time: 1.2 seconds
Total_Time: 3.3 seconds

Status: ✓ SUCCESS (first attempt)
Rows_Returned: 15

## Query Executed
```sql
SELECT ct.COMPLAINTNAME AS complaint_type, 
       gs.GRIEVSTATUS AS status_code,
       COUNT(*) as count
FROM MCC_GRIEVANCES g
LEFT JOIN MDM_MCC_COMPTYPE ct ON g.GRIEVANCETYPEID = ct.CODE
LEFT JOIN LKP_GRIEVSTATUS gs ON g.GRIEVSTATUS = gs.CODE
WHERE EXTRACT(YEAR FROM g.RECVDDATE) = 2025
  AND EXTRACT(MONTH FROM g.RECVDDATE) = 3
GROUP BY ct.COMPLAINTNAME, gs.GRIEVSTATUS
ORDER BY ct.COMPLAINTNAME, count DESC;
```

## Analysis
Why_It_Worked:
- Used correct join keys (GRIEVANCETYPEID → CODE, not PKEY)
- Used correct date column (RECVDDATE, not CREATEDATE)
- Used correct status lookup (LKP_GRIEVSTATUS, not hardcoded values)
- Parallel discovery eliminated 5+ sequential schema queries

Template_Validation: YES
- "Top N by Category" pattern applies perfectly
- Column names exactly as documented in Phase 2
- No data type issues, no view cardinality problems

Reusable_Pattern: YES
- Can reuse for any month/year (just change date constants)
- Can apply to disconnections, tanker requests (same join pattern structure)
```

**Failure Tracking:**

```yaml
Query_ID: q_20250509_division_analysis (FAILED)

## Planning Phase
User_Question: "Complaints by division in March 2025"
Pattern_Matched: "Multi-Table Aggregation with Location Hierarchy" (Pattern C)
Discovery_Bundle_Used: "MCC Grievance Query"

## First Attempt
First_Query_Attempt: |
  SELECT loc.DIVNNAME, COUNT(*) FROM MCC_GRIEVANCES g
  LEFT JOIN MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV loc 
    ON g.DIVISIONREF = loc.DIVNOUID
  WHERE g.RECVDDATE >= DATE '2025-03-01'
  AND g.RECVDDATE < DATE '2025-04-01'
  GROUP BY loc.DIVNNAME

Error: Result counts appear 5-10x too large

Root_Cause: View cardinality issue documented in Phase 3, Issue 1
- MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV is area-grain
- Each division matched to multiple area rows
- COUNT(*) amplified by factor of area count per division

## Corrected Query
Corrected_Query: |
  SELECT loc.DIVNNAME, COUNT(*) FROM MCC_GRIEVANCES g
  LEFT JOIN (
    SELECT DISTINCT DIVNOUID, DIVNNAME
    FROM MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV
  ) loc ON g.DIVISIONREF = loc.DIVNOUID
  WHERE g.RECVDDATE >= DATE '2025-03-01'
  AND g.RECVDDATE < DATE '2025-04-01'
  GROUP BY loc.DIVNNAME

Status: ✓ FIXED on 2nd attempt
Time_To_Fix: 1m 24s (discovery + debugging)

Learning: 
- Phase 3 Issue #1 applies to this query pattern
- Always use DISTINCT when joining to location hierarchies at non-atomic grain
- This should be automatic for "Pattern C" queries
```

#### Session Statistics

After each session, capture:

```yaml
Session_ID: session_20250509
Date: 2025-05-09
Total_Questions_Answered: 12
Total_Queries_Executed: 13
Success_Rate: 92.3% (12/13)
Total_Session_Time: 42 seconds

## Performance Metrics
Avg_Time_Per_Question: 3.5 seconds
Discovery_Time_Per_Question: 2.1 seconds (parallel bundles)
Business_Query_Time_Per_Question: 1.4 seconds

Queries_By_Category:
  Single_Table_Aggregations: 4 queries → 100% success (avg 1.2s)
  Simple_Joins: 7 queries → 100% success (avg 2.8s)
  Complex_Multi_Table: 2 queries → 50% success (1 fix needed, avg 3.4s)

## Pattern Effectiveness
Patterns_Used:
  - "Top N by Category": 6 questions, 100% success (avg 2.2s)
  - "Entity Details Lookup": 3 questions, 100% success (avg 1.8s)
  - "Multi-Table Aggregation with Location Hierarchy": 2 questions, 50% success (avg 3.4s)
  - "New pattern (not in Phase 3)": 1 question, 0% success (required debugging)

Discovery_Bundles_Used:
  - "MCC Grievance Query": 9 times, avg parallel wait 2.1s
  - "RBS Disconnection Query": 3 times, avg parallel wait 1.9s

## Common Failure Modes (This Session)
  1. Location view cardinality (1 failure, documented in Phase 3 Issue 1)
  0 new failure modes discovered this session

## Patterns Learned
  - Q: "Grievances by type and status" → Use "Top N by Category" + MCC Grievance Discovery Bundle (3.2s)
  - Q: "Consumer details" → Use "Entity Details Lookup" pattern (1.8s)
  - Q: "By circle/area" → Use "Multi-Table Aggregation" + DISTINCT wrapper (3.4s before fix, 2.8s after)
  - Q: "Unresolved grievances" → Business rule filter: RECTIFIEDDATE IS NULL (documented in Phase 2)

## Phase Document Updates Needed (for next session)
  - None required (all issues covered by Phase 3 documentation)
  - Consider adding "Complex Multi-Table Aggregation with Location Hierarchy + Time Buckets" as Pattern D (1 new question pattern encountered)
```

#### Immediate Benefit
- Copy-paste successful queries from library (reduces composition time by 50-70%)
- Know in advance that location views need DISTINCT (prevents 1-2 minute debugging)
- Avoid making same mistake twice (learning persists across sessions)
- Compound learning: each session makes next session faster
- **NEW:** Track which discovery bundles are most effective (optimize for future AI)

---

## Implementation Timeline (Development Only)

| Phase | Task | Deliverable | Effort | Dependencies |
|---|---|---|---|---|
| **1** | Table Segregation + Join Hints | db-table-classification.md | 30 min | None |
| **2** | Schema Docs + Discovery Bundles | db-schema-reference.md | 45 min | Phase 1 |
| **3** | Join Patterns + Known Issues | db-data-flow.md | 30 min | Phase 2 |
| **4a** | Learning System Setup | db-session-learnings.md (template) | 10 min | Phase 3 |
| **4b** | Ongoing Learning | Update per session | 2-3 min/session | Phase 4a |

**Total Development Time:** ~2 hours  
**Ongoing Maintenance:** 2-3 minutes per session (development only)

**PRODUCTION DEPLOYMENT:** After ALL 4 phases complete and validated

---

## Expected Improvements (After All Phases Complete)

### Before Optimization
| Metric | Value |
|---|---|
| Queries per question | 4-6 |
| Failures per question | 1-2 |
| Failure rate | 30-40% |
| Discovery overhead | 30-50% of time |
| Time per question | 2-4 minutes |
| Success rate | 60-70% |

### After All 4 Phases (Production)
| Metric | Value |
|---|---|
| Queries per question | 1-2 |
| Failures per question | 0-0.2 |
| Failure rate | <5% |
| Discovery overhead | <5% of time |
| Time per question | 10-20 seconds |
| Success rate | 95-98% |

### Key Levers Driving Improvement
1. **Phase 1:** Eliminate table-discovery queries (-40% queries) + enable join hint lookup
2. **Phase 2:** Eliminate sequential column discovery via parallel bundles (-60% discovery time)
3. **Phase 3:** Pre-solve join failures + template matching (-25% failures)
4. **Phase 4:** Reuse success patterns, avoid repeated failures (-50% composition time)

**Combined effect:** 3-8x faster answers + 95%+ success rate

---

## How AI Uses These Documents in Production

### Discovery Phase (Parallel Execution)
```
1. AI reads question: "Top consumers with most complaints in March 2025"

2. AI checks Phase 1 classification:
   → Identifies MCC module, knows MCC_GRIEVANCES is REQUIRED
   → Knows typical join targets: MDM_MCC_COMPTYPE, MDM_SHR_SERVICECONN

3. AI checks Phase 2 discovery bundles:
   → Finds "MCC Grievance Query" bundle
   → Dispatches 4 parallel schema queries (all at once)
   
4. While waiting for parallel results (2s), AI checks Phase 3:
   → Finds "Top N by Category" pattern
   → Identifies exact template and variants
   
5. Parallel discovery completes, AI has:
   - Column names and types
   - Join keys (GRIEVANCETYPEID → CODE)
   - Business filter (CONSUMERREF for consumer)
   
6. AI writes query using template + discovered schema (instant)

7. AI executes and gets result (1-2s)

Total time: 3-4 seconds (vs 1-2 minutes without optimization)
```

### Error Prevention Phase
```
1. AI checks Phase 3 before executing any multi-table query:
   
   Question: "Grievances by division"
   
   AI matches to "Multi-Table Aggregation with Location Hierarchy" pattern
   AI reads Issue #1: View cardinality warning
   AI automatically wraps location view with DISTINCT
   
   Result: Correct counts on first attempt (avoids 1-2 minute debugging)
```

### Learning Phase
```
1. After each question, AI logs to Phase 4:
   - Which pattern was used
   - Which discovery bundle was effective
   - Any issues encountered
   - Total time breakdown

2. Session learnings inform next session:
   - "This pattern was used 3 times this session, always worked" → increase confidence
   - "This new question type matches neither Pattern A nor B" → escalate to Phase 4 for pattern addition
   - "Discovery bundle X was 20% slower than Y" → track for optimization
```

---

## Why This Strategy Works

### Addresses Root Causes (Measured from 16-Question Test)
- **Cause:** Schema discovery takes 30-50% of time → **Phase 2 + Parallel Discovery Bundles solve:** Fetch all related schema in 1 parallel batch instead of 5-8 sequential queries
- **Cause:** Join keys are hard to discover → **Phase 2 + Phase 3 solve:** Pre-document all join pairs and validate with templates
- **Cause:** Business rule interpretation varies → **Phase 2 Business Rules solve:** Standardize how to identify "unresolved", "tanker request", etc.
- **Cause:** View cardinality causes wrong results → **Phase 3 Known Issues solve:** Pre-warn about location view grain, provide DISTINCT wrapper
- **Cause:** Same mistakes repeated → **Phase 4 solves:** Log failures, update documentation, avoid recurrence
- **Cause:** Query composition takes time → **Phases 1-3 solve:** Provide templates, eliminate discovery

### Compounds Over Time
- **Day 1 (Phases 1-2):** 3-4x faster answers, 80% success
- **Day 2 (Phase 3):** 4-5x faster answers, 90% success (patterns are known, known issues are prevented)
- **Week 1+ (Phase 4):** 5-8x faster answers, 95%+ success (learning compounds, edge cases documented)

### Generalizes to Any Question (Not Hardcoded)
- New question type doesn't match existing patterns? → Add new pattern to Phase 3 (stays reusable)
- New field/table discovered? → Document in Phase 2 (helps all future questions)
- New failure mode? → Log in Phase 4, escalate to Phase 3 (prevent recurrence)

---

## Production Deployment Readiness Checklist

Phase 1 Complete?
- [ ] All tables classified (REQUIRED/MAYBE/NOT-REQUIRED)
- [ ] Join targets identified for each REQUIRED table
- [ ] Classification validated against sample questions

Phase 2 Complete?
- [ ] All columns documented for REQUIRED tables
- [ ] All columns documented for MAYBE tables (at least primary ones)
- [ ] Business rule filters documented (at least 3-5 per module)
- [ ] Discovery bundles identified and validated
- [ ] Data type mismatches documented

Phase 3 Complete?
- [ ] At least 5-10 proven join patterns documented
- [ ] At least 5-8 known issues with solutions documented
- [ ] All warnings (view cardinality, type mismatch, empty lookups) included
- [ ] Query templates provided for each pattern

Phase 4 Complete?
- [ ] At least 50+ questions logged and learned
- [ ] Success rate ≥95% on known patterns
- [ ] Edge cases documented and resolved
- [ ] No new failure modes in last 20 questions

Only when ALL checkboxes are complete → Deploy to production

---

## Next Steps

1. **Review & Approve Strategy** — Does this approach align with your constraints?
2. **Start Phase 1** — Execute table classification with join target hints (30 min)
3. **Move to Phase 2** — Build schema reference with discovery bundles (45 min)
4. **Move to Phase 3** — Document joins + issues + templates (30 min)
5. **Activate Phase 4** — Begin session learning (ongoing, 2-3 min/session)
6. **Validate before production** — Use checklist to confirm all phases ready
7. **Deploy** — Release optimized documentation + learning system to production

---

## Why Parallel Discovery Bundles Matter

From 16-question test analysis:
- **Sequential discovery:** 8-10 queries × 2s average = 16-20 seconds overhead
- **Parallel discovery (Phase 2):** 4 queries × 2s parallel wait = 2 seconds overhead
- **Improvement:** 8-10x faster discovery phase
- **Combined with Phase 3 templates:** Total time per question drops from 2-4 minutes to 10-20 seconds

This is why **Phase 2's Discovery Bundles are the critical optimization lever** — they enable AI to move from sequential discovery (the current bottleneck) to parallel discovery (the target state).
