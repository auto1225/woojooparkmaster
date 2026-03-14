import type { MasterColumn } from "@/components/common/MasterDataView";

export interface ExcelSheetConfig {
  name: string;
  columns: MasterColumn[];
  data: Record<string, any>[];
}

/** Master Excel export using xlsx */
export function exportMasterExcel(config: {
  fileName: string;
  orgName: string;
  title: string;
  columns: MasterColumn[];
  data: Record<string, any>[];
  mode: 'current' | 'full' | 'multi';
  sheets?: ExcelSheetConfig[];
}): void {
  import('xlsx').then(XLSX => {
    const wb = XLSX.utils.book_new();

    const buildSheet = (cols: MasterColumn[], data: Record<string, any>[], sheetTitle: string) => {
      const wsData: any[][] = [];

      // Header rows
      if (config.orgName) wsData.push([config.orgName]);
      wsData.push([sheetTitle]);
      wsData.push([`출력일시: ${new Date().toLocaleString('ko-KR')}`]);
      wsData.push([]);

      // Group headers
      const groups: { name: string; span: number }[] = [];
      let currentGroup = '';
      cols.forEach(c => {
        const g = c.group || '';
        if (g !== currentGroup) {
          groups.push({ name: g, span: 1 });
          currentGroup = g;
        } else {
          groups[groups.length - 1].span++;
        }
      });
      
      const groupRow: string[] = [];
      groups.forEach(g => {
        groupRow.push(g.name);
        for (let i = 1; i < g.span; i++) groupRow.push('');
      });
      wsData.push(groupRow);

      // Column headers
      wsData.push(cols.map(c => c.label));

      // Data rows
      data.forEach(row => {
        wsData.push(cols.map(c => {
          const val = row[c.key];
          if (val == null) return '';
          if (c.format === 'currency' || c.format === 'number') return typeof val === 'number' ? val : Number(val) || 0;
          if (c.format === 'percent') return typeof val === 'number' ? val : Number(val) || 0;
          if (c.format === 'boolean') {
            const labels = c.booleanLabels || { true: 'Y', false: 'N' };
            return (val === true || val === 'true' || val === 1) ? labels.true : labels.false;
          }
          if (c.format === 'badge' && c.badgeMap && c.badgeMap[val]) return c.badgeMap[val].label;
          if (c.format === 'date' && typeof val === 'string') return val.split('T')[0];
          return String(val);
        }));
      });

      // Sub-total row
      const hasSub = cols.some(c => c.subTotal);
      if (hasSub) {
        const sumRow = cols.map((c, i) => {
          if (i === 0) return '합계';
          if (!c.subTotal) return '';
          const vals = data.map(r => Number(r[c.key]) || 0);
          switch (c.subTotal) {
            case 'sum': return vals.reduce((a, b) => a + b, 0);
            case 'avg': return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
            case 'count': return vals.filter(v => v !== 0).length;
            case 'max': return Math.max(...vals);
            case 'min': return Math.min(...vals);
            default: return '';
          }
        });
        wsData.push(sumRow);
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = cols.map(c => ({ wch: Math.max(Math.min(c.width ? c.width / 8 : Math.max(c.label.length * 2, 10), 30), 8) }));

      // Merge group header cells
      const merges: any[] = [];
      let colOffset = 0;
      const groupRowIdx = config.orgName ? 4 : 3;
      groups.forEach(g => {
        if (g.span > 1) {
          merges.push({ s: { r: groupRowIdx, c: colOffset }, e: { r: groupRowIdx, c: colOffset + g.span - 1 } });
        }
        colOffset += g.span;
      });
      // Title merges
      if (config.orgName) {
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(cols.length - 1, 5) } });
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: Math.min(cols.length - 1, 5) } });
      }
      ws['!merges'] = merges;

      return ws;
    };

    if (config.mode === 'multi' && config.sheets) {
      config.sheets.forEach(sheet => {
        const ws = buildSheet(sheet.columns, sheet.data, sheet.name);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
      });
    } else {
      const ws = buildSheet(config.columns, config.data, config.title);
      XLSX.utils.book_append_sheet(wb, ws, '종합현황');
    }

    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const prefix = config.orgName ? `${config.orgName}_` : '';
    XLSX.writeFile(wb, `${prefix}${config.fileName}_${dateStr}.xlsx`);
  });
}
