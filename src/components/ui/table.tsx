import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { compareListValues } from "@/lib/list-sorting";
import { cn } from "@/lib/utils";

type TableSort = { column: number; direction: "asc" | "desc" };
type SortContextValue = {
  sorts: TableSort[];
  toggle: (column: number, additive: boolean) => void;
  sortBody: (body: HTMLTableSectionElement) => void;
};

const SortContext = React.createContext<SortContextValue | null>(null);

function cellValue(cell?: HTMLTableCellElement) {
  const text = cell?.textContent?.trim() || "";
  if (!text || text === "-") return null;
  const numeric = text.replace(/[,%원명건대회]/g, "").replace(/\s/g, "");
  if (/^-?\d+(?:\.\d+)?$/.test(numeric)) return Number(numeric);
  if (/^\d{4}[.-]\d{1,2}[.-]\d{1,2}/.test(text)) return new Date(text.replace(/\./g, "-")).getTime();
  return text;
}

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, forwardedRef) => {
    const tableRef = React.useRef<HTMLTableElement>(null);
    const [sorts, setSorts] = React.useState<TableSort[]>([]);
    React.useImperativeHandle(forwardedRef, () => tableRef.current as HTMLTableElement);

    const toggle = React.useCallback((column: number, additive: boolean) => {
      setSorts((current) => {
        const existing = current.find((sort) => sort.column === column);
        const next = existing
          ? { column, direction: existing.direction === "asc" ? "desc" as const : "asc" as const }
          : { column, direction: "asc" as const };
        if (!additive) return [next];
        return [next, ...current.filter((sort) => sort.column !== column)].slice(0, 3);
      });
    }, []);

    const sortBody = React.useCallback((body: HTMLTableSectionElement) => {
      if (sorts.length === 0) return;
      const rows = Array.from(body.rows).map((row, index) => ({ row, index }));
      const maxColumn = Math.max(...sorts.map((sort) => sort.column));
      if (rows.filter(({ row }) => row.cells.length > maxColumn).length < 2) return;
      rows.sort((left, right) => {
        const leftData = left.row.cells.length > maxColumn;
        const rightData = right.row.cells.length > maxColumn;
        if (leftData !== rightData) return leftData ? -1 : 1;
        for (const sort of sorts) {
          const compared = compareListValues(cellValue(left.row.cells[sort.column]), cellValue(right.row.cells[sort.column]));
          if (compared !== 0) return sort.direction === "asc" ? compared : -compared;
        }
        return left.index - right.index;
      });
      rows.forEach(({ row }) => body.appendChild(row));
    }, [sorts]);

    return <SortContext.Provider value={{ sorts, toggle, sortBody }}>
      <div className="relative w-full overflow-auto">
        <table ref={tableRef} className={cn("w-full caption-bottom text-sm", className)} {...props} />
      </div>
    </SortContext.Provider>;
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, forwardedRef) => {
    const localRef = React.useRef<HTMLTableSectionElement>(null);
    const context = React.useContext(SortContext);
    React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLTableSectionElement);
    React.useLayoutEffect(() => {
      if (localRef.current) context?.sortBody(localRef.current);
    }, [children, context]);
    return <tbody ref={localRef} className={cn("[&_tr:last-child]:border-0", className)} {...props}>{children}</tbody>;
  },
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />,
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={cn("border-b border-border/40 transition-colors duration-100 hover:bg-primary/[0.03] data-[state=selected]:bg-muted", className)} {...props} />,
);
TableRow.displayName = "TableRow";

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> { sortable?: boolean }

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, children, sortable = true, onClick, onKeyDown, ...props }, forwardedRef) => {
    const localRef = React.useRef<HTMLTableCellElement>(null);
    const context = React.useContext(SortContext);
    React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLTableCellElement);
    const column = localRef.current?.cellIndex ?? -1;
    const activeIndex = context?.sorts.findIndex((sort) => sort.column === column) ?? -1;
    const active = activeIndex >= 0 ? context?.sorts[activeIndex] : undefined;
    const blocked = !sortable || Boolean(props.colSpan && props.colSpan > 1) || ["관리", "작업", "액션"].includes(String(children));
    const activate = (event: React.MouseEvent<HTMLTableCellElement> | React.KeyboardEvent<HTMLTableCellElement>) => {
      if (blocked || !context || !localRef.current) return;
      context.toggle(localRef.current.cellIndex, event.shiftKey);
    };
    return <th
      ref={localRef}
      className={cn("h-11 px-3 text-left align-middle text-xs font-semibold text-muted-foreground bg-sunken whitespace-nowrap [&:has([role=checkbox])]:pr-0", !blocked && "cursor-pointer select-none hover:bg-muted", className)}
      aria-sort={active ? (active.direction === "asc" ? "ascending" : "descending") : undefined}
      tabIndex={blocked ? undefined : 0}
      title={blocked ? undefined : "정렬 전환 (Shift+클릭: 다중 정렬)"}
      onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) activate(event); }}
      onKeyDown={(event) => { onKeyDown?.(event); if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); activate(event); } }}
      {...props}
    >
      <span className="inline-flex w-full items-center gap-1.5">
        <span>{children}</span>
        {!blocked && (active ? (active.direction === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />) : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />)}
        {active && context && context.sorts.length > 1 && <span className="text-[10px] text-primary">{activeIndex + 1}</span>}
      </span>
    </th>;
  },
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn("px-3 py-3 align-middle whitespace-nowrap", className)} {...props} />,
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />,
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
