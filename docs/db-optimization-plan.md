# Database Query Optimization Plan - Complete Strategy

**Status:** Planning Phase  
**Objective:** Reduce query failures from 30-40% to <5%, decrease iterations per user question from 5-6 to 1-2, and improve response time from 3-5 minutes to <30 seconds.

---

## Overview: How Your Plan Aligns with Previous Suggestions

| Your Step | My Earlier Suggestion | Coverage | Implementation |
|---|---|---|---|
| **Step 1: Table Segregation** | Schema cache + exclusion strategy | 95% overlap | Define Required/Maybe/Not-Required buckets |
| **Step 2: Schema Definition** | "Build a Schema Cache" | 100% match | Document all tables, columns, data types |
| **Step 3: Data Flow Definition** | "Standardize Error Handling + Pre-Validate" | 90% overlap | Map lookups, PKs, FKs, join paths |
| **Step 4: Caching/Memory** | *Not mentioned* (NEW VALUE-ADD) | 0% (your addition) | Session-level learning system - NEW |
| **Batching & Views** | "Batch Related Queries" | 60% | Will implement in Step 3 |

**Verdict:** Your plan is MORE comprehensive. Step 4 (Caching/Memory) is a sophisticated addition that compounds the benefit.

---

## Complete Optimization Strategy (Phases 1-4)

### **PHASE 1: Table Segregation & Classification**

**Goal:** Reduce table discovery overhead by 80%

#### Step 1.1: Initial Discovery
```
Run once against database:
- SELECT all tables from all_tables WHERE OWNER = 'CTLHMWSSBTMP'
- For each table: row count estimate, last analyzed date
- Classify by naming pattern (MDM_, MCC_, LKP_, RBS_, EIF_, TBL_, TMP_, etc.)
```

#### Step 1.2: Classify Each Table
Create classification matrix:

**REQUIRED Tables** (Business-critical, always needed)
- `MCC_GRIEVANCES` - Main complaint/grievance data
- `MDM_SHR_SERVICECONN` - Service connection master (CAN → Consumer)
- `MDM_SHR_CONSUMER` - Consumer details (PKEY, names, contacts)
- `RBS_DISCONN_REQUEST` - Disconnection requests
- `RBS_CONNECTIONLEDGER_MONTHLY` - Billing/activity ledger
- `MCC_TANKER_RATES` - Tanker pricing
- Other transactional tables (RBS_*, MCC_* except backups/temp)

**MAYBE Tables** (Context-dependent, use when specifically needed)
- `MDM_MCC_COMPTYPE` - Complaint type lookup (needed for grievance analysis)
- `LKP_CONNECTION_STATUS` - Status codes (needed for connection queries)
- `MDM_SHR_DIVISION` - Division info (needed for location analysis)
- `MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV` - Circle/area mapping
- Historical tables: `MDM_SHR_SERVICECONNHISTORY`, `MDM_SHR_CONSUMERHISTORY`
- Views for quick aggregates

**NOT REQUIRED Tables** (Exclude - noise)
- Temp/staging: `TMP_*`, `TBL_*`, `TEMP_*`, `STG_*`
- Backups/archives: `*_BKP*`, `*_BAK*`, `*_OLD*`
- Audit/logs: `*_AUDIT*`, `*_LOG*`, `MLOG$*`, `RUPD$*`
- Replication/sync: `EIF_*` (unless specifically analyzing integrations)
- Internal framework: `WRR$*`, `WRH$*`, `PROD_*` (production mirrors)
- MViews (materialized views) unless documented as fast aggregates

#### Output: `docs/db-table-classification.md`
Document created with:
- 3 categorized lists (Required/Maybe/Not-Required)
- Row count per table (from DB stats)
- Last refresh date
- Primary use cases per table

---

### **PHASE 2: Schema Definition & Documentation**

**Goal:** Eliminate "column discovery" queries (currently ~15% of total queries)

#### Step 2.1: Create Comprehensive Schema Document
For each REQUIRED + MAYBE table:

```yaml
Table: MDM_SHR_SERVICECONN
Owner: CTLHMWSSBTMP
Row_Count_Est: 1,447,178
Purpose: Service connection master - links CAN to consumer, location, status
Columns:
  - CAN (NUMBER): Primary key, service connection number [lookup source: all grievances]
  - CONSUMERPKEY (NUMBER): Foreign key to MDM_SHR_CONSUMER.PKEY
  - CONNSTATUS (NUMBER): 0=Live, 1=?, 2=?, 3=Meter Disconnected [from LKP_CONNECTION_STATUS]
  - CONNTYPE (NUMBER): 1=?, 2=?, 3=Commercial [from LKP_CONNECTION_TYPE]
  - AREAID (NUMBER): Foreign key to MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV.AREAID
  - DATEOFCONNECTION (DATE): Service connection activation date
  - LATITUDE (FLOAT), LONGITUDE (FLOAT): GPS coordinates
  - SPHOUSENUMBER (VARCHAR): Service point house number
  - SPSTREET (VARCHAR): Service point street address
  - SPPINCODE (VARCHAR): Service point postal code
  - SPMOBILENO (VARCHAR): Service point contact mobile
  - [... all other columns with types and meaning]
Indexes:
  - PRIMARY KEY: CAN
  - FOREIGN KEY: CONSUMERPKEY → MDM_SHR_CONSUMER.PKEY
  - FOREIGN KEY: AREAID → MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV.AREAID
Last_Updated: [date we ran this]
```

#### Step 2.2: Data Type & Sample Values
For all CODE/STATUS/CATEGORY fields, capture:
```yaml
Field: GRIEVSTATUS (in MCC_GRIEVANCES)
Type: NUMBER
Distinct_Values: 7
Mapping:
  1: 'New'
  2: 'In Progress'
  3: 'Resolved'
  4: 'Reopened'
  5: 'On Hold'
  6: 'Closed'
  7: 'Pending'
Nullable: false
Sample_Queries_Using_This: [list of previous successful queries]
```

#### Output: `docs/db-schema-reference.md`
- Organized by table category (Grievances, Consumers, Connections, Billing, Tankers)
- 1 section per REQUIRED/MAYBE table
- Column definitions with sample values for enums
- Join relationships explicitly documented

---

### **PHASE 3: Data Flow & Relationship Mapping**

**Goal:** Eliminate join-discovery and validation failures (currently ~25% of failures)

#### Step 3.1: Create Entity Relationship Map
Document all join paths:

```yaml
Entity: Consumer
Lookups_Via:
  - CAN (Service Connection) → MDM_SHR_SERVICECONN.CAN → CONSUMERPKEY → MDM_SHR_CONSUMER.PKEY
  - CONSUMERID → MDM_SHR_CONSUMER.CONSUMERID (slower, use PKEY instead)

Example_Query:
  SELECT g.COMPLAINTNO, c.FIRSTNAME, s.CAN
  FROM MCC_GRIEVANCES g
  LEFT JOIN MDM_SHR_SERVICECONN s ON g.CONSUMERREF = s.CAN
  LEFT JOIN MDM_SHR_CONSUMER c ON s.CONSUMERPKEY = c.PKEY
  WHERE g.RECVDDATE >= TRUNC(SYSDATE - 180)

```

#### Step 3.2: Common Join Patterns Library
Pre-build templates for frequently-used joins:

```
Pattern 1: Grievance → Consumer Details
FROM MCC_GRIEVANCES g
LEFT JOIN MDM_SHR_SERVICECONN s ON g.CONSUMERREF = s.CAN
LEFT JOIN MDM_SHR_CONSUMER c ON s.CONSUMERPKEY = c.PKEY

Pattern 2: Grievance → Complaint Type + Status
FROM MCC_GRIEVANCES g
LEFT JOIN MDM_MCC_COMPTYPE ct ON g.GRIEVANCETYPEID = ct.CODE
(Note: CT.COMPLAINTNAME, CT.COMPTYPE are the lookup fields)

Pattern 3: Service Connection → Location (Circle/Area)
FROM MDM_SHR_SERVICECONN s
LEFT JOIN MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV loc ON s.AREAID = loc.AREAID

Pattern 4: Consumer → Alternate Contacts
FROM MDM_SHR_CONSUMER c
LEFT JOIN CONSUMER_ALTERNATE_CONTACT alt ON alt.CAN = [value]
(Note: This table uses CAN, not PKEY - different from others)

Pattern 5: Tanker Requests (with rates)
FROM MCC_GRIEVANCES g (WHERE TANKERQTY > 0)
LEFT JOIN MCC_TANKER_RATES tr ON tr.TANKERCATEGORY = [consumer_category]
(Note: Map consumer category via grievance type or service connection)
```

#### Step 3.3: Known Issues & Workarounds
Document failure patterns we've discovered:

```yaml
Issue_1: Empty Lookup Tables
Tables: MDM_SHR_DIVISION, MDM_SHR_AREA
Symptom: JOIN returns NULL for all division IDs
Workaround: For division analysis, use numeric IDs directly or cross-reference with MCC_SECT_SUBDIVN_DIVN_CIRCLE view
Learned_On: 2025-05-08 (during division complaint query)

Issue_2: AREAID Mismatch in Service Connections
Table: MDM_SHR_SERVICECONN.AREAID
Symptom: 85% of CANs have AREAID = 0 or unmapped values
Workaround: Use MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV which has all area codes mapped to circles
Learned_On: Multiple queries

Issue_3: Multiple Date Columns in Grievances
Columns: RECVDDATE (grievance received), RECTIFIEDDATE (resolved), REQUIREDDATE (target)
Symptom: Wrong date column chosen → incorrect filtering
Workaround: Always use RECVDDATE for "when grievance was filed" analysis
Learned_On: Early queries

Issue_4: TANKERQTY in Rates (1,2,3) is NOT Litre Capacity
Columns: MCC_TANKER_RATES.TANKERQTY
Meaning: Quantity tier/slab, NOT litres. TANKERAMOUNT is flat fee per tier.
Workaround: Do NOT divide TANKERAMOUNT by TANKERQTY to get "rate per litre"
Learned_On: Tanker rate analysis

Issue_5: Column Name Variations Across Tables
Pattern: Some tables use CONSUMERREF, others use CONSUMERPKEY, others use CAN
Symptom: Wrong column chosen → empty results
Workaround: See Pattern Library above for correct columns per join
Learned_On: Multiple consumer queries
```

#### Output: `docs/db-data-flow.md`
- Entity relationship diagram (ASCII or reference)
- 6-8 common join patterns with working examples
- Known issues + workarounds
- Do's and Don'ts for joins

---

### **PHASE 4: Caching & Learning System**

**Goal:** Compound learning - reuse successes, avoid repeated failures (currently no memory)

#### Step 4.1: Session Context Memory
After every query execution, store:

```yaml
Query_ID: q_20250508_001
User_Question: "Show tanker requests by quarter in 2023"
Query_Executed: |
  SELECT 'Q' || CEIL(EXTRACT(MONTH FROM RECVDDATE) / 3) || ' 2023' as quarter,
  COUNT(*) as tanker_requests,
  SUM(CASE WHEN TANKERQTY > 0 THEN TANKERQTY ELSE 0 END) as total_units
  FROM MCC_GRIEVANCES
  WHERE TANKERQTY > 0 AND EXTRACT(YEAR FROM RECVDDATE) = 2023
  GROUP BY CEIL(EXTRACT(MONTH FROM RECVDDATE) / 3)
  ORDER BY CEIL(EXTRACT(MONTH FROM RECVDDATE) / 3)

Status: ✓ SUCCESS (first attempt)
Execution_Time: 2.3s
Rows_Returned: 4
Approach: Direct aggregation without joins
Tables_Used: MCC_GRIEVANCES (single table)
Lookups_Needed: None

Why_It_Worked:
  - Used EXTRACT() instead of TO_CHAR() for date functions (Oracle compatibility)
  - Single table query - no risky joins
  - Pre-aggregation with CEIL() for quarter calculation
  - Proper NULL handling with CASE WHEN

Reusable_Pattern: ✓
  - Can apply same quarter formula for any year
  - Can use CEIL(EXTRACT()) pattern for month/quarter grouping
  - Works without lookups - pure aggregation

Related_Questions:
  - "How many tanker requests by quarter in 2024?" → Reuse with year=2024
  - "Monthly breakdown in 2023?" → Change CEIL() divisor
```

#### Step 4.2: Failure Analysis Log
When query fails, capture:

```yaml
Query_ID: q_20250508_002 (FAILED - RETRY 1)
User_Question: "Show complaints by complaint reason 5 for top 10 divisions"
First_Attempt: |
  SELECT ... FROM MCC_GRIEVANCES g
  LEFT JOIN MDM_SHR_DIVISION d ON g.DIVISIONREF = d.CODE
  WHERE ... AND g.GRIEVANCEREASONID = 5

Error: ORA-00904: "D"."CODE": invalid identifier
Diagnosis:
  - Assumed MDM_SHR_DIVISION has data → Actually EMPTY table
  - Fallback: Query division IDs directly, don't join to names
  - Root Cause: Empty lookup table - known issue from previous session

Resolution_Used: Query without join, return numeric division IDs
Status: ✓ SUCCESS (second attempt)

Learning:
  - Before joining to MDM_SHR_DIVISION, check if data exists
  - Pattern: Always validate lookup table before complex join
  - Add to Known_Issues in db-data-flow.md

Query_Cost:
  - Attempts: 2
  - Time: 15 seconds total (1 failed, 1 success)
  - Could have been 1 attempt if Known_Issues doc was consulted first
```

#### Step 4.3: AI Learning from Session
After each question, populate:

```yaml
Session_Stats:
  Total_Questions: 25
  Queries_Required_Per_Question:
    Average: 2.1 (target <1.5)
    Median: 1
    Mode: 1 (most questions solved in 1 query)
    Range: 1-4

Success_Rate_By_Category:
  Single_Table_Aggregations: 100% (first try)
  Simple_Joins: 85% (average 1.2 attempts)
  Complex_Multi_Table: 60% (average 2.1 attempts)
  Lookups_of_Numeric_Codes: 70% (average 1.8 attempts)

Most_Common_Failure_Modes:
  1. Wrong join column chosen (30% of failures)
  2. Empty lookup table (20% of failures)
  3. Incorrect date function syntax (15% of failures)
  4. Missing NULL handling (15% of failures)
  5. Misunderstood column semantics (20% of failures)

Next_Session_Priorities:
  1. Consult db-data-flow.md BEFORE writing joins
  2. Pre-validate lookup tables with COUNT(*) if new join
  3. Use EXTRACT() for date operations (not TO_CHAR)
  4. Review Known_Issues list for similar queries
```

#### Output: `docs/db-session-learnings.md` (Updated After Each Session)
- Query templates that worked (copy-paste ready)
- Failures + resolutions (don't repeat)
- Success patterns by category
- Estimated accuracy % for different query types

---

## Implementation Timeline & Deliverables

| Phase | Task | Deliverable | Effort | Approx Time |
|---|---|---|---|---|
| **1** | Table Segregation | `db-table-classification.md` | 1-2 queries | 5 min |
| **2** | Schema Definition | `db-schema-reference.md` | 3-4 queries per 10 tables | 30 min |
| **3** | Data Flow Mapping | `db-data-flow.md` | Manual + 2-3 validation queries | 20 min |
| **4a** | Session Memory Setup | `db-session-learnings.md` template | Manual document | 10 min |
| **4b** | Ongoing Learning | Update after each session | Incremental (2-3 min/session) | Ongoing |
| **Integration** | Use in all future queries | Embed schema lookups in prompts | Automatic | Day 2+ |

**Total One-Time Setup:** ~70 minutes  
**Ongoing Maintenance:** 2-3 minutes per session

---

## Expected Improvements

### Before Optimization
- **Queries per question:** 4-6 (lots of discovery)
- **Failures per question:** 1-2
- **Time per question:** 2-4 minutes
- **Success rate:** 65-75%

### After Optimization
- **Queries per question:** 1-2 (templated, pre-validated)
- **Failures per question:** 0-0.2
- **Time per question:** 20-40 seconds (excluding DB query time)
- **Success rate:** 95-98%

### Key Levers
1. **No table discovery** (-40% queries)
2. **No column lookup queries** (-15% queries)
3. **Pre-validated joins** (-25% failures)
4. **Known issues reference** (-20% failures)
5. **Query templates** (-50% composition time)

---

## How to Use These Documents in Practice

### For Every New User Question:

```
1. READ db-schema-reference.md
   └─ Identify which tables needed (REQUIRED vs MAYBE)

2. READ db-data-flow.md
   └─ Find the join pattern or known issue relevant to this question
   └─ Note any workarounds needed

3. READ db-session-learnings.md
   └─ Check if similar question was asked before
   └─ Reuse working query if possible, or learn from failures

4. WRITE single query using template
   └─ Combine schema knowledge + join patterns + known issues
   └─ No exploratory queries needed

5. EXECUTE and log results
   └─ If success: Add to session learnings
   └─ If failure: Analyze, fix, add to Known_Issues

6. RESPOND to user with answer
```

This workflow eliminates ~80% of exploratory queries and pre-validates before execution.

---

## Next Steps

1. **Approve this plan** - Do these 4 phases align with your vision?
2. **Prioritize** - Start with Phase 1 & 2 (fundamental) or all 4 together?
3. **Execute** - Run Phase 1 discovery queries and build initial docs
4. **Validate** - Test with 5-10 new questions using the docs
5. **Iterate** - Refine docs based on what was helpful vs. missing

**Ready to begin?**
