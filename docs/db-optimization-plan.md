# Complete Database Optimization Strategy - 4 Phases

**Status:** Implementation Ready  
**Objective:** Reduce query failures from 30-40% to <5%, decrease iterations per question from 5-6 to 1-2, improve response time from 3-5 minutes to <15 seconds

---

## What This Plan Solves

### Current Problems
- 30-40% of queries fail on first attempt
- Average 4-6 iterations per user question
- 30-50% of time spent on schema discovery, not data retrieval
- Repeated mistakes (wrong join columns, empty lookups, wrong tables)
- No learning between sessions

### Desired State (After All 4 Phases)
- <5% query failure rate (95%+ success)
- 1-2 iterations per question (60% reduction)
- 5-10 second response time (80-90% faster)
- Zero schema discovery time (pre-documented)
- Learning compounds across sessions (failures are stored, patterns reused)

---

## 4-Phase Implementation Strategy

### PHASE 1: Table Segregation & Classification

**Duration:** 20-30 minutes (one-time)  
**Goal:** Classify all tables, reduce discovery overhead by 80%  
**Output:** db-table-classification.md

#### What It Does
- Separates all tables into 3 buckets: REQUIRED, MAYBE, NOT-REQUIRED
- Eliminates wasted queries on empty/temp/backup tables
- Pre-documents which tables solve which problem types

#### How It Works
1. Get all tables from Oracle database
2. Classify by naming pattern (MDM_*, MCC_*, RBS_*, TBL_*, TMP_*, EIF_*, etc.)
3. Validate with sample business questions
4. Document decisions in classification matrix

#### Key Classification Rules
- **REQUIRED:** All main transaction tables (MCC_GRIEVANCES, MDM_SHR_CONSUMER, etc.), all core lookups
- **MAYBE:** Optional lookups (division, type), historical tables
- **NOT-REQUIRED:** TMP_*, TBL_*, *_BKP*, *_LOG*, MLOG$*, EIF_*, WRR$*

#### Immediate Benefit
- No more "table doesn't exist" queries
- No more joining to empty lookup tables
- 30-40% reduction in total queries per question

#### See Also
Detailed methodology in `step-1_segregation-approach.md`

---

### PHASE 2: Schema Definition & Documentation

**Duration:** 30-40 minutes (one-time)  
**Goal:** Eliminate column-discovery queries (currently 15% of all queries)  
**Output:** db-schema-reference.md

#### What It Does
- Documents EVERY column in REQUIRED + MAYBE tables
- Captures data types, sample values, enumerations
- Maps foreign keys and join paths
- Pre-answers "what column holds X?" and "what are the status values?"

#### How It Works
For each REQUIRED + MAYBE table, document:

```yaml
Table: MCC_GRIEVANCES
Row_Count: 25,000,000
Purpose: Main complaint/grievance transaction table
Columns:
  RECVDDATE (DATE): When grievance was received [filter: EXTRACT(YEAR/MONTH)]
  RECTIFIEDDATE (DATE): When grievance was resolved [NULL if not resolved]
  GRIEVANCETYPEID (NUMBER): Foreign key to MDM_MCC_COMPTYPE.CODE [1-12 values]
  GRIEVSTATUS (NUMBER): Status code [1=New, 2=InProgress, 3=Resolved, 4=Reopened, 5=OnHold, 6=Closed, 7=Pending]
  CONSUMERREF (NUMBER): Link to service connection CAN [foreign key to MDM_SHR_SERVICECONN.CAN]
  TANKERQTY (NUMBER): Tanker units requested [0 if not tanker request, 1-3 if tanker]
  [... 50+ more columns with types and meanings]
```

#### Key Information Captured
- **Data types:** VARCHAR, NUMBER, DATE, FLOAT
- **Enumerations:** Status values, category codes with meanings
- **Foreign keys:** Which table+column it links to
- **Sample values:** What real data looks like
- **Join columns:** How to link to other tables

#### Immediate Benefit
- No more "what columns exist?" queries
- No more "what does status 6 mean?" confusion
- 15% reduction in total queries per question

#### Coverage
- Organize by table category (Grievances, Consumers, Connections, Billing, Tankers)
- One section per REQUIRED/MAYBE table
- Sample enum values for all code fields

---

### PHASE 3: Data Flow & Relationship Mapping

**Duration:** 20-30 minutes (one-time)  
**Goal:** Eliminate join-discovery and join-validation failures (currently 25% of failures)  
**Output:** db-data-flow.md

#### What It Does
- Documents all proven join patterns
- Lists common join mistakes and workarounds
- Pre-builds query templates for frequent joins
- Captures known issues and their solutions

#### How It Works

**Part A: Common Join Patterns**

Pre-build 5-10 query templates for frequently-used joins:

```sql
Pattern 1: Grievance → Consumer Details
FROM MCC_GRIEVANCES g
LEFT JOIN MDM_SHR_SERVICECONN s ON g.CONSUMERREF = s.CAN
LEFT JOIN MDM_SHR_CONSUMER c ON s.CONSUMERPKEY = c.PKEY

Pattern 2: Grievance → Complaint Type + Status
FROM MCC_GRIEVANCES g
LEFT JOIN MDM_MCC_COMPTYPE ct ON g.GRIEVANCETYPEID = ct.CODE
(Note: Use CT.COMPLAINTNAME for type description)

Pattern 3: Service Connection → Circle/Area
FROM MDM_SHR_SERVICECONN s
LEFT JOIN MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV loc ON s.AREAID = loc.AREAID

Pattern 4: Disconnection → Status
FROM RBS_DISCONN_REQUEST dr
LEFT JOIN LKP_DISCONN_STATUS ds ON dr.STATUS = ds.STATUS_CODE
```

**Part B: Known Issues & Workarounds**

Document failure patterns discovered:

```yaml
Issue 1: Empty Lookup Tables
Tables: MDM_SHR_DIVISION, MDM_SHR_AREA
Problem: Lookup table exists but contains zero rows
Solution: Use numeric IDs directly, or use MCC_SECT_SUBDIVN_DIVN_CIRCLE view instead
Learn_From: Division complaint query (May 2025)

Issue 2: Column Name Mismatch
Tables: CONSUMER_ALTERNATE_CONTACT uses CAN (not CONSUMERPKEY)
Problem: Inconsistent key naming across tables
Solution: Check all_tab_columns before joining; don't assume PKEY works everywhere
Learn_From: Multiple consumer queries (May 2025)

Issue 3: TANKERQTY Semantics
Table: MCC_TANKER_RATES
Problem: TANKERQTY (1, 2, 3) is NOT litres; it's a tier/slab
Solution: Do NOT divide TANKERAMOUNT by TANKERQTY
Learn_From: Tanker rate analysis (May 2025)

Issue 4: AREAID Mismatch in Service Connections
Table: MDM_SHR_SERVICECONN
Problem: 85% of CANs have AREAID = 0 or unmapped
Solution: Use MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV (view with all areas)
Learn_From: Multiple location-based queries (May 2025)
```

#### Immediate Benefit
- Copy-paste ready join templates
- Avoid 25% of join failures (known issues pre-solved)
- 20% reduction in query composition time

#### Coverage
- 5-10 proven join patterns
- 5-8 known issues with solutions
- Join dos/don'ts summary

---

### PHASE 4: Caching & Session Learning System

**Duration:** Setup 10 min (one-time), 2-3 min per session (ongoing)  
**Goal:** Compound learning - reuse successes, avoid repeated failures  
**Output:** db-session-learnings.md (updated after each session)

#### What It Does
- Stores every query execution (success + failure)
- Captures why queries succeeded or failed
- Documents reusable patterns and templates
- Builds a searchable library of "how to answer X?"

#### How It Works

**After Every Query:**

```yaml
Query_ID: q_20250508_grievances_march_2025
User_Question: "Show grievances by type and status in March 2025"
Tables_Used: MCC_GRIEVANCES, MDM_MCC_COMPTYPE
Status: ✓ SUCCESS (first attempt)
Execution_Time: 1.2 seconds
Rows_Returned: 15

Query_Used: |
  SELECT ct.COMPLAINTNAME, g.GRIEVSTATUS, COUNT(*) count
  FROM MCC_GRIEVANCES g
  LEFT JOIN MDM_MCC_COMPTYPE ct ON g.GRIEVANCETYPEID = ct.CODE
  WHERE EXTRACT(YEAR FROM g.RECVDDATE) = 2025
  AND EXTRACT(MONTH FROM g.RECVDDATE) = 3
  GROUP BY ct.COMPLAINTNAME, g.GRIEVSTATUS
  ORDER BY ct.COMPLAINTNAME

Why_It_Worked:
  - Used correct column names (GRIEVSTATUS not STATUS)
  - Correct join key (GRIEVANCETYPEID to CODE, not PKEY)
  - EXTRACT() for date parsing (not TO_CHAR)
  
Reusable_Pattern: YES
  - Can reuse for any month/year by changing constants
  - Can generalize: any date filter + group by pattern
  - Apply to tanker requests, disconnections, etc.
```

**Failure Tracking:**

```yaml
Query_ID: q_20250508_division_analysis (FAILED)
First_Attempt: |
  SELECT g.DIVISIONREF, COUNT(*) FROM MCC_GRIEVANCES g
  LEFT JOIN MDM_SHR_DIVISION d ON g.DIVISIONREF = d.CODE
  WHERE ...

Error: LEFT JOIN returned NULL for all division_name
Root_Cause: MDM_SHR_DIVISION table is EMPTY (0 rows)
Solution_Applied: Query division IDs directly, skip join
Status: ✓ FIXED on 2nd attempt

Learning: Before joining to any lookup table, validate it has data
```

#### Session Statistics

After each session, capture:

```yaml
Total_Questions_Answered: 25
Total_Queries_Executed: 32
Success_Rate: 96.9%

Queries_By_Category:
  Single_Table_Aggregations: 12 queries → 100% success
  Simple_Joins: 15 queries → 93% success (1-2 attempts)
  Complex_Multi_Table: 5 queries → 80% success (2-3 attempts)

Most_Common_Failure_Modes:
  1. Wrong join column (20% of failures)
  2. Empty lookup table (15% of failures)
  3. Syntax issues (15% of failures)

Patterns_Learned:
  - Q: "Top consumers by complaint count" → Use CONSUMERREF + GROUP BY + ORDER BY DESC
  - Q: "Complaints in month X" → Use EXTRACT(MONTH FROM RECVDDATE) = X
  - Q: "By circle/area" → Always use MCC_SECT_SUBDIVN_DIVN_CIRCLE view, not MDM_SHR_DIVISION
```

#### Immediate Benefit
- Copy-paste successful queries from library
- Know in advance that "X is going to fail" (issue pre-solved)
- Avoid making same mistake twice
- Compound learning: each session makes next session faster

#### Coverage
- Query templates (organized by question type)
- Failure log with resolutions
- Session statistics and trends
- Quick-reference: "how to ask X?" lookup

---

## Implementation Timeline

| Phase | Task | Deliverable | Effort | When |
|---|---|---|---|---|
| **1** | Table Segregation | db-table-classification.md | 20-30 min | NOW |
| **2** | Schema Documentation | db-schema-reference.md | 30-40 min | After Phase 1 |
| **3** | Join Patterns + Issues | db-data-flow.md | 20-30 min | After Phase 2 |
| **4a** | Learning System Setup | db-session-learnings.md (template) | 10 min | After Phase 3 |
| **4b** | Ongoing Learning | Update after each session | 2-3 min/session | Day 2+ |

**Total One-Time Setup:** ~1.5 hours  
**Ongoing Maintenance:** 2-3 minutes per session

---

## Expected Improvements

### Before Optimization
| Metric | Value |
|---|---|
| Queries per question | 4-6 |
| Failures per question | 1-2 |
| Failure rate | 30-40% |
| Time per question | 2-4 minutes |
| Success rate | 60-70% |

### After All 4 Phases
| Metric | Value |
|---|---|
| Queries per question | 1-2 |
| Failures per question | 0-0.2 |
| Failure rate | <5% |
| Time per question | 20-40 seconds |
| Success rate | 95-98% |

### Key Levers Driving Improvement
1. **Phase 1:** Eliminate table-discovery queries (-40% queries)
2. **Phase 2:** Eliminate column-discovery queries (-15% queries)
3. **Phase 3:** Pre-solve join failures (-25% failures)
4. **Phase 4:** Reuse success patterns, avoid repeated failures (-50% composition time)

---

## How to Use These Documents in Practice

**For Every New Question:**

1. **Refer to Classification** - Do you need REQUIRED/MAYBE tables?
2. **Check Schema Reference** - What columns do you need? What are the enums?
3. **Find Join Pattern** - Is there a pre-built template in db-data-flow.md?
4. **Check Known Issues** - Does this question type have a documented issue?
5. **Search Learnings** - Has this question been asked before? Reuse the query
6. **Write Query** - Combine schema knowledge + join pattern + known issues
7. **Execute & Log** - If success, add to learnings. If failure, analyze and add to issues.

**Result:** Minimal discovery, maximum reuse, exponential quality improvement

---

## Why This Strategy Works

### Addresses Root Causes
- **Cause:** Schema discovery takes 30-50% of time → **Phase 1-2 solve:** Pre-document everything
- **Cause:** Join failures due to wrong columns/empty tables → **Phase 3 solves:** Document all patterns + issues
- **Cause:** Same mistakes repeated each session → **Phase 4 solves:** Track failures, avoid recurrence
- **Cause:** Query composition takes time → **Phases 1-4 solve:** Copy-paste templates

### Compounds Over Time
- Day 1: Full discovery needed, all phases built
- Day 2: 50% time saved (using phase 4 learnings)
- Week 1: 70% time saved (patterns recognized, issues pre-solved)
- Month 1: 80-90% time saved (library of solutions covers 80% of questions)

### Scalable to New Questions
- New question type? Same pattern: check phases 2-4, adapt template
- New user? Same phases: same documents, exponential learning

---

## Next Steps

1. **Approve Strategy** - Does this approach make sense?
2. **Start Phase 1** - Execute table classification (20-30 min)
3. **Move to Phase 2** - Build schema reference (30-40 min)
4. **Move to Phase 3** - Document joins + issues (20-30 min)
5. **Activate Phase 4** - Start tracking learnings (ongoing)

**Ready to begin Phase 1?**
