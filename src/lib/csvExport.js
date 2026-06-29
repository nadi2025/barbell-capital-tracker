/**
 * csvExport — minimal CSV download helper.
 *
 * Builds an RFC 4180-ish CSV from an array of objects + column definitions,
 * prepends a UTF-8 BOM (so Excel renders Hebrew correctly), and triggers
 * a client-side download.
 */

function escapeCell(value) {
  if (value == null) return "";
  const s = String(value);
  // Quote if it contains comma, quote, newline, or leading/trailing whitespace
  if (/[",\n\r]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {string} filename — base name (without extension)
 * @param {Array<{key: string, label: string, format?: (row: any) => any}>} columns
 * @param {Array<object>} rows
 */
export function downloadCsv(filename, columns, rows) {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.format ? c.format(row) : row[c.key];
      return escapeCell(v);
    }).join(","),
  ).join("\n");

  const csv = "\uFEFF" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filename}_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}