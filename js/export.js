/* global jspdf, ExcelJS */
import { nowBrasilia, todayISO } from './utils.js';

/**
 * Documento genérico:
 * { title, subtitle, shop, kpis: [[label, valueText]], sections: [{ title, head: [..], rows: [[..]], align?: ['left','right',..], foot?: [..] }] }
 */
export function exportPDF(doc, filename) {
  if (!window.jspdf) throw new Error('Biblioteca de PDF não carregada.');
  const { jsPDF } = jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const M = 40;
  const GOLD = [176, 136, 22];
  const DARK = [22, 22, 22];

  // Cabeçalho
  pdf.setFillColor(...DARK);
  pdf.rect(0, 0, W, 78, 'F');
  pdf.setFillColor(...GOLD);
  pdf.rect(0, 78, W, 3, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text(doc.title, M, 36);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(210, 200, 170);
  pdf.text(`${doc.shop || ''}${doc.shop ? '  •  ' : ''}${doc.subtitle || ''}`, M, 56);
  pdf.setFontSize(8);
  pdf.text(`Gerado em ${nowBrasilia()} (horário de Brasília)`, W - M, 56, { align: 'right' });

  let y = 104;
  // Indicadores
  if (doc.kpis?.length) {
    const cols = Math.min(4, doc.kpis.length);
    const gap = 8;
    const bw = (W - 2 * M - gap * (cols - 1)) / cols;
    doc.kpis.forEach(([label, value], i) => {
      const cx = M + (i % cols) * (bw + gap);
      const cy = y + Math.floor(i / cols) * 54;
      pdf.setFillColor(247, 244, 236);
      pdf.setDrawColor(230, 220, 190);
      pdf.roundedRect(cx, cy, bw, 46, 4, 4, 'FD');
      pdf.setTextColor(110, 105, 95);
      pdf.setFontSize(7.5);
      pdf.text(label.toUpperCase(), cx + 9, cy + 16);
      pdf.setTextColor(20, 20, 20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text(String(value), cx + 9, cy + 35);
      pdf.setFont('helvetica', 'normal');
    });
    y += Math.ceil(doc.kpis.length / cols) * 54 + 14;
  }

  for (const s of doc.sections || []) {
    if (y > pdf.internal.pageSize.getHeight() - 120) {
      pdf.addPage();
      y = 50;
    }
    pdf.setTextColor(20, 20, 20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    pdf.text(s.title, M, y);
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(1.2);
    pdf.line(M, y + 5, M + 28, y + 5);
    pdf.setFont('helvetica', 'normal');
    const colStyles = {};
    (s.align || []).forEach((a, i) => (colStyles[i] = { halign: a }));
    pdf.autoTable({
      startY: y + 12,
      head: [s.head],
      body: s.rows.length ? s.rows : [[{ content: 'Sem dados no período', colSpan: s.head.length, styles: { halign: 'center', textColor: 140 } }]],
      foot: s.foot ? [s.foot] : undefined,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 5, lineColor: [228, 224, 214], lineWidth: 0.5, textColor: 30 },
      headStyles: { fillColor: DARK, textColor: [232, 205, 120], fontStyle: 'bold' },
      footStyles: { fillColor: [247, 244, 236], textColor: 20, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [251, 250, 247] },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if ((d.section === 'head' || d.section === 'foot') && s.align?.[d.column.index]) d.cell.styles.halign = s.align[d.column.index];
      },
    });
    y = pdf.lastAutoTable.finalY + 26;
  }

  // Rodapé com paginação
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Página ${i} de ${pages}`, W - M, pdf.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  pdf.save(filename || `relatorio-${todayISO()}.pdf`);
}

/**
 * Planilha: { title, subtitle, kpis: [[label, rawValue, fmt]], sections: [{ title, head, rows (valores brutos), formats: ['text'|'money'|'int'|'pct'|'date'] , sheet?: nome }] }
 * Valores monetários devem vir em reais (número), datas como Date ou texto DD/MM/AAAA.
 */
export async function exportXLSX(doc, filename) {
  if (!window.ExcelJS) throw new Error('Biblioteca de Excel não carregada.');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestão Financeira Barbearia';
  wb.created = new Date();
  const FMT = { money: '"R$" #,##0.00;[Red]-"R$" #,##0.00', int: '#,##0', pct: '0.0"%"', text: '@' };
  const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF161616' } };
  const headFont = { bold: true, color: { argb: 'FFE8CD78' } };

  // Aba resumo
  const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 22 }];
  ws.addRow([doc.title]).font = { bold: true, size: 15 };
  ws.addRow([`${doc.shop ? doc.shop + ' • ' : ''}${doc.subtitle || ''}`]).font = { color: { argb: 'FF6E695F' } };
  ws.addRow([`Gerado em ${nowBrasilia()} (horário de Brasília)`]).font = { size: 9, color: { argb: 'FF8A877F' } };
  ws.addRow([]);
  const h = ws.addRow(['Indicador', 'Valor']);
  h.eachCell((c) => {
    c.fill = headFill;
    c.font = headFont;
  });
  for (const [label, value, fmt] of doc.kpis || []) {
    const r = ws.addRow([label, value ?? '—']);
    if (fmt && typeof value === 'number') r.getCell(2).numFmt = FMT[fmt];
    r.getCell(2).alignment = { horizontal: 'right' };
  }

  // Uma aba por seção
  const used = new Set(['Resumo']);
  for (const s of doc.sections || []) {
    let name = (s.sheet || s.title).replace(/[\\/?*[\]:]/g, '').slice(0, 31);
    while (used.has(name)) name = name.slice(0, 28) + '_' + used.size;
    used.add(name);
    const sh = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const hr = sh.addRow(s.head);
    hr.eachCell((c) => {
      c.fill = headFill;
      c.font = headFont;
      c.alignment = { vertical: 'middle' };
    });
    hr.height = 20;
    s.rows.forEach((row) => sh.addRow(row));
    if (s.foot) sh.addRow(s.foot).font = { bold: true };
    s.head.forEach((title, i) => {
      const col = sh.getColumn(i + 1);
      const f = s.formats?.[i];
      if (f && FMT[f] && f !== 'text') {
        col.numFmt = FMT[f];
        col.alignment = { horizontal: 'right' };
      }
      let max = String(title).length;
      s.rows.forEach((r) => (max = Math.max(max, String(r[i] ?? '').length + (f === 'money' ? 6 : 0))));
      col.width = Math.min(50, Math.max(10, max + 2));
    });
    if (s.rows.length) sh.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.head.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || `relatorio-${todayISO()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
