const BLOCKED_SQL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i, "Data-changing statements are not allowed."],
  [/\b(?:CREATE|ALTER|DROP|TRUNCATE|RENAME|COMMENT)\b/i, "Schema changes are not allowed."],
  [/\b(?:GRANT|REVOKE|AUDIT|NOAUDIT)\b/i, "Permission changes are not allowed."],
  [/\b(?:BEGIN|DECLARE|CALL|EXECUTE|COMMIT|ROLLBACK|SAVEPOINT)\b/i, "PL/SQL and transaction commands are not allowed."],
  [/\bFOR\s+UPDATE\b/i, "SELECT FOR UPDATE is not allowed."],
  [/\bINTO\b/i, "SELECT INTO is not allowed."],
  [/\b(?:DBMS|UTL|OWA|HTP|HTF)_[A-Z0-9_$#]*\b/i, "Oracle system packages are not allowed."],
  [/\b(?:SYS|SYSTEM)\s*\./i, "Oracle system schemas are not allowed."],
];

export class SqlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlSafetyError";
  }
}

function maskLiteralsAndComments(sql: string): string {
  let output = "";
  let index = 0;
  let state: "normal" | "single" | "double" | "line" | "block" = "normal";

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === "normal") {
      if (char === "'") {
        state = "single";
        output += " ";
      } else if (char === '"') {
        state = "double";
        output += " ";
      } else if (char === "-" && next === "-") {
        state = "line";
        output += "  ";
        index += 1;
      } else if (char === "/" && next === "*") {
        state = "block";
        output += "  ";
        index += 1;
      } else {
        output += char;
      }
    } else if (state === "single") {
      output += " ";
      if (char === "'" && next === "'") {
        output += " ";
        index += 1;
      } else if (char === "'") {
        state = "normal";
      }
    } else if (state === "double") {
      output += " ";
      if (char === '"' && next === '"') {
        output += " ";
        index += 1;
      } else if (char === '"') {
        state = "normal";
      }
    } else if (state === "line") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "normal";
    } else {
      output += " ";
      if (char === "*" && next === "/") {
        output += " ";
        index += 1;
        state = "normal";
      }
    }

    index += 1;
  }

  if (state === "single" || state === "double" || state === "block") {
    throw new SqlSafetyError("The SQL contains an unfinished string or comment.");
  }

  return output;
}

export interface ValidatedSql {
  sql: string;
  referencedObjects: string[];
}

export function validateReadonlySql(input: string): ValidatedSql {
  let sql = input.trim();
  if (!sql) throw new SqlSafetyError("A SQL query is required.");
  if (sql.length > 50_000) {
    throw new SqlSafetyError("The SQL query is too long.");
  }
  if (sql.includes("\0")) {
    throw new SqlSafetyError("The SQL query contains invalid characters.");
  }

  if (/q\s*'/i.test(sql)) {
    throw new SqlSafetyError("Oracle alternative-quoted strings are not supported.");
  }

  if (sql.endsWith(";")) sql = sql.slice(0, -1).trimEnd();
  const inspectable = maskLiteralsAndComments(sql);

  if (inspectable.includes(";")) {
    throw new SqlSafetyError("Only one SQL statement is allowed.");
  }
  if (inspectable.includes("@")) {
    throw new SqlSafetyError("Database links are not allowed.");
  }
  if (!/^\s*(?:SELECT|WITH)\b/i.test(inspectable)) {
    throw new SqlSafetyError("Only read-only SELECT queries are allowed.");
  }

  for (const [pattern, message] of BLOCKED_SQL_PATTERNS) {
    if (pattern.test(inspectable)) throw new SqlSafetyError(message);
  }

  const referencedObjects = [
    ...inspectable.matchAll(
      /\b(?:FROM|JOIN)\s+([A-Z][A-Z0-9_$#]*(?:\s*\.\s*[A-Z][A-Z0-9_$#]*)?)/gi,
    ),
  ].map((match) => match[1].replace(/\s+/g, "").toUpperCase());

  return { sql, referencedObjects: [...new Set(referencedObjects)] };
}
