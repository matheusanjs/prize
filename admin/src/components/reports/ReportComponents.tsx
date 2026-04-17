'use client';

import { useState, ReactNode } from 'react';
import { Calendar, Download, Loader2 } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtInt(v: number) {
  return v.toLocaleString('pt-BR');
}

export function ReportShell({
  title,
  icon,
  loading,
  error,
  from,
  to,
  setFrom,
  setTo,
  onRefresh,
  children,
}: {
  title: string;
  icon: ReactNode;
  loading: boolean;
  error: boolean;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h1 className="text-2xl font-black text-th">{title}</h1>
            <p className="text-xs text-th-muted mt-0.5">Dados reais do sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-th-card border border-th rounded-xl px-3 py-2">
            <Calendar size={14} className="text-th-muted" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-transparent text-sm text-th outline-none w-[120px]" />
            <span className="text-th-muted text-xs">até</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-transparent text-sm text-th outline-none w-[120px]" />
          </div>
          <button onClick={onRefresh} disabled={loading} className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-600 transition disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Gerar
          </button>
        </div>
      </div>
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500 text-sm">Erro ao carregar relatório.</div>}
      {loading && !error && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-th-card rounded-2xl" />)}</div>
          <div className="h-64 bg-th-card rounded-2xl" />
        </div>
      )}
      {!loading && !error && children}
    </div>
  );
}

export function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-th-card rounded-2xl border border-th p-5">
      <p className="text-[10px] font-bold text-th-muted uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-black mt-1 ${color || 'text-th'}`}>{value}</p>
      {sub && <p className="text-xs text-th-muted mt-1">{sub}</p>}
    </div>
  );
}

export function BarChart({ data, labelKey, valueKey, prefix, height }: { data: any[]; labelKey: string; valueKey: string; prefix?: string; height?: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-th-muted text-center py-8">Sem dados</p>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div className={`flex items-end gap-[2px] ${height || 'h-40'}`}>
      {data.map((item, i) => {
        const val = item[valueKey] || 0;
        const pct = Math.max((val / max) * 100, 2);
        const label = typeof item[labelKey] === 'string' && item[labelKey].includes('T')
          ? new Date(item[labelKey]).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : String(item[labelKey] || '');
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-0">
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-th-card border border-th rounded-lg px-2 py-1 text-[10px] text-th font-bold shadow-lg whitespace-nowrap">
              {prefix || ''}{typeof val === 'number' ? fmt(val) : val} · {label}
            </div>
            <div className="w-full bg-primary-500/80 rounded-t-sm hover:bg-primary-500 transition-colors min-h-[2px]" style={{ height: `${pct}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export function DataTable({ columns, rows }: { columns: { key: string; label: string; align?: string; fmt?: (v: any) => string }[]; rows: any[] }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-th-muted text-center py-6">Nenhum dado</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-th">
            {columns.map(c => (
              <th key={c.key} className={`py-2 px-3 text-[10px] font-bold text-th-muted uppercase tracking-wider ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-th/50 hover:bg-th-hover transition">
              {columns.map(c => (
                <td key={c.key} className={`py-2.5 px-3 ${c.align === 'right' ? 'text-right font-bold' : ''} text-th-secondary`}>
                  {c.fmt ? c.fmt(row[c.key]) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HBar({ items, valueKey, labelKey, colorClass }: { items: any[]; valueKey: string; labelKey: string; colorClass?: string }) {
  if (!items || items.length === 0) return <p className="text-sm text-th-muted text-center py-4">Sem dados</p>;
  const max = Math.max(...items.map(i => i[valueKey] || 0), 1);
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = Math.round((item[valueKey] / max) * 100);
        return (
          <div key={i}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-th-secondary font-medium truncate">{item[labelKey]}</span>
              <span className="text-th font-bold">{typeof item[valueKey] === 'number' && item[valueKey] > 100 ? fmt(item[valueKey]) : fmtInt(item[valueKey])}</span>
            </div>
            <div className="h-2 bg-th-surface rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${colorClass || 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PieList({ items, labelKey, valueKey, total }: { items: any[]; labelKey: string; valueKey: string; total?: number }) {
  const colors = ['bg-primary-500', 'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-red-500', 'bg-violet-500', 'bg-cyan-500', 'bg-pink-500'];
  const sum = total || items.reduce((s, i) => s + (i[valueKey] || 0), 0);
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = sum > 0 ? Math.round((item[valueKey] / sum) * 100) : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors[i % colors.length]}`} />
            <span className="text-sm text-th-secondary flex-1 truncate">{item[labelKey]}</span>
            <span className="text-sm font-bold text-th">{fmtInt(item[valueKey])}</span>
            <span className="text-xs text-th-muted w-10 text-right">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function useReportDates() {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [from, setFrom] = useState(sixMonthsAgo.toISOString().split('T')[0]);
  const [to, setTo] = useState(now.toISOString().split('T')[0]);
  return { from, to, setFrom, setTo };
}

export function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-th-card rounded-2xl border border-th p-6 ${className || ''}`}>
      {title && <h3 className="font-bold text-th mb-4">{title}</h3>}
      {children}
    </div>
  );
}
