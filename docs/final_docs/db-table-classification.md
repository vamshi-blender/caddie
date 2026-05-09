# Database Table Classification by Module

**Status:** In Progress - Incremental Classification  
**Last Updated:** 2026-05-09  
**Classification Method:** See `step-1_segregation-approach.md` for methodology

---

## SUMMARY

| Module | REQUIRED | MAYBE | NOT-REQUIRED | Total | Status |
|---|---|---|---|---|---|
| MCC | 8 | 54 | 26 | 88 | Complete |
| RBS | - | - | - | - | Pending |
| SHARED/CROSS | - | - | - | - | Pending |
| **TOTAL** | **8** | **54** | **26** | **88 classified so far** | **In Progress** |

---

## MODULE 1: MCC (Metro Customer Care)

**Status:** Complete - Classified in Session 1

This module contains all grievance/complaint management tables. Will include:
- Main transaction tables (MCC_GRIEVANCES)
- Lookup tables (MDM_MCC_COMPTYPE, etc.)
- Related transaction tables (MCC_CONSUMERS_CONNECTIONS, MCC_TANKER_*)

Notes:
- `MCC_SECT_SUBDIVN_DIVN_CIRCLE_INC_AREAS_MV` and `MCC_SECT_SUBDIVN_DIVN_CIRCLE_MV` were intentionally deferred to `SHARED/CROSS` because they serve location lookups across modules.
- Classification follows the conservative Round 1 rule: only obvious snapshots, backups, history, and audit-style tables were excluded.

### REQUIRED Tables

| Table Name | Row Count | Purpose | Primary Use | Classification Evidence |
|---|---|---|---|---|
| MCC_GRIEVANCES | 6,649,652 | Main grievance transaction table | Filter by date, status, type, consumer, and resolution | Main MCC transaction table with complaint lifecycle columns (`GRIEVANCETYPEID`, `GRIEVSTATUS`, `RECVDDATE`, `RECTIFIEDDATE`) and highest-quality current stats |
| MCC_COMPLAINT | 5,136,156 | Complaint/grievance master transaction table | Alternate core source for complaint-level analysis and reconciliation | Same business-critical complaint grain as `MCC_GRIEVANCES`; not a backup/temp object and contains core grievance fields |
| MCC_CONSUMERS_CONNECTIONS | 1,507,744 | Consumer-to-service-connection bridge | Link complaints to CAN, consumer reference, and service attributes | Core join path from grievance consumer reference to connection context; large active row count and business columns |
| MDM_MCC_COMPTYPE | 10 | Complaint type lookup | Decode `GRIEVANCETYPEID` into complaint names/categories | Small but essential reference table repeatedly called out in existing query guidance |
| MDM_MCC_COMPREASON | 59 | Complaint reason lookup | Decode `GRIEVANCEREASONID` into reason descriptions | Canonical MDM lookup with active/severity fields; needed to interpret grievance reasons |
| MDM_MCC_GRIEVSTATUS | 9 | Grievance status lookup | Decode grievance status codes | Core status decoder for any meaningful complaint reporting |
| MDM_MCC_GRIEVRECEIVEDTYPE | 28 | Complaint source lookup | Decode received/source channel codes | Canonical MDM source lookup used to interpret `RECEIVEDTYPE` values |
| MDM_MCC_RESOLVINGAUTHORITY | 25 | Resolving authority lookup | Decode resolving authority assignments | Required to translate `RESOLVINGAUTHORITY` from the main grievance tables |

### MAYBE Tables

| Table Name | Condition to Use | Purpose | Classification Evidence |
|---|---|---|---|
| MCC GRIEVANCES | When you want a denormalized grievance-ready dataset | Flattened grievance table with human-readable columns | Large row count and business value, but overlaps with `MCC_GRIEVANCES` and looks like a derived reporting copy rather than the canonical transaction source |
| MCC_SERVICECONNECTIONS_CONSUMERS | When the join starts from service connection primary key rather than consumer reference | Reverse-oriented connection-to-consumer bridge | Similar scope to `MCC_CONSUMERS_CONNECTIONS`; useful in some joins, but not the default bridge |
| MCC_CUSTREMITEMS | When analyzing customer reminder follow-up workflow | Customer reminder detail items | Large operational table tied to reminder feedback; useful for workflow analysis, not standard complaint counts |
| MCC_ESCGRIEVDETAILS | When analyzing escalation events or escalation timelines | Escalation event detail by grievance | High-volume operational table with grievance escalation tokens, dates, and levels |
| MCC_ESCLEVEL | When decoding escalation level IDs | Escalation level lookup | Small lookup table with designation/code values; optional unless escalation reporting is needed |
| MCC_FILLINGSTATIONOFFENCE | When analyzing tanker filling-station offense cases | Offense case details for filling stations | Business table with offense workflow columns; niche operational use |
| MCC_GRIEVARESPONSE | When traversing grievance response headers | Response header table keyed by grievance | Core part of response workflow, but only needed for detailed action-trail analysis |
| MCC_GRIEVASSIGNEDTOGULFER | When analyzing tanker/gulfer assignment workflow | Assignment records from grievance to gulfer | Specialized operational table with `GRIEVPKEY`, `GULFERPKEY`, and assignment metadata |
| MCC_GRIEVCNTRLRECORD | When analyzing grievance control or action history | Control record history for grievances | Large workflow table with employee, remarks, and recorded date fields |
| MCC_GRIEVRESPCONTROLRECORD | When analyzing response control history | Control records tied to grievance responses | High-volume operational history table; useful for detailed response workflow only |
| MCC_GRIEVRSPLINEITMS | When inspecting response line items or field action notes | Detailed response line items | Largest response-detail table with comments, stage, and employee/action columns |
| MCC_GRIEV_PRIORITY | When decoding grievance priority codes | Priority lookup | Tiny lookup table; optional unless priority segmentation is requested |
| MCC_GULFERASSIGNMENTCLOSURES | When measuring tanker closure quality or gulfer completion | Closure data for gulfer assignments | Specialized tanker workflow table with closure, satisfaction, and trip metrics |
| MCC_ILLEGALCONNINFO | When analyzing illegal connection complaints | Complaint intake details for illegal connections | Niche but business-relevant complaint subtype with complainant and location fields |
| MCC_INSPECTEDBYDETAILS | When auditing who inspected reminders or complaint follow-ups | Inspector detail records | Small workflow support table; useful only for inspection-specific questions |
| MCC_INTENGRLINEITEMS | When analyzing internal engineering intimations | Intimation line items for engineering workflow | Moderate row count with intimation date, area engineer, and remarks fields |
| MCC_NONSERVICECONN | When working on complaints from non-service or temporary consumers | Non-service connection complaint dimension | Dedicated complaint-support table with temporary CAN and consumer details |
| MCC_QAREMITEMS | When analyzing QA reminder follow-up activity | QA reminder detail items | Operational reminder table with lab references; only needed for QA workflows |
| MCC_RECEIVEDTYPE | When legacy source codes are stored outside the MDM lookup | Legacy receive-type lookup | Lookup-style table overlapping with `MDM_MCC_GRIEVRECEIVEDTYPE`; keep as fallback |
| MCC_REMAINDERS | When analyzing reminder issuance at grievance level | Reminder header table | High-volume operational table tied directly to `GRIEVPKEY` |
| MCC_RPT_COMPLAINTWISESUMMARY | When using pre-aggregated complaint summary data | Complaint summary facts by org/date | Business-useful reporting table, but derived and not the safest canonical source |
| MCC_RPT_CUSTFEEDBACKSUMMARY | When using pre-aggregated customer feedback summaries | Feedback summary facts by org/date | Derived reporting table valuable for dashboards, not default raw analysis |
| MCC_SAMPLE_CHECKER_MST | When analyzing QA sample checker assignments | Sample checker master | Small master table with division and mobile mapping; niche QA use |
| MCC_TANKERGRVPOLICY | When analyzing tanker grievance eligibility/policy rules | Tanker policy lookup | Explicit tanker policy table; relevant only for tanker complaint logic |
| MCC_TANKEROFFENCE | When analyzing tanker offense cases | Tanker offense case details | Niche business table for tanker compliance investigations |
| MCC_TANKER_DOCKET_DTL | When analyzing tanker docket usage/status | Tanker docket detail table | Small operational reference table for tanker docket workflows |
| MCC_TANKER_FEDBK | When analyzing tanker feedback questionnaire definitions | Tanker feedback master | Metadata for tanker feedback capture; useful only with tanker feedback reporting |
| MCC_TANKER_FEDBK_CHOICE | When decoding tanker feedback choices | Choice master for tanker feedback | Optional feedback lookup table |
| MCC_TANKER_FEDBK_CHOICE_DTL | When ordering or versioning tanker feedback choices | Choice-detail/version table | Supporting metadata for feedback questionnaires |
| MCC_TANKER_FEDBK_COLL | When analyzing captured tanker feedback responses | Tanker feedback collection header | Transactional tanker feedback table, but specialized to a narrow use case |
| MCC_TANKER_FEDBK_COLL_DTL | When analyzing selected tanker feedback options | Tanker feedback collection detail | Child detail table for tanker feedback responses |
| MCC_TANKER_FEDBK_DTL | When analyzing tanker feedback question definitions | Tanker feedback detail master | Supporting questionnaire metadata |
| MCC_TANKER_RATES | When analyzing tanker pricing or amount slabs | Tanker rate lookup | Small reference table explicitly called out in the methodology as conditional |
| MCC_WARDFEEDBACK_NOTRECTIFIED | When reviewing ward-level not-rectified feedback cases | Exceptions list for ward feedback | Small business exception table; useful for a narrow quality-monitoring question set |
| MDM_MCC_COMPREASTYPE | When mapping complaint types to complaint reasons | Bridge between complaint type and reason | Small MDM bridge table supporting valid type/reason combinations |
| MDM_MCC_DIVTOGULFERSMAPPING | When routing tanker/gulfer operations by division | Division-to-gulfer mapping | Operational master for tanker assignment routing |
| MDM_MCC_DIVTOSTPMAPPING | When routing STP operations by division | Division-to-STP mapping | Small routing master needed only for STP-related work |
| MDM_MCC_ESTABLISHMENTTYPES | When segmenting complaints by establishment type | Establishment type lookup | Small niche lookup table |
| MDM_MCC_GHMCWARDOFFICERS | When joining complaints to GHMC ward officers | GHMC ward officer directory | Business-relevant routing directory, but not part of every grievance query |
| MDM_MCC_GULFERS | When decoding gulfer/operator assignments | Gulfer/operator master | Specialized operational master for tanker workflows |
| MDM_MCC_GULFER_STPS | When analyzing STP-linked gulfer operations | STP master/in-charge mapping | Very small specialty master table |
| MDM_MCC_HMWSSBWARDOFFICERS | When joining complaints to HMWSSB ward officers | HMWSSB ward officer directory | Alternate ward-officer reference used for routing/escalation |
| MDM_MCC_PWSCAUSES | When analyzing polluted water supply causes | PWS cause lookup | Specialty lookup for a specific complaint family |
| MDM_MCC_QATLAB | When analyzing QA lab assignments | QA lab master | Small specialty master used in QA workflows |
| MDM_MCC_QATLABDIVMAPPING | When mapping QA labs to divisions | QA lab-to-division mapping | Supporting master for QA routing |
| MDM_MCC_ROADTYPES | When road-cut or surface type analysis is requested | Road type lookup | Zero rows today, but schema is a legitimate lookup and not obviously a temp/backup object |
| MDM_MCC_SLATIME | When evaluating SLA bands by complaint reason | SLA timing matrix | Core SLA reference for operational SLA analysis, but not required for every complaint question |
| MDM_MCC_SLA_CHARTER | When looking up citizen charter days by reason | SLA charter lookup | Small policy lookup adjacent to SLA analysis |
| MDM_MCC_TANKER_COMPREASON | When decoding tanker-specific complaint reasons | Tanker complaint reason lookup | Specialty lookup for tanker complaints only |
| MDM_MCC_TANKER_FILLINGSTATIONS | When decoding filling-station codes/names | Filling station master | Tanker-specific operational master |
| MDM_MCC_WARDOFFICERS | When mapping grievances to ward officers | Ward officer directory | Routing/support master for ward-level operations |
| MDM_MCC_WARDUSERS | When reviewing assigned ward users/operators | Ward user roster | Roster-style master table for operations/admin questions |
| MCC_DIV_MANHOLES_DETAILS | When analyzing division-level manhole counts | Manhole detail facts by division and date range | Small but legitimate business table for a specific maintenance domain |
| MCC_DIV_MANHOLES_WORK_STAT | When analyzing manhole work progress | Manhole work status facts | Very small table, but columns indicate a real business metric rather than temp noise |

### NOT-REQUIRED Tables

| Table Name | Reason Excluded | Category | Classification Evidence |
|---|---|---|---|
| MCCCANS | Single-column working list, not a business entity | Working set | Only column is `CAN`; limited row count and no surrounding business attributes or relationships |
| MCC_GRIEVANCENUMBER | Sequence/number holder, not analytical data | Internal counter | One-row structure with only grievance number storage |
| MCC_GRIEVANCES040720 | Date-stamped snapshot copy | Snapshot | Tiny dated copy; name and row count indicate one-off extract |
| MCC_GRIEVANCES130720 | Date-stamped snapshot copy | Snapshot | Tiny dated copy; not a canonical transaction source |
| MCC_GRIEVANCES20200604 | Date-stamped snapshot copy | Snapshot | One-off dated extract with negligible row count |
| MCC_GRIEVANCES20200709 | Date-stamped snapshot copy | Snapshot | One-off dated extract with negligible row count |
| MCC_GRIEVANCES260520 | Date-stamped snapshot copy | Snapshot | Dated working copy with seven rows only |
| MCC_GRIEVANCES260520ALL | Historical extract/snapshot | Snapshot | Dated suffix and non-canonical naming indicate a pull created for a one-time exercise |
| MCC_GRIEVANCES260920 | Date-stamped snapshot copy | Snapshot | Dated copy with very small row count |
| MCC_GRIEVANCES29052020 | Date-stamped snapshot copy | Snapshot | One-off dated extract |
| MCC_GRIEVANCES290620 | Date-stamped snapshot copy | Snapshot | One-off dated extract |
| MCC_GRIEVANCES30052020 | Date-stamped snapshot copy | Snapshot | One-off dated extract |
| MCC_GRIEVANCESPENDING | One-row pending scratch table | Working set | Single-row non-canonical grievance subset, not a reusable business source |
| MCC_GRIEVANCES_BKP_20251215 | Explicit backup table | Backup | `_BKP_` suffix plus small stale copy pattern |
| MCC_GRIEVANCES_GULFER | Specialized duplicate subset of grievances | Derived subset | Narrow grievance subset by name, low row count, and overlaps with main grievance table |
| MCC_GRIEVANCES_ISSUE23DT | Issue-fix scratch table | Issue scratch | `ISSUE` suffix plus one-row footprint indicate ad hoc remediation data |
| MCC_GRIEVANCES_ISSUE23DT1 | Issue-fix scratch table | Issue scratch | `ISSUE` suffix plus tiny row count indicate ad hoc remediation data |
| MCC_GRVASNDGULFER_HISTOR | History/archive fragment | History | `HISTOR` suffix and one-row count show archival residue, not active analysis data |
| MCC_MANUALUPDFAILEDTANKERSTATUS | Failure-recovery operational table | Operational fixup | Name explicitly indicates manual repair of failed status updates, not business reporting |
| MCC_RESOLVNGATHRTYAUDIT | Audit trail table | Audit | `AUDIT` pattern plus old/new authority and forwarded-by columns |
| MCC_STP_FLOWDETAILS | Empty specialty table with metadata-heavy columns | Empty/operational | Zero rows plus `CREATEDBY`/`MODIFIEDBY` pattern and narrow operational purpose |
| MCC_TANKERBOOOKING_LATLONG_HISTORY | Empty history table | History | Zero rows and explicit `HISTORY` suffix |
| MCC_TANKERPINNOAUDIT | Audit log of PIN views | Audit | Audit-style columns (`USERID`, `USERNAME`, `VIEWEDON`, `REASON`) and narrow monitoring purpose |
| MCC_COMPLAINT_REASON | Duplicate of canonical MDM complaint-reason lookup | Duplicate lookup | Same shape/purpose as `MDM_MCC_COMPREASON`; prefer the MDM-owned table |
| MDM_MCC_GULFERS_BKP1 | Explicit backup of gulfer master | Backup | `_BKP1` suffix makes this a backup copy |
| MDM_MCC_TANKER_REASONDETAILS | Empty grievance-linked detail table stored under MDM namespace | Empty/specialized | Zero rows and transaction-style columns (`GRIEVPKEY`, `FILLINGSTATIONCODE`) make it unsuitable as a stable lookup/source |

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

### Session 1: 2026-05-09
- Module: MCC
- Date: 2026-05-09
- Tables Classified: 88
- REQUIRED: 8 | MAYBE: 54 | NOT-REQUIRED: 26
- Key Findings: `MCC_GRIEVANCES` and `MCC_COMPLAINT` are the two canonical complaint transaction tables; most `MDM_MCC_*` objects are lookups or routing masters; only obvious dated snapshots, backups, audit tables, and fixup tables were excluded.
- Next: Classify the `RBS` module in Session 2 and keep `MCC_SECT_*` location hierarchy objects for the `SHARED/CROSS` batch.

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
