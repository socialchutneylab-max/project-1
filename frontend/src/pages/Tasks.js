import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "../components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ExternalLink, Loader2, Filter, X,
  Save, History, CheckCircle2, PlusCircle, CheckSquare
} from "lucide-react";
import {
  WORK_CATEGORIES, PRIORITIES, TASK_STATUSES,
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
  manager_deadline: "",
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

function TaskForm({ open, onOpenChange, initial, onSaved, mode }) {
  const { isFounder } = useAuth();
  const founderMode = mode === "founder";
  const makeEmpty = () => {
    const base = emptyTask();
    base.task_type = founderMode ? "Founder Task" : "Designer Task";
    base.assigned_to = founderMode ? "Founder" : "Designer";
    return base;
  };
  const [form, setForm] = useState(initial || makeEmpty());
  const [saving, setSaving] = useState(false);
  const isEdit = !!(initial && initial.id);

  useEffect(() => {
    setForm(initial || makeEmpty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const designerLocked = !isFounder && isEdit;

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

  const catLabel = founderMode ? "Task Category" : "Client / Work Type";
  const committedLabel = founderMode ? "Estimated Completion Time (hrs)" : "Designer Committed Time (hrs)";
  const reviewLabel = founderMode ? "Review Notes / Next Action" : "Review Notes / Changes";
  const outputLabel = "Output Link";

  const fieldList = founderMode
    ? ["date", "task_name", "work_category", "brief", "priority", "committed_time", "status", "delay_reason", "review_notes", "output_link"]
    : ["date", "task_name", "work_category", "brief", "priority", "manager_deadline", "committed_time", "status", "delay_reason", "output_link", "review_notes"];

  const renderField = (key) => {
    switch (key) {
      case "date":
        return <Field key={key} label="Date"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} disabled={designerLocked} /></Field>;
      case "task_name":
        return <Field key={key} label="Task Name"><Input value={form.task_name} onChange={(e) => set("task_name", e.target.value)} disabled={designerLocked} data-testid="task-name-input" /></Field>;
      case "work_category":
        return <Field key={key} label={catLabel}><SelectField fk="work_category" options={WORK_CATEGORIES} form={form} set={set} disabled={designerLocked} /></Field>;
      case "priority":
        return <Field key={key} label="Priority"><SelectField fk="priority" options={PRIORITIES} form={form} set={set} disabled={designerLocked} /></Field>;
      case "manager_deadline":
        return <Field key={key} label="Manager Deadline (hrs)"><Input type="number" min="0" step="0.5" value={form.manager_deadline || ""} onChange={(e) => set("manager_deadline", e.target.value)} placeholder="Hours (e.g. 4)" disabled={designerLocked} /></Field>;
      case "committed_time":
        return <Field key={key} label={committedLabel}><Input type="number" min="0" step="0.5" value={form.committed_time || ""} onChange={(e) => set("committed_time", e.target.value)} placeholder="Hours (e.g. 3)" data-testid="task-committed-input" /></Field>;
      case "status":
        return <Field key={key} label="Current Status"><SelectField fk="status" options={TASK_STATUSES} form={form} set={set} /></Field>;
      case "output_link":
        return <Field key={key} label={outputLabel}><Input value={form.output_link || ""} onChange={(e) => set("output_link", e.target.value)} placeholder="https://..." data-testid="task-output-input" /></Field>;
      case "brief":
        return <div key={key} className="sm:col-span-2"><Field label="Objective / Brief"><Textarea value={form.brief || ""} onChange={(e) => set("brief", e.target.value)} rows={2} disabled={designerLocked} data-testid="task-brief-input" /></Field></div>;
      case "delay_reason":
        return <div key={key} className="sm:col-span-2"><Field label="Delay Reason"><Textarea value={form.delay_reason || ""} onChange={(e) => set("delay_reason", e.target.value)} rows={2} data-testid="task-delay-input" /></Field></div>;
      case "review_notes":
        return <div key={key} className="sm:col-span-2"><Field label={`${reviewLabel}${isFounder ? "" : " (founder only)"}`}><Textarea value={form.review_notes || ""} onChange={(e) => set("review_notes", e.target.value)} rows={2} disabled={!isFounder} data-testid="task-review-input" /></Field></div>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="task-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
          <p className="text-xs text-zinc-500">{form.task_type} · assigned to {form.assigned_to}</p>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fieldList.map(renderField)}
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
  const [tab, setTab] = useState(isFounder ? "founder" : "designer");
  const founderMode = tab === "founder";
  const [viewMode, setViewMode] = useState("active"); // "active" | "saved"
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [cloningSelected, setCloningSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({
    date: "", status: ALL, priority: ALL, work_category: ALL,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        task_type: founderMode ? "Founder Task" : "Designer Task",
        saved: viewMode === "saved",
      };
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== ALL) params[k] = v;
      });
      const { data } = await api.get("/tasks", { params });
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }, [filters, founderMode, viewMode]);

  useEffect(() => {
    load();
    setSelectedIds(new Set());
  }, [load]);

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  // Save all visible active tasks
  const handleSaveAll = async () => {
    if (tasks.length === 0) return;
    const taskIds = tasks.map((t) => t.id);
    if (!window.confirm(`Save ${tasks.length} task(s) under their date to Saved History?`)) return;

    setSavingAll(true);
    try {
      const res = await api.post("/tasks/save", {
        task_ids: taskIds,
        task_type: founderMode ? "Founder Task" : "Designer Task",
      });
      toast.success(res.data?.message || `Saved ${res.data?.saved_count} task(s) under date to history!`);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save tasks");
    } finally {
      setSavingAll(false);
    }
  };

  // Save an individual task
  const handleSaveSingle = async (task) => {
    setSavingId(task.id);
    try {
      const res = await api.post(`/tasks/${task.id}/save`);
      toast.success(res.data?.message || `Task saved under ${task.date} to history!`);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save task");
    } finally {
      setSavingId(null);
    }
  };

  // Clone single saved task to Today's Active Tasks
  const handleCloneSingleToToday = async (task) => {
    setCloningId(task.id);
    try {
      const res = await api.post("/tasks/clone-to-today", { task_ids: [task.id] });
      toast.success(`Task "${task.task_name}" added to today's active tasks!`);
      setViewMode("active");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to add task to today");
    } finally {
      setCloningId(null);
    }
  };

  // Clone multiple selected tasks to Today's Active Tasks
  const handleCloneSelectedToToday = async () => {
    if (selectedIds.size === 0) return;
    setCloningSelected(true);
    try {
      const res = await api.post("/tasks/clone-to-today", { task_ids: Array.from(selectedIds) });
      toast.success(res.data?.message || `Added ${res.data?.cloned_count} task(s) to today's active tasks!`);
      setSelectedIds(new Set());
      setViewMode("active");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to add tasks to today");
    } finally {
      setCloningSelected(false);
    }
  };

  // Batch delete selected tasks
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected task(s)? This cannot be undone.`)) return;
    setDeletingSelected(true);
    try {
      const res = await api.post("/tasks/batch-delete", { task_ids: Array.from(selectedIds) });
      toast.success(`Deleted ${res.data?.deleted_count || selectedIds.size} task(s)`);
      setSelectedIds(new Set());
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to delete tasks");
    } finally {
      setDeletingSelected(false);
    }
  };

  // Selection toggles
  const toggleSelectAll = () => {
    if (selectedIds.size === tasks.length && tasks.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ date: "", status: ALL, priority: ALL, work_category: ALL });
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
  const cellDate = (t) => (
    <div>
      <span className="text-xs text-zinc-500 whitespace-nowrap">{t.date}</span>
      {t.saved && (
        <span className="block text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
          <CheckCircle2 className="w-2.5 h-2.5" /> Saved
        </span>
      )}
    </div>
  );

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
  const hrs = (v) => (Number(v) === 1 ? "1 hr" : `${v} hrs`);
  const cellDeadline = (t) => <span className="text-xs text-zinc-500 whitespace-nowrap">{t.manager_deadline !== "" && t.manager_deadline != null ? hrs(t.manager_deadline) : "—"}</span>;
  const cellCommitted = (t) => <span className="text-xs text-zinc-500 whitespace-nowrap">{t.committed_time !== "" && t.committed_time != null ? hrs(t.committed_time) : "—"}</span>;
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

  const columns = founderMode
    ? [
        { label: "Date", cell: cellDate, cls: "w-24" },
        { label: "Task Name", cell: cellName, cls: "min-w-[180px]" },
        { label: "Task Category", cell: cellCategory },
        { label: "Objective / Brief", cell: cellBrief, cls: "min-w-[200px]" },
        { label: "Priority", cell: cellPriority },
        { label: "Est. Completion Time (hrs)", cell: cellCommitted, cls: "min-w-[150px]" },
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
        { label: "Manager Deadline (hrs)", cell: cellDeadline, cls: "whitespace-nowrap" },
        { label: "Designer Committed Time (hrs)", cell: cellCommitted, cls: "min-w-[150px]" },
        { label: "Current Status", cell: cellStatus, cls: "min-w-[150px]" },
        { label: "Delay Reason", cell: cellDelay, cls: "min-w-[160px]" },
        { label: "Output Link", cell: cellOutput },
        { label: "Review Notes / Changes", cell: cellReview, cls: "min-w-[200px]" },
      ];
  const colCount = columns.length + (viewMode === "saved" ? 2 : 1);

  return (
    <div className="p-6 lg:p-8 fade-up">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Task Management</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter text-zinc-900">
            {founderMode ? "Founder Task Management" : "Designer Task Management"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Prominent Save Button in Active View */}
          {viewMode === "active" && tasks.length > 0 && (
            <Button
              onClick={handleSaveAll}
              disabled={savingAll}
              className="rounded-full bg-emerald-600 hover:bg-emerald-700 font-semibold text-white shadow-sm transition-all"
              data-testid="save-all-tasks-button"
            >
              {savingAll ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              Save Tasks ({tasks.length})
            </Button>
          )}

          {/* New Task Button */}
          <Button
            onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs h-9"
            data-testid="add-task-button"
          >
            <Plus className="w-4 h-4 mr-1" /> New {founderMode ? "Founder" : "Designer"} Task
          </Button>
        </div>
      </div>

      {/* Tabs & View Mode Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        {/* Role Tabs */}
        {isFounder ? (
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelectedIds(new Set()); }}>
            <TabsList>
              <TabsTrigger value="founder" data-testid="tab-founder-tasks">Founder Board</TabsTrigger>
              <TabsTrigger value="designer" data-testid="tab-designer-tasks">Designer Board</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : <div />}

        {/* View Mode Toggle: Active vs Saved */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg self-start sm:self-auto">
          <button
            onClick={() => { setViewMode("active"); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === "active"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Active Tasks {viewMode === "active" && tasks.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
                {tasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setViewMode("saved"); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              viewMode === "saved"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <History className="w-3.5 h-3.5 text-zinc-500" />
            Saved History
          </button>
        </div>
      </div>

      {/* Batch Actions Toolbar when tasks are selected */}
      {selectedIds.size > 0 && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-emerald-950">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-full">
              {selectedIds.size} Selected
            </span>
            <span className="text-xs text-emerald-800 font-medium">
              Actions for selected task(s):
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCloneSelectedToToday}
              disabled={cloningSelected}
              className="rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8 gap-1.5 shadow-sm"
              data-testid="add-selected-to-today-button"
            >
              {cloningSelected ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
              Add Selected to Today's Tasks ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="rounded-full border-red-300 text-red-600 hover:bg-red-50 text-xs h-8 gap-1.5"
              data-testid="delete-selected-button"
            >
              {deletingSelected ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete Selected ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-zinc-500 hover:text-zinc-800 h-8"
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-zinc-400 ml-1" />
        <Input
          type="date"
          value={filters.date}
          onChange={(e) => setF("date", e.target.value)}
          className="w-40 h-9 text-xs"
          data-testid="filter-date"
        />
        <FilterSelect k="status" placeholder="All Status" options={TASK_STATUSES} testid="filter-status" />
        <FilterSelect k="priority" placeholder="All Priority" options={PRIORITIES} testid="filter-priority" />
        <FilterSelect k="work_category" placeholder="All Categories" options={WORK_CATEGORIES} testid="filter-category" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-zinc-500 text-xs" data-testid="clear-filters">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Tasks Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/75 hover:bg-zinc-50/75">
                {viewMode === "saved" && (
                  <TableHead className="w-10 px-3 text-center">
                    <Checkbox
                      checked={tasks.length > 0 && selectedIds.size === tasks.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all tasks"
                    />
                  </TableHead>
                )}
                {columns.map((c) => (
                  <TableHead key={c.label} className={`font-bold text-zinc-700 text-xs ${c.cls || ""}`}>{c.label}</TableHead>
                ))}
                <TableHead className="text-right font-bold text-zinc-700 text-xs min-w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colCount={colCount} className="text-center py-12 text-zinc-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    Loading tasks...
                  </TableCell>
                </TableRow>
              ) : tasks.length === 0 ? (
                <TableRow>
                  <TableCell colCount={colCount} className="text-center py-12 text-zinc-400">
                    {viewMode === "saved"
                      ? "No saved tasks in history for this filter."
                      : "No active tasks. Create a new task or pick tasks from Saved History to work on today!"}
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((t) => (
                  <TableRow key={t.id} data-testid={`task-row-${t.id}`} className="align-top hover:bg-zinc-50/50">
                    {viewMode === "saved" && (
                      <TableCell className="w-10 px-3 text-center pt-3.5">
                        <Checkbox
                          checked={selectedIds.has(t.id)}
                          onCheckedChange={() => toggleSelectOne(t.id)}
                          aria-label={`Select ${t.task_name}`}
                        />
                      </TableCell>
                    )}
                    {columns.map((c) => (
                      <TableCell key={c.label} className={c.cls}>{c.cell(t)}</TableCell>
                    ))}
                    <TableCell className="text-right whitespace-nowrap">
                      {viewMode === "active" ? (
                        <>
                          {/* Save Task under its date to History */}
                          <button
                            onClick={() => handleSaveSingle(t)}
                            disabled={savingId === t.id}
                            className="p-1.5 hover:bg-emerald-50 rounded transition-colors text-emerald-600 mr-1"
                            title="Save task under its date to Saved History"
                            data-testid={`save-task-${t.id}`}
                          >
                            {savingId === t.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => { setEditing(t); setDialogOpen(true); }}
                            className="p-1.5 hover:bg-zinc-100 rounded transition-colors mr-1"
                            data-testid={`edit-task-${t.id}`}
                            title="Edit Task"
                          >
                            <Pencil className="w-4 h-4 text-zinc-500" />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => remove(t.id)}
                            className="p-1.5 hover:bg-red-50 rounded transition-colors"
                            data-testid={`delete-task-${t.id}`}
                            title="Delete Task"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {/* Add to Today's Tasks */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCloneSingleToToday(t)}
                            disabled={cloningId === t.id}
                            className="h-7 px-2.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300 gap-1 rounded-full"
                            title="Add this task to Today's Active Tasks"
                            data-testid={`add-to-today-${t.id}`}
                          >
                            {cloningId === t.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <PlusCircle className="w-3.5 h-3.5" />
                            )}
                            Add to Today
                          </Button>

                          {/* Edit Button */}
                          <button
                            onClick={() => { setEditing(t); setDialogOpen(true); }}
                            className="p-1.5 hover:bg-zinc-100 rounded transition-colors"
                            data-testid={`edit-task-${t.id}`}
                            title="Edit Task"
                          >
                            <Pencil className="w-4 h-4 text-zinc-500" />
                          </button>

                          {/* Delete Button in History */}
                          <button
                            onClick={() => remove(t.id)}
                            className="p-1.5 hover:bg-red-50 rounded transition-colors"
                            data-testid={`delete-task-${t.id}`}
                            title="Delete Task from History"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit/Create Dialog */}
      <TaskForm open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={load} mode={tab} />
    </div>
  );
}
