# Database Table Classification by Module

**Status:** In Progress - Incremental Classification  
**Last Updated:** [To be updated after each session]  
**Classification Method:** See `step-1_segregation-approach.md` for methodology

---

## SUMMARY

| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total | Status |
|---|---|---|---|---|---|
| MCC | - | - | - | - | Pending |
| RBS | - | - | - | - | Pending |
| SHARED/CROSS | - | - | - | - | Pending |
| **TOTAL** | **-** | **-** | **-** | **500+** | **In Progress** |

---

## MODULE 1: MCC (Metro Customer Care)

**Status:** Pending - To be classified in Session 1

This module contains all grievance/complaint management tables. Will include:
- Main transaction tables (MCC_GRIEVANCES)
- Lookup tables (MDM_MCC_COMPTYPE, etc.)
- Related transaction tables (MCC_CONSUMERS_CONNECTIONS, MCC_TANKER_*)

### REQUIRED Tables

| Table Name | Row Count | Purpose | Primary Use | Classification Evidence |
|---|---|---|---|---|
| [To be populated] | | | | |

### MAYBE Tables

| Table Name | Condition to Use | Purpose | Classification Evidence |
|---|---|---|---|
| [To be populated] | | | |

### NOT-REQUIRED Tables

| Table Name | Reason Excluded | Category | Classification Evidence |
|---|---|---|---|
| [To be populated] | | | |

---

## MODULE 2: RBS (Revenue Billing System)

**Status:** Pending - To be classified in Session 2

This module contains all billing and disconnection management tables. Will include:
- Disconnection request tables (RBS_DISCONN_REQUEST)
- Connection ledger tables (RBS_CONNECTIONLEDGER_MONTHLY)
- Related transaction tables (RBS_RPT_*, etc.)

### REQUIRED Tables

| Table Name | Row Count | Purpose | Primary Use | Classification Evidence |
|---|---|---|---|---|
| [To be populated] | | | | |

### MAYBE Tables

| Table Name | Condition to Use | Purpose | Classification Evidence |
|---|---|---|---|
| [To be populated] | | | |

### NOT-REQUIRED Tables

| Table Name | Reason Excluded | Category | Classification Evidence |
|---|---|---|---|
| [To be populated] | | | |

---

## MODULE 3: SHARED / CROSS-MODULE

**Status:** Pending - To be classified in Session 3

This module contains shared master data and lookups used across all modules:
- Consumer/Service Connection masters (MDM_SHR_*)
- Lookups (LKP_*)
- Dimension tables (views with area/circle/division hierarchy)

### REQUIRED Tables

| Table Name | Row Count | Purpose | Primary Use | Classification Evidence |
|---|---|---|---|---|
| [To be populated] | | | | |

### MAYBE Tables

| Table Name | Condition to Use | Purpose | Classification Evidence |
|---|---|---|---|
| [To be populated] | | | |

### NOT-REQUIRED Tables

| Table Name | Reason Excluded | Category | Classification Evidence |
|---|---|---|---|
| [To be populated] | | | |

---

## Classification Progress Log

**How to use this section:**
After each session, add an entry documenting what was classified.

### Session 1: [Date]
- Module: MCC
- Tables Classified: [Count]
- REQUIRED: [Count] | MAYBE: [Count] | NOT-REQUIRED: [Count]
- Key Findings: [Brief notes on classification decisions]
- Next: [What to do in next session]

### Session 2: [Date]
- Status: Pending

### Session 3: [Date]
- Status: Pending

---

## Key Classification Signals Used

(Reference from step-1_segregation-approach.md)

- **Naming patterns:** Prefixes indicate module and purpose
- **Row counts:** Zero-row tables investigated before exclusion
- **Column inspection:** Metadata-heavy vs. business-critical columns
- **Business relationships:** Tables used in core join paths
- **Validation:** Tested with sample user questions

See `step-1_segregation-approach.md` for complete methodology.

---

## How to Update This Document

**Each session:**
1. Classify one module (MCC, RBS, or SHARED)
2. Fill in the corresponding section above
3. Add a progress entry to "Classification Progress Log"
4. Update SUMMARY table with new counts
5. Save and commit to repository

**Never delete or re-classify:** Once a module section is complete, leave it as-is in future updates.
