# Graph Memory for DB Query Agents — Scaling to Large Production Databases

This document captures how a Neo4j knowledge-graph "memory" for a DB query AI agent should
change when moving from a small, clean schema (≈10 tables) to a large, messy production
schema (2k–3k tables with duplicate, temporary, old, and backup tables).

It was distilled from a working POC where an AI agent used two MCP servers:
- **Supabase MCP** — live data store (raw rows, current schema via `information_schema`)
- **Neo4j MCP** — curated long-term memory (schema map + human judgment)

---

## Core principle (holds at every scale)

> **Store only facts that are stable and high-value. Do not mirror the whole DB.**

The live database already knows its own schema. The graph's job is to store the things the
live schema *cannot* tell you, and to do so in a form that is cheap to retrieve.

What changes with scale is **which facts are the high-value ones**.

---

## Small schema (≈10 tables) — what the graph stored

At small scale the graph was a convenience that saved a few round-trips:

- `(:Project)-[:HAS_TABLE]->(:Table)-[:HAS_COLUMN]->(:Column)`
- `Table.purpose`, `Column.type`, `Column.purpose`
- `(:Column)-[:REFERENCES]->(:Column)` edges for foreign keys
- `Column.enum_values` for columns with CHECK constraints

Retrieval pattern: **load-all**. A single `MATCH p=()-[]->() RETURN p` returns every node
*with all its properties* (names, types, purposes) — small enough to drop into context at
session start.

At this scale the live `list_tables(verbose=true)` is actually competitive with the graph.
The measured win was **correctness** (zero failed queries vs. one query that guessed wrong
column names), not a dramatic token saving.

---

## Large production schema (2k–3k tables) — what changes

### 1. "Load everything at session start" dies
3k tables × ~20 columns ≈ 60k+ column nodes. Far too much for context.
**The graph stops being something you preload and becomes something you search.**

Retrieval pattern flips from **load-all** to **search-then-expand**:
1. Find the relevant subsystem by domain/keyword
2. Pull just those tables + their FK neighbors
3. Ignore the other ~2,950 tables

### 2. The graph's value inverts — it becomes a curated index over chaos
With clean tables, the live schema is fine to read directly. With 3k messy tables, the live
schema is a swamp: `users_old`, `users_bak_2019`, `tmp_migration_x`, `users_v2_final_FINAL`.

`list_tables` cannot tell you **which tables are real**. The graph can. That classification
is now the single highest-value thing the graph stores.

### 3. The most valuable field is now classification, not structure
The most stable *and* most valuable fact at scale is **what's alive vs. abandoned**.

Add a `status` property on `Table` nodes:
- `active` — the real, current table
- `deprecated` — superseded but still present
- `backup` — snapshot/backup copy
- `temp` — migration/scratch table
- `unknown` — not yet classified

### 4. Group by domain/subsystem — nobody reasons about 3k flat tables
```
(:Domain {name: "billing"})-[:CONTAINS]->(:Table)
```
The agent should retrieve a *subsystem* ("the billing tables"), not the whole graph.

### 5. Keep FK edges and enums — but they're now secondary
`(:Column)-[:REFERENCES]->(:Column)` and `Column.enum_values` are still valuable
(instant join paths, correct WHERE filters), but they rank below **classification** and
**domain grouping** for retrieval.

---

## What you must NOT do at scale

- **Do not hand-curate 3k tables** the way 9 tables were curated. Initial population must be
  **automated** — script the FK edges, column types, and enum values straight from
  `information_schema`.
- **Do not store named query patterns / per-question intent.** These are volatile, grow
  unbounded, go stale, and confuse fresh sessions. An agent can re-derive joins from
  `REFERENCES` edges in one traversal anyway.
- **Do not trust a node blindly.** A 3k-table production graph drifts constantly (migrations,
  new tables daily). Always treat the graph as a hint, verify against live schema when it
  matters.

---

## What needs human / AI-assisted judgment (cannot be auto-derived)

Auto-derivable from `information_schema`: table list, columns, types, PK/FK, enum/CHECK values.

**Not** reliably auto-derivable — needs human input or AI classification that a human
spot-checks:
- `Table.status` (active / deprecated / backup / temp)
- `Table.purpose`
- `Domain` grouping

---

## Staleness is the central operational problem at scale

A 9-table graph drifts slowly. A 3k-table production graph drifts constantly.

You need a **periodic reconciliation job**:
- Diff `information_schema` against the graph
- Flag new tables (status `unknown`, awaiting classification)
- Flag dropped tables (mark removed, don't silently keep)
- Re-confirm FK edges and enum values

---

## Summary table — small vs. large schema

| Dimension | ≈10 clean tables | 2k–3k messy tables |
|---|---|---|
| Graph's role | Convenience, saves round-trips | Curated index over chaos |
| Retrieval pattern | Load-all at session start | Search-then-expand by domain |
| Highest-value fact | FK relationships | **Table classification (alive vs. dead)** |
| Population | Hand-curated | Automated from `information_schema` |
| Domain grouping | Not needed | Essential |
| Query patterns stored | No | No (even more important to skip) |
| Staleness handling | Occasional | Periodic reconciliation job required |
| vs. live `list_tables` | Roughly competitive | Graph wins decisively |

---

## One-line takeaway

> At small scale the graph **stores the schema**; at production scale the graph **stores the
> human judgment the schema lacks** — what's alive, what's abandoned, what belongs together —
> and is *searched*, never *preloaded*.