import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { Progress } from "../components/ui/progress";
import { Input } from "../components/ui/input";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  ListTodo, CheckCircle2, Clock, Loader2, Eye, RefreshCw, AlertTriangle, Target as TargetIcon,
} from "lucide-react";
import { CHART_COLORS } from "../lib/constants";

const StatCard = ({ label, value, icon: Icon, color, testid }) => (
  <div className="bg-white border border-zinc-200 rounded-lg p-4 flex items-center gap-4" data-testid={testid}>
    <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
      <Icon className="w-5 h-5" style={{ color }} strokeWidth={2.2} />
    </div>
    <div>
      <p className="text-2xl font-bold text-zinc-900 leading-none font-display">{value}</p>
      <p className="text-xs text-zinc-500 mt-1 font-medium">{label}</p>
    </div>
  </div>
);

const Panel = ({ title, children, testid, action }) => (
  <div className="bg-white border border-zinc-200 rounded-lg" data-testid={testid}>
    <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-700">{title}</h3>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);

export default function Dashboard() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/dashboard", { params: { date } });
      setData(data);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  const s = data.stats;
  const pie = (data.charts.status_distribution || []).filter((d) => d.value > 0);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Review Dashboard</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter text-zinc-900">Daily & Monthly Clarity</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
            data-testid="dashboard-date-picker"
          />
          <button
            onClick={load}
            data-testid="dashboard-refresh"
            className="h-9 w-9 flex items-center justify-center border border-zinc-300 rounded-md hover:bg-zinc-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-zinc-600" />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Tasks Today" value={s.total} icon={ListTodo} color="#09090b" testid="stat-total" />
        <StatCard label="Completed" value={s.completed} icon={CheckCircle2} color="#10b981" testid="stat-completed" />
        <StatCard label="Pending" value={s.pending} icon={Clock} color="#a1a1aa" testid="stat-pending" />
        <StatCard label="Working" value={s.working} icon={Loader2} color="#3b82f6" testid="stat-working" />
        <StatCard label="Waiting Review" value={s.sent_for_review} icon={Eye} color="#f59e0b" testid="stat-review" />
        <StatCard label="Changes Required" value={s.changes_required} icon={RefreshCw} color="#f97316" testid="stat-changes" />
        <StatCard label="Delayed" value={s.delayed} icon={AlertTriangle} color="#ef4444" testid="stat-delayed" />
        <StatCard label="Needs Review" value={data.needs_review.length} icon={Eye} color="#8b5cf6" testid="stat-needs-review" />
      </div>

      {/* Progress + workload row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Panel title="Daily Target Progress" testid="panel-daily-progress">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl font-black font-display text-zinc-900">
              {data.daily_target_progress.done}
              <span className="text-lg text-zinc-400">/{data.daily_target_progress.total}</span>
            </span>
            <span className="text-sm font-bold text-emerald-600">
              {pct(data.daily_target_progress.done, data.daily_target_progress.total)}%
            </span>
          </div>
          <Progress value={pct(data.daily_target_progress.done, data.daily_target_progress.total)} className="h-2" />
          <p className="text-xs text-zinc-500 mt-2">Daily goals with today's task completed</p>
        </Panel>

        <Panel title="Monthly Goal Progress" testid="panel-monthly-progress">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl font-black font-display text-zinc-900">
              {data.monthly_goal_progress.done}
              <span className="text-lg text-zinc-400">/{data.monthly_goal_progress.total}</span>
            </span>
            <span className="text-sm font-bold text-emerald-600">
              {pct(data.monthly_goal_progress.done, data.monthly_goal_progress.total)}%
            </span>
          </div>
          <Progress value={pct(data.monthly_goal_progress.done, data.monthly_goal_progress.total)} className="h-2" />
          <p className="text-xs text-zinc-500 mt-2">Monthly goal tasks done this month</p>
        </Panel>

        <Panel title="Task Status Mix" testid="panel-status-pie">
          {pie.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">No tasks for this day.</p>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2}>
                  {pie.map((e) => (
                    <Cell key={e.name} fill={CHART_COLORS[e.name] || "#a1a1aa"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Workload + founder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Panel title="Designer Workload" testid="panel-designer-workload">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <WorkloadStat label="Total" value={data.designer_workload.total} />
            <WorkloadStat label="Done" value={data.designer_workload.done} color="#10b981" />
            <WorkloadStat label="Working" value={data.designer_workload.working} color="#3b82f6" />
            <WorkloadStat label="Pending" value={data.designer_workload.pending} color="#a1a1aa" />
            <WorkloadStat label="For Review" value={data.designer_workload.review} color="#f59e0b" />
          </div>
        </Panel>

        <Panel title="Founder Task Progress" testid="panel-founder-progress">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl font-black font-display text-zinc-900">
              {data.founder_progress.done}
              <span className="text-lg text-zinc-400">/{data.founder_progress.total}</span>
            </span>
            <span className="text-sm font-bold text-emerald-600">
              {pct(data.founder_progress.done, data.founder_progress.total)}%
            </span>
          </div>
          <Progress value={pct(data.founder_progress.done, data.founder_progress.total)} className="h-2" />
          <p className="text-xs text-zinc-500 mt-2">Founder tasks completed today</p>
        </Panel>

        <Panel title="Last 7 Days" testid="panel-last7">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data.charts.last7} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={20} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed" fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="delayed" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`Goals Completed (${data.goals_completed.length})`} testid="panel-goals-completed">
          <GoalList items={data.goals_completed} empty="No goals completed yet." done />
        </Panel>
        <Panel title={`Goals Pending (${data.goals_pending.length})`} testid="panel-goals-pending">
          <GoalList items={data.goals_pending} empty="All goals on track!" />
        </Panel>
        <Panel title={`Tasks Causing Delay (${data.delayed_tasks.length})`} testid="panel-delayed-tasks">
          {data.delayed_tasks.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">No delays. Great job!</p>
          ) : (
            <ul className="space-y-3">
              {data.delayed_tasks.map((t) => (
                <li key={t.id} className="border-l-2 border-red-400 pl-3">
                  <p className="text-sm font-semibold text-zinc-900">{t.task_name}</p>
                  <p className="text-xs text-zinc-500">
                    {t.assigned_to} · {t.task_type}
                  </p>
                  {t.delay_reason && <p className="text-xs text-red-600 mt-0.5">Reason: {t.delay_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Needs Review Today (${data.needs_review.length})`} testid="panel-needs-review">
          {data.needs_review.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">Nothing waiting for review.</p>
          ) : (
            <ul className="space-y-3">
              {data.needs_review.map((t) => (
                <li key={t.id} className="flex items-start gap-3">
                  <TargetIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{t.task_name}</p>
                    <p className="text-xs text-zinc-500">{t.assigned_to} · {t.status}</p>
                    {t.output_link && (
                      <a href={t.output_link} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 hover:underline">
                        View output
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

const WorkloadStat = ({ label, value, color = "#09090b" }) => (
  <div className="flex items-center justify-between border border-zinc-100 rounded-md px-3 py-2">
    <span className="text-xs text-zinc-500">{label}</span>
    <span className="text-lg font-bold font-display" style={{ color }}>{value}</span>
  </div>
);

const GoalList = ({ items, empty, done }) => {
  if (!items || items.length === 0) return <p className="text-sm text-zinc-400 py-4">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Clock className="w-4 h-4 text-zinc-400 shrink-0" />}
            <span className="text-sm text-zinc-800 truncate">{g.goal_name}</span>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">
            {g.target_number}{g.unit ? ` ${g.unit}` : ""} · {g.owner}
          </span>
        </li>
      ))}
    </ul>
  );
};
