// Lightweight, dependency-free export helpers used across the Patient 360 Profile.
// CSV export doubles as "Export Excel" (Excel opens CSV natively).

export function exportToCSV(rows, columns, filename = 'export') {
  if (!rows || rows.length === 0) return;
  const headers = columns.map((c) => c.header);
  const keys = columns.map((c) => c.key);

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => keys.map((k) => escapeCell(row[k])).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Opens the browser print dialog for a section; user can "Save as PDF" from there.
export function printSection(elementId, title = 'Print') {
  const el = document.getElementById(elementId);
  if (!el) return;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f3f4f6; }
          h1 { font-size: 18px; margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${el.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
}
