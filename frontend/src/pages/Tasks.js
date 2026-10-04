import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
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
  Save, FileSpreadsheet, History, CheckCircle2, Settings, Copy, Check
} from "lucide-react";
import {
  WORK_CATEGORIES, PRIORITIES, TASK_STATUSES,
  STATUS_STYLES, PRIORITY_STYLES,
} from "../lib/constants";
import { APPS_SCRIPT_CODE } from "../lib/appsScriptCode";

const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1VWhguGAkq0kMkodHSLzrfjjfCg-Hb_3zcTE-U0EQvDE/edit?usp=sharing";

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

function GoogleSheetConfigModal({ open, onOpenChange }) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.get("/settings/google-sheet")
        .then((res) => {
          if (res.data?.webhook_url) setWebhookUrl(res.data.webhook_url);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  const copyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    toast.success("Apps Script code copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Please enter a Webhook URL first");
      return;
    }
    setTesting(true);
    try {
      const res = await api.post("/settings/google-sheet/test", { webhook_url: webhookUrl });
      if (res.data.connected) {
        toast.success(res.data.message || "Connected to Google Sheet Webhook!");
      } else {
        toast.error(res.data.message || "Failed to reach Google Sheet Webhook");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/settings/google-sheet", { webhook_url: webhookUrl });
      toast.success("Google Sheet Webhook URL saved!");
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Google Sheet Integration Settings
          </DialogTitle>
          <p className="text-xs text-zinc-500">
            Automatically sync saved tasks to your Google Sheet tabs.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Sheet mapping banner */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-emerald-950 flex items-center justify-between">
              <span>Target Sheet Mapping:</span>
              <a
                href={GOOGLE_SHEET_URL}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
              >
                Open Sheet <ExternalLink className="w-3 h-3" />
              </a>
            </p>
            <p className="text-emerald-900">• <strong>Sheet 1:</strong> Founder Task Management</p>
            <p className="text-emerald-900">• <strong>Sheet 2:</strong> Designer Task Management</p>
          </div>

          {/* Setup steps */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-800">Quick 2-Minute Setup:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={copyCode}
                className="h-7 text-xs gap-1 border-zinc-300"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy Apps Script Code"}
              </Button>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-zinc-600">
              <li>Open your <a href={GOOGLE_SHEET_URL} target="_blank" rel="noreferrer" className="text-emerald-600 underline">Google Sheet</a>, go to <strong>Extensions</strong> &gt; <strong>Apps Script</strong>.</li>
              <li>Paste the copied script and click the 💾 Save button.</li>
              <li>Click <strong>Deploy</strong> &gt; <strong>New Deployment</strong> &gt; Select <strong>Web app</strong> (Execute as: <em>Me</em>, Access: <em>Anyone</em>).</li>
              <li>Copy the generated Web App URL and paste it below.</li>
            </ol>
          </div>

          {/* Webhook URL Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-700">Google Apps Script Webhook URL</Label>
            {loading ? (
              <div className="h-9 bg-zinc-100 rounded animate-pulse" />
            ) : (
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="font-mono text-xs"
              />
            )}
            <p className="text-[11px] text-zinc-400">
              When you click <strong>Save Tasks</strong>, tasks are saved under their date and automatically pushed to this webhook.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !webhookUrl.trim()}
            className="text-xs"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Test Connection
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : "Save Configuration"}
            </Button>
          </div>
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetConfigOpen, setSheetConfigOpen] = useState(false);
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

  // Save all visible active tasks
  const handleSaveAll = async () => {
    if (tasks.length === 0) return;
    const taskIds = tasks.map((t) => t.id);
    const dateLabel = filters.date || "active tasks";
    if (!window.confirm(`Save and archive ${tasks.length} task(s) under their date to the Google Sheet?`)) return;

    setSavingAll(true);
    try {
      const res = await api.post("/tasks/save", {
        task_ids: taskIds,
        task_type: founderMode ? "Founder Task" : "Designer Task",
      });
      const data = res.data;
      if (data.sheet_synced) {
        toast.success(`Saved ${data.saved_count} task(s) under date and updated Google Sheet!`);
      } else {
        toast.success(`Saved ${data.saved_count} task(s)! Note: ${data.sheet_message}`);
      }
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
      const data = res.data;
      if (data.sheet_synced) {
        toast.success(`Task saved under ${task.date} and synced to Google Sheet!`);
      } else {
        toast.success(`Task saved! Note: ${data.sheet_message}`);
      }
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save task");
    } finally {
      setSavingId(null);
    }
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
  const colCount = columns.length + 1;

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
          {/* Prominent Save Button */}
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

          {/* Google Sheet Direct Link */}
          <a
            href={GOOGLE_SHEET_URL}
            target="_blank"
            rel="noreferrer"
            title="Open linked Google Sheet in new tab"
          >
            <Button variant="outline" className="rounded-full border-zinc-200 hover:bg-zinc-50 font-medium text-xs h-9">
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
              Task Sheet
              <ExternalLink className="w-3 h-3 ml-1 text-zinc-400" />
            </Button>
          </a>

          {/* Sheet Config Settings */}
          {isFounder && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSheetConfigOpen(true)}
              className="rounded-full border-zinc-200 hover:bg-zinc-50 w-9 h-9"
              title="Google Sheet Integration Settings"
            >
              <Settings className="w-4 h-4 text-zinc-600" />
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
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="founder" data-testid="tab-founder-tasks">Founder Board</TabsTrigger>
              <TabsTrigger value="designer" data-testid="tab-designer-tasks">Designer Board</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : <div />}

        {/* View Mode Toggle: Active vs Saved */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setViewMode("active")}
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
            onClick={() => setViewMode("saved")}
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

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden shadow-sm">
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
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center py-12 text-zinc-400 text-sm">
                    {viewMode === "active"
                      ? `No active ${founderMode ? "founder" : "designer"} tasks. Create a new task or click "Saved History" to view previously saved tasks.`
                      : `No saved ${founderMode ? "founder" : "designer"} tasks found for the selected filter.`}
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((t) => (
                  <TableRow key={t.id} data-testid={`task-row-${t.id}`} className="align-top hover:bg-zinc-50/50">
                    {columns.map((c) => (
                      <TableCell key={c.label} className={c.cls}>{c.cell(t)}</TableCell>
                    ))}
                    <TableCell className="text-right whitespace-nowrap">
                      {/* Row Save Button */}
                      {!t.saved ? (
                        <button
                          onClick={() => handleSaveSingle(t)}
                          disabled={savingId === t.id}
                          className="p-1.5 hover:bg-emerald-50 rounded transition-colors text-emerald-600 mr-1"
                          title="Save task under its date & sync to Google Sheet"
                          data-testid={`save-task-${t.id}`}
                        >
                          {savingId === t.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mr-1.5"
                          title={`Saved ${t.saved_at ? new Date(t.saved_at).toLocaleString() : ''}`}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-0.5" /> Saved
                        </span>
                      )}

                      {/* Edit Button */}
                      <button
                        onClick={() => { setEditing(t); setDialogOpen(true); }}
                        className="p-1.5 hover:bg-zinc-100 rounded transition-colors"
                        data-testid={`edit-task-${t.id}`}
                        title="Edit Task"
                      >
                        <Pencil className="w-4 h-4 text-zinc-500" />
                      </button>

                      {/* Delete Button (Founder only) */}
                      {isFounder && (
                        <button
                          onClick={() => remove(t.id)}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors"
                          data-testid={`delete-task-${t.id}`}
                          title="Delete Task"
                        >
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

      {/* Edit/Create Dialog */}
      <TaskForm open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={load} mode={tab} />

      {/* Google Sheet Config Dialog */}
      <GoogleSheetConfigModal open={sheetConfigOpen} onOpenChange={setSheetConfigOpen} />
    </div>
  );
}
