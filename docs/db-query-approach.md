# How I Answer DB Questions from Just a Connection String

## 1. Exploration first, query second
Before running any business query, I explore the schema — searching for tables by name patterns (`LIKE '%GRIEV%'`, `LIKE '%TANKER%'`, etc.) using `all_tables`. This gives me a map of what's available.

## 2. Reading lookup/MDM tables
I noticed tables prefixed with `MDM_` (Master Data Management) and `LKP_` (Lookup) — these are goldmines. They decode numeric codes into human-readable labels (e.g., `STATUS=6` → "Executed"). I fetch these early and keep them in context.

## 3. Column inspection before joining
Before writing a JOIN, I query `all_tab_columns` to find the actual column names. For example, I assumed the join key was `PKEY` for `MDM_MCC_COMPTYPE` — but it was actually `CODE`. Checking first prevented wrong results.

## 4. Naming convention pattern recognition
Oracle enterprise DBs follow naming patterns I can recognize:
- `MDM_*` → master/reference data
- `EIF_*` → external interface/integration tables
- `RBS_*` → likely a billing/revenue subsystem
- `MCC_*` → main complaint/customer care module
- `TBL_`, `TMP_`, `TEMP_` → temporary/working tables (usually skipped)

## 5. Using context across queries
Each answer builds on previous ones. When you asked about disconnections, I already knew `LKP_DISCONN_STATUS` and its values from the cancelled CAN query — so I didn't need to re-fetch it.

## 6. Picking the right table
When multiple tables look similar (e.g., `MCC_GRIEVANCES`, `GRIEVANCES_VIEW_LATEST`, `MCC_GRIEVANCES_BKP_*`), I prefer the **main transactional table** over views or backups for accuracy.

---

In short — it's structured exploration + reading the DB's own metadata before writing any business query.


---

**Plan**

I’d treat this as a table triage problem, not a one-time schema review. The goal is to identify tables we should exclude from retrieval context for the app because they are unlikely to help answer business questions and would only add noise.

1. Define exclusion buckets first.
Tables usually become “do not include” candidates if they are:
- Purely technical or framework-owned
- Audit, log, temp, staging, backup, queue, or replication tables
- Mapping tables with no business meaning on their own
- Legacy or unused tables
- Security or admin tables that should not be surfaced
- Highly duplicate snapshot/history tables unless the app explicitly needs historical analysis

2. Collect schema evidence from the DB.
For each table, I’d gather:
- Owner/schema
- Row count estimate
- Column names and data types
- Primary/foreign keys
- Last analyzed / stats freshness
- Naming patterns like `TMP`, `LOG`, `HIST`, `BAK`, `STG`, `AUD`, `INTF`
- Whether the table is referenced by views, procedures, or other tables

3. Score each table for usability.
I’d classify tables into:
- `Include`: likely business-facing and useful for question answering
- `Exclude`: almost certainly noise or operational-only
- `Review`: ambiguous tables needing a human/business check

4. Use multiple signals, not just names.
A table should be excluded more confidently when several signals agree:
- Name suggests technical usage
- Columns are metadata-heavy (`CREATED_BY`, `SESSION_ID`, `PROCESS_STATUS`, etc.)
- No meaningful relationships to business entities
- Very high churn but low business semantics
- Not referenced by reporting objects or core joins

5. Validate with actual query patterns.
Before finalizing exclusions, I’d test a sample of realistic user questions and check:
- Which tables are actually needed to answer them
- Which tables are being pulled in but add no value
- Whether excluding a candidate breaks any useful answers

6. Document decisions in a markdown file.
The new markdown file should contain:
- Exclusion criteria
- Observed naming patterns
- Candidate excluded table categories
- Tables confidently excluded
- Tables needing review
- Risks and exceptions

7. Iterate before hard-coding exclusions.
I’d avoid permanently blacklisting too aggressively at first. Better approach:
- Start with obvious excludes
- Validate against sample business questions
- Expand the exclusion list in rounds

**What I’d do next**
If you want, I’ll create a markdown file in this repo and start populating it with:
- the exclusion framework,
- the observation checklist,
- and a first-pass methodology for identifying non-usable tables from this Oracle DB.