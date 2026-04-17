'use client';

import Link from 'next/link';
import { Wallet, Calendar, Fuel, Ship, Wrench, Activity, UtensilsCrossed, Users, BarChart3, ArrowRight } from 'lucide-react';

const reports = [
  { title: 'Financeiro', desc: 'Receitas, cobranças, métodos de pagamento e inadimplência', href: '/reports/finance', icon: Wallet, color: 'from-green-500 to-emerald-600' },
  { title: 'Reservas', desc: 'Volume, status, por embarcação, dia da semana e top clientes', href: '/reports/reservations', icon: Calendar, color: 'from-blue-500 to-cyan-600' },
  { title: 'Combustível', desc: 'Consumo por embarcação, operador, preços e tendências', href: '/reports/fuel', icon: Fuel, color: 'from-amber-500 to-orange-600' },
  { title: 'Embarcações', desc: 'Performance individual: receita, custo, ocupação e manutenção', href: '/reports/boats', icon: Ship, color: 'from-primary-500 to-orange-500' },
  { title: 'Manutenção', desc: 'Custos, prioridades, tempo de resolução e histórico', href: '/reports/maintenance', icon: Wrench, color: 'from-red-500 to-rose-600' },
  { title: 'Operações', desc: 'Operações diárias, checklists, avarias e operadores', href: '/reports/operations', icon: Activity, color: 'from-violet-500 to-purple-600' },
  { title: 'Restaurante/Bar', desc: 'Faturamento, itens mais vendidos, horários de pico', href: '/reports/restaurant', icon: UtensilsCrossed, color: 'from-pink-500 to-rose-600' },
  { title: 'Clientes', desc: 'Atividade, novos clientes, pontualidade e top gastadores', href: '/reports/clients', icon: Users, color: 'from-teal-500 to-cyan-600' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary-500/10">
          <BarChart3 size={24} className="text-primary-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-th">Relatórios</h1>
          <p className="text-xs text-th-muted mt-0.5">Análises detalhadas com dados reais do sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {reports.map(r => (
          <Link key={r.href} href={r.href} className="group bg-th-card rounded-2xl border border-th p-5 hover:border-primary-500/30 hover:shadow-lg hover:shadow-primary-500/5 transition-all duration-300">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${r.color} flex items-center justify-center mb-3 shadow-lg`}>
              <r.icon size={20} className="text-white" />
            </div>
            <h3 className="font-bold text-th group-hover:text-primary-500 transition">{r.title}</h3>
            <p className="text-xs text-th-muted mt-1 leading-relaxed">{r.desc}</p>
            <div className="flex items-center gap-1 text-primary-500 text-xs font-bold mt-3 opacity-0 group-hover:opacity-100 transition">
              Ver relatório <ArrowRight size={12} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
