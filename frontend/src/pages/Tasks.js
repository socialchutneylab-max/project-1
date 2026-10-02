import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "../components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "../components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ExternalLink, Loader2, Filter, X } from "lucide-react";
import {
  TASK_TYPES, WORK_CATEGORIES, PRIORITIES, TASK_STATUSES, OWNERS,
  STATUS_STYLES, PRIORITY_STYLES,
} from "../lib/constants";

const Badge = ({ className, children }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${className}`}>{children}</span>
);

const emptyTask = () => ({
  date: new Date().toISOString().slice(0, 10),
  task_type: "Designer Task",
  work_category: "Client Work",
  task_name: "",
  assigned_to: "Designer",
  brief: "",
  priority: "Medium",
  manager_deadline: new Date().toISOString().slice(0, 10),
  committed_time: "",
  status: "Pending",
  delay_reason: "",
  output_link: "",
  review_notes: "",
});

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

const SelectField = ({ fk, options, form, set, disabled }) => (
  <Select value={form[fk]} onValueChange={(v) => set(fk, v)} disabled={disabled}>
    <SelectTrigger data-testid={`task-${fk}-select`}><SelectValue /></SelectTrigger>
    <SelectContent>
      {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
    </SelectContent>
  </Select>
);

function TaskForm({ open, onOpenChange, initial, onSaved }) {
  const { isFounder } = useAuth();
  const makeEmpty = () => {
    const base = emptyTask();
    base.task_type = isFounder ? "Founder Task" : "Designer Task";
    base.assigned_to = isFounder ? "Founder" : "Designer";
    return base;
  };
  const [form, setForm] = useState(initial || makeEmpty());
  const [saving, setSaving] = useState(false);
  const isEdit = !!(initial && initial.id);

  useEffect(() => {
    setForm(initial || makeEmpty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  const set = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === "task_type") next.assigned_to = v === "Founder Task" ? "Founder" : "Designer";
    return next;
  });

  const designerLocked = !isFounder && isEdit; // designer: full entry on create, execution-only on edit

  const save = async () => {
    if (!form.task_name.trim()) {
      toast.error("Task name is required");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/tasks/${form.id}`, form);
        toast.success("Task updated");
      } else {
        await api.post("/tasks", form);
        toast.success("Task created");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="task-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Task Name">
            <Input value={form.task_name} onChange={(e) => set("task_name", e.target.value)} disabled={designerLocked} data-testid="task-name-input" />
          </Field>
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} disabled={designerLocked} /></Field>
          <Field label="Work Category"><SelectField fk="work_category" options={WORK_CATEGORIES} form={form} set={set} disabled={designerLocked} /></Field>
          <Field label="Assigned To">
            <Input value={form.assigned_to} readOnly disabled className="bg-zinc-50" data-testid="task-assigned-display" />
          </Field>
          <Field label="Priority"><SelectField fk="priority" options={PRIORITIES} form={form} set={set} disabled={designerLocked} /></Field>
          <Field label="Manager Deadline"><Input type="date" value={form.manager_deadline || ""} onChange={(e) => set("manager_deadline", e.target.value)} disabled={designerLocked} /></Field>
          <Field label="Committed Time (designer)"><Input type="datetime-local" value={form.committed_time || ""} onChange={(e) => set("committed_time", e.target.value)} data-testid="task-committed-input" /></Field>
          <Field label="Status"><SelectField fk="status" options={TASK_STATUSES} form={form} set={set} /></Field>
          <Field label="Output Link"><Input value={form.output_link || ""} onChange={(e) => set("output_link", e.target.value)} placeholder="https://..." data-testid="task-output-input" /></Field>
          <div className="sm:col-span-2">
            <Field label="Brief"><Textarea value={form.brief || ""} onChange={(e) => set("brief", e.target.value)} rows={2} disabled={designerLocked} /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Delay Reason (if delayed)"><Textarea value={form.delay_reason || ""} onChange={(e) => set("delay_reason", e.target.value)} rows={2} data-testid="task-delay-input" /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={`Review Notes ${isFounder ? "" : "(founder only)"}`}>
              <Textarea value={form.review_notes || ""} onChange={(e) => set("review_notes", e.target.value)} rows={2} disabled={!isFounder} data-testid="task-review-input" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-none">Cancel</Button>
          <Button onClick={save} disabled={saving} className="rounded-full bg-emerald-600 hover:bg-emerald-700" data-testid="task-save-button">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ALL = "all";

export default function Tasks() {
  const { isFounder } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({
    date: "", assigned_to: ALL, task_type: ALL, status: ALL, priority: ALL, work_category: ALL,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== ALL) params[k] = v;
      });
      const { data } = await api.get("/tasks", { params });
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (task, status) => {
    try {
      await api.put(`/tasks/${task.id}`, { status });
      toast.success(`Status → ${status}`);
      load();
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api.delete(`/tasks/${id}`);
      toast.success("Task deleted");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ date: "", assigned_to: ALL, task_type: ALL, status: ALL, priority: ALL, work_category: ALL });
  const hasFilters = filters.date || Object.values(filters).some((v) => v && v !== ALL && v !== "");

  const FilterSelect = ({ k, placeholder, options, testid }) => (
    <Select value={filters[k]} onValueChange={(v) => setF(k, v)}>
      <SelectTrigger className="w-[150px] h-9" data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  // ---- role-specific cell renderers ----
  const cellDate = (t) => <span className="text-xs text-zinc-500 whitespace-nowrap">{t.date}</span>;
  const cellName = (t) => (
    <div>
      <p className="font-semibold text-zinc-900 text-sm leading-tight">
        {t.task_name}
        {t.target_number != null && t.target_number !== "" && (
          <span className="text-emerald-700"> — {t.target_number}{t.unit ? ` ${t.unit}` : ""}</span>
        )}
      </p>
      <span className="text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">{t.task_type?.replace(" Task", "")} · {t.assigned_to}</span>
      {t.goal_id && <span className="block text-[10px] uppercase tracking-wide text-emerald-600 font-bold">Auto · Goal-linked</span>}
    </div>
  );
  const cellCategory = (t) => <span className="text-xs whitespace-nowrap">{t.work_category}</span>;
  const cellBrief = (t) => <p className="text-xs text-zinc-600 line-clamp-2 max-w-[260px]">{t.brief || "—"}</p>;
  const cellPriority = (t) => <Badge className={PRIORITY_STYLES[t.priority]}>{t.priority}</Badge>;
  const cellDeadline = (t) => <span className="text-xs text-zinc-500 whitespace-nowrap">{t.manager_deadline || "—"}</span>;
  const cellCommitted = (t) => <span className="text-xs text-zinc-500 whitespace-nowrap">{t.committed_time ? t.committed_time.replace("T", " ") : "—"}</span>;
  const cellStatus = (t) => (
    <div>
      <Select value={t.status} onValueChange={(v) => updateStatus(t, v)}>
        <SelectTrigger className="h-7 w-[140px] text-xs" data-testid={`status-select-${t.id}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
        </SelectContent>
      </Select>
      {t.is_delayed && t.status !== "Delayed" && <Badge className={`${STATUS_STYLES.Delayed} mt-1`}>Overdue</Badge>}
    </div>
  );
  const cellDelay = (t) => t.delay_reason ? <p className="text-xs text-red-600 line-clamp-2 max-w-[200px]">{t.delay_reason}</p> : <span className="text-zinc-300">—</span>;
  const cellReview = (t) => t.review_notes ? <p className="text-xs text-zinc-700 line-clamp-2 max-w-[240px]">{t.review_notes}</p> : <span className="text-zinc-300">—</span>;
  const cellOutput = (t) => t.output_link
    ? <a href={t.output_link} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 text-xs" data-testid={`output-link-${t.id}`}><ExternalLink className="w-4 h-4" /></a>
    : <span className="text-zinc-300">—</span>;

  const columns = isFounder
    ? [
        { label: "Date", cell: cellDate, cls: "w-24" },
        { label: "Task Name", cell: cellName, cls: "min-w-[180px]" },
        { label: "Task Category", cell: cellCategory },
        { label: "Objective / Brief", cell: cellBrief, cls: "min-w-[200px]" },
        { label: "Priority", cell: cellPriority },
        { label: "Est. Completion Time", cell: cellCommitted, cls: "min-w-[150px]" },
        { label: "Current Status", cell: cellStatus, cls: "min-w-[150px]" },
        { label: "Delay Reason", cell: cellDelay, cls: "min-w-[160px]" },
        { label: "Review Notes / Next Action", cell: cellReview, cls: "min-w-[200px]" },
        { label: "Output", cell: cellOutput },
      ]
    : [
        { label: "Date", cell: cellDate, cls: "w-24" },
        { label: "Task Name", cell: cellName, cls: "min-w-[180px]" },
        { label: "Client / Work Type", cell: cellCategory },
        { label: "Objective / Brief", cell: cellBrief, cls: "min-w-[200px]" },
        { label: "Priority", cell: cellPriority },
        { label: "Manager Deadline", cell: cellDeadline, cls: "whitespace-nowrap" },
        { label: "Designer Committed Time", cell: cellCommitted, cls: "min-w-[150px]" },
        { label: "Current Status", cell: cellStatus, cls: "min-w-[150px]" },
        { label: "Delay Reason", cell: cellDelay, cls: "min-w-[160px]" },
        { label: "Output Link", cell: cellOutput },
        { label: "Review Notes / Changes", cell: cellReview, cls: "min-w-[200px]" },
      ];
  const colCount = columns.length + 1;

  return (
    <div className="p-6 lg:p-8 fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Task Management</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter text-zinc-900">Execution Board</h1>
        </div>
        <Button
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700 font-semibold"
          data-testid="add-task-button"
        >
          <Plus className="w-4 h-4 mr-1" /> New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-zinc-400 ml-1" />
        <Input type="date" value={filters.date} onChange={(e) => setF("date", e.target.value)} className="w-40 h-9" data-testid="filter-date" />
        <FilterSelect k="assigned_to" placeholder="All Owners" options={["Founder", "Designer"]} testid="filter-owner" />
        <FilterSelect k="task_type" placeholder="All Types" options={TASK_TYPES} testid="filter-type" />
        <FilterSelect k="status" placeholder="All Status" options={TASK_STATUSES} testid="filter-status" />
        <FilterSelect k="priority" placeholder="All Priority" options={PRIORITIES} testid="filter-priority" />
        <FilterSelect k="work_category" placeholder="All Categories" options={WORK_CATEGORIES} testid="filter-category" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-zinc-500" data-testid="clear-filters">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
          <Table className="ops-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((c) => (
                  <TableHead key={c.label} className={c.cls}>{c.label}</TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={colCount} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" /></TableCell></TableRow>
              ) : tasks.length === 0 ? (
                <TableRow><TableCell colSpan={colCount} className="text-center py-12 text-zinc-400 text-sm">No tasks found. {isFounder ? "Create one or add a goal to auto-generate daily tasks." : "Create your first task with New Task."}</TableCell></TableRow>
              ) : (
                tasks.map((t) => (
                  <TableRow key={t.id} data-testid={`task-row-${t.id}`} className="align-top">
                    {columns.map((c) => (
                      <TableCell key={c.label} className={c.cls}>{c.cell(t)}</TableCell>
                    ))}
                    <TableCell className="text-right whitespace-nowrap">
                      <button onClick={() => { setEditing(t); setDialogOpen(true); }} className="p-1.5 hover:bg-zinc-100 rounded transition-colors" data-testid={`edit-task-${t.id}`}>
                        <Pencil className="w-4 h-4 text-zinc-500" />
                      </button>
                      {isFounder && (
                        <button onClick={() => remove(t.id)} className="p-1.5 hover:bg-red-50 rounded transition-colors" data-testid={`delete-task-${t.id}`}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <TaskForm open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={load} />
    </div>
  );
}
