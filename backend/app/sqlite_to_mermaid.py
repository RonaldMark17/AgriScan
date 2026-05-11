import sqlite3
import sys
from pathlib import Path


def quote(name):
    return name.replace('"', '""')


def get_tables(conn):
    cur = conn.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name NOT LIKE 'sqlite_%' "
        "ORDER BY name"
    )
    return [r[0] for r in cur.fetchall()]


def columns_for(conn, table):
    cur = conn.execute(f'PRAGMA table_info("{quote(table)}")')
    fk_columns = {from_col for _, from_col, _ in fks_for(conn, table)}
    cols = []
    for cid, name, ctype, notnull, dflt, pk in cur.fetchall():
        typ = ctype or "any"
        keys = []
        if pk:
            keys.append("PK")
        if name in fk_columns:
            keys.append("FK")
        key = f" {','.join(keys)}" if keys else ""
        cols.append(f"{typ} {name}{key}")
    return cols


def fks_for(conn, table):
    cur = conn.execute(f'PRAGMA foreign_key_list("{quote(table)}")')
    fks = []
    for r in cur.fetchall():
        # (id, seq, table, from, to, on_update, on_delete, match)
        _id, seq, ref_table, from_col, to_col, *_ = r
        fks.append((ref_table, from_col, to_col))
    return fks


def build_diagram(db):
    conn = sqlite3.connect(db)
    tables = get_tables(conn)
    lines = ["erDiagram"]
    for t in tables:
        cols = columns_for(conn, t)
        lines.append(f"    {t} {{")
        for c in cols:
            lines.append(f"        {c}")
        lines.append("    }")
    # relationships: parent (ref) to child (table)
    for t in tables:
        for ref_table, from_col, to_col in fks_for(conn, t):
            label = f"{t}.{from_col}->{ref_table}.{to_col}"
            lines.append(f'    {ref_table} ||--o{{ {t} : "{label}"')
    conn.close()
    return "\n".join(lines)


def main(db, output=None):
    diagram = build_diagram(db)
    if output:
        Path(output).write_text(diagram + "\n", encoding="utf-8")
        print(f"Wrote Mermaid ER diagram to {output}")
        return
    print(diagram)


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print("Usage: python sqlite_to_mermaid.py path/to/db.sqlite [output.mmd]")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)
