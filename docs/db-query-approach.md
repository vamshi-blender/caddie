# Lessons Learned: How to Query Oracle DB from Connection String Alone

**Purpose:** Document key insights from initial database exploration  
**Scope:** Patterns and best practices discovered through querying  
**Applies To:** Understanding the database structure and optimizing future queries

---

## 6 Key Lessons

### 1. Exploration First, Query Second
Before running business queries, explore the schema:
- Use `all_tables` and pattern matching (`LIKE '%GRIEV%'`, `LIKE '%TANKER%'`)
- Create a mental map of available tables without trial-and-error
- Prevents wasted queries on non-existent tables

### 2. Lookup/MDM Tables Decode Everything
Tables prefixed with `MDM_*` and `LKP_*` contain critical reference data:
- `MDM_*` = Master Data Management (core reference tables)
- `LKP_*` = Lookup tables with enumerations
- Example: `LKP_DISCONN_STATUS` maps `STATUS=6` → "Executed"
- Always fetch lookup values early and reuse them

### 3. Validate Column Names Before Joins
Never assume column names exist or have expected names:
- Query `all_tab_columns` before writing joins
- Example issue: Assumed `PKEY` was join key, but `MDM_MCC_COMPTYPE` uses `CODE`
- Wrong assumptions cause silent failures with empty result sets

### 4. Recognize Naming Convention Patterns
Oracle enterprise databases follow predictable naming:

| Prefix | Meaning | Action |
|---|---|---|
| `MDM_*` | Master Data (reference tables) | Always include |
| `LKP_*` | Lookup tables (codes/enums) | Always include |
| `MCC_*` | Main Complaint/Customer Care | Include (transactional) |
| `RBS_*` | Revenue/Billing Subsystem | Include (transactional) |
| `EIF_*` | External Interface/Integration | Exclude (unless analyzing integrations) |
| `TBL_*`, `TMP_*`, `TEMP_*` | Temporary/staging data | Exclude (noise) |
| `*_BKP*`, `*_BAK*` | Backups/archives | Exclude |
| `*_AUDIT*`, `*_LOG*`, `MLOG$*` | Audit/logging | Exclude |
| `WRR$*`, `WRH$*` | Internal framework | Exclude |

### 5. Build Context Across Queries
Avoid refetching the same information:
- Once you discover lookup values, cache them mentally
- Apply learned patterns to similar queries
- Example: After fetching `LKP_DISCONN_STATUS` once, use cached values for all disconnection queries

### 6. Prefer Transactional Tables Over Views/Backups
When similar tables exist, choose carefully:
- Transactional table (main): `MCC_GRIEVANCES` ✓
- View (aggregated): `GRIEVANCES_VIEW_LATEST` ✗
- Backup (stale): `MCC_GRIEVANCES_BKP_*` ✗
- Main tables have complete data; views may be partial; backups are outdated

---

## Why These Matter

These lessons reduce:
- **Query failures** - By validating column names and table existence
- **Wasted queries** - By avoiding redundant lookups
- **Wrong results** - By choosing correct tables and join keys
- **Time spent** - By knowing patterns rather than discovering them

---

## Application

Use these insights when:
- Planning new queries (apply lessons 1, 2, 4)
- Writing joins (apply lessons 3, 6)
- Optimizing for performance (apply lessons 2, 5)
- Segregating tables for analysis (apply lesson 4)