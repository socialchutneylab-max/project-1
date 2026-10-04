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
  Save, History, CheckCircle2, PlusCircle, Clock,
  ChevronUp, ChevronDown, Wand2, CalendarDays, LayoutList
} from "lucide-react";
import {
  WORK_CATEGORIES, PRIORITIES, TASK_STATUSES,
  STATUS_STYLES, PRIORITY_STYLES,
} from "../lib/constants";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
function formatTime12(timeStr) {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1].slice(0, 2) || "00";
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.padStart(2, "0")} ${ampm}`;
}

function formatTimeSlot(start, end) {
  if (!start && !end) return null;
  if (start && end) return `${formatTime12(start)} – ${formatTime12(end)}`;
  if (start) return `From ${formatTime12(start)}`;
  return `Until ${formatTime12(end)}`;
}

function addHoursToTime(timeStr, hours) {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  let totalMinutes = parseInt(hStr || "9", 10) * 60 + parseInt(mStr || "0", 10);
  totalMinutes += Math.round(Number(hours || 1) * 60);
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function calculateHoursDifference(start, end) {
  if (!start || !end) return null;
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  let diffMin = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diffMin < 0) diffMin += 24 * 60;
  const diffHours = diffMin / 60;
  return Math.round(diffHours * 10) / 10;
}

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
  start_time: "",
  end_time: "",
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

// ---------------------------------------------------------------------------
// Quick Time Slot Modal (for adjusting a single task's timing)
// ---------------------------------------------------------------------------
function QuickTimeModal({ open, onOpenChange, task, onSaved }) {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      const s = task.start_time || "09:00";
      setStartTime(s);
      const hrs = Number(task.committed_time || task.manager_deadline || 1);
      setEndTime(task.end_time || addHoursToTime(s, hrs));
    }
  }, [task, open]);

  if (!task) return null;

  const duration = calculateHoursDifference(startTime, endTime);

  const applyPreset = (s, e) => {
    setStartTime(s);
    setEndTime(e);
  };

  const shiftTime = (minutes) => {
    const shift = (t) => {
      const [h, m] = t.split(":").map(Number);
      let tot = (h * 60 + m + minutes) % (24 * 60);
      if (tot < 0) tot += 24 * 60;
      return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
    };
    setStartTime(shift(startTime));
    setEndTime(shift(endTime));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/tasks/${task.id}`, { start_time: startTime, end_time: endTime });
      toast.success(`Schedule set: ${formatTimeSlot(startTime, endTime)}`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to update timing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-base">
            <Clock className="w-4 h-4 text-emerald-600" />
            Set Task Schedule
          </DialogTitle>
          <p className="text-xs text-zinc-600 font-semibold truncate pt-1">
            {task.task_name}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-zinc-600">Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => {
                  const s = e.target.value;
                  setStartTime(s);
                  const hrs = Number(task.committed_time || task.manager_deadline || 1);
                  setEndTime(addHoursToTime(s, hrs));
                }}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-zinc-600">End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          </div>

          {startTime && endTime && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
              <span className="font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                {formatTimeSlot(startTime, endTime)}
              </span>
              <span className="bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-full font-bold text-[11px]">
                {duration ? `${duration} hrs` : ""}
              </span>
            </div>
          )}

          {/* Quick presets */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Quick Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["09:00", "11:00", "9:00 AM – 11:00 AM"],
                ["11:00", "13:00", "11:00 AM – 1:00 PM"],
                ["13:00", "15:00", "1:00 PM – 3:00 PM"],
                ["14:00", "17:00", "2:00 PM – 5:00 PM"],
                ["15:00", "18:00", "3:00 PM – 6:00 PM"],
              ].map(([s, e, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => applyPreset(s, e)}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border border-transparent text-zinc-700 text-[11px] rounded transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Shift Timing */}
          <div className="flex items-center gap-2 pt-1 text-xs text-zinc-500">
            <span>Shift slot:</span>
            <button
              type="button"
              onClick={() => shiftTime(-30)}
              className="px-2 py-0.5 border border-zinc-200 hover:bg-zinc-50 text-[11px] rounded font-medium"
            >
              -30m
            </button>
            <button
              type="button"
              onClick={() => shiftTime(30)}
              className="px-2 py-0.5 border border-zinc-200 hover:bg-zinc-50 text-[11px] rounded font-medium"
            >
              +30m
            </button>
            <button
              type="button"
              onClick={() => shiftTime(60)}
              className="px-2 py-0.5 border border-zinc-200 hover:bg-zinc-50 text-[11px] rounded font-medium"
            >
              +1h
            </button>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : "Save Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Auto-Schedule & Shuffle Modal (Smart Sequential Planner)
// ---------------------------------------------------------------------------
function AutoScheduleModal({ open, onOpenChange, tasks, onSaved }) {
  const [startWorkday, setStartWorkday] = useState("09:00");
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && tasks.length > 0) {
      calculateChain(tasks, startWorkday);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tasks]);

  const calculateChain = (taskList, dayStartTime) => {
    let currentTime = dayStartTime || "09:00";
    const chained = taskList.map((t, idx) => {
      const hrs = Number(t.committed_time || t.manager_deadline) || 1;
      const s = currentTime;
      const e = addHoursToTime(currentTime, hrs);
      currentTime = e; // consecutive slot
      return {
        ...t,
        calculated_start: s,
        calculated_end: e,
        hours: hrs,
        sort_order: idx,
      };
    });
    setScheduledTasks(chained);
  };

  const handleStartTimeChange = (newStartTime) => {
    setStartWorkday(newStartTime);
    calculateChain(scheduledTasks, newStartTime);
  };

  const moveItem = (index, delta) => {
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= scheduledTasks.length) return;
    const reordered = [...scheduledTasks];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIdx, 0, moved);
    calculateChain(reordered, startWorkday);
  };

  const updateTaskDuration = (index, newHours) => {
    const hrs = Math.max(0.5, Number(newHours) || 1);
    const updated = [...scheduledTasks];
    updated[index] = { ...updated[index], committed_time: String(hrs), hours: hrs };
    calculateChain(updated, startWorkday);
  };

  const handleApply = async () => {
    setSaving(true);
    try {
      const items = scheduledTasks.map((t, idx) => ({
        id: t.id,
        sort_order: idx,
        start_time: t.calculated_start,
        end_time: t.calculated_end,
      }));
      await api.post("/tasks/reorder", { items });
      toast.success(`Schedule applied to ${scheduledTasks.length} task(s)!`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Wand2 className="w-5 h-5 text-emerald-600" />
            Auto-Schedule & Shuffle Day Timeline
          </DialogTitle>
          <p className="text-xs text-zinc-500">
            Automatically arranges your tasks into a continuous time schedule. Shuffle tasks up or down with the arrows to rearrange timings.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Workday Start Time control */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-xs text-emerald-950">Workday Start Time</p>
              <p className="text-[11px] text-emerald-800">All tasks will be scheduled consecutively starting from this time.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={startWorkday}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="w-32 h-8 text-xs bg-white font-mono"
              />
            </div>
          </div>

          {/* Sequential Tasks List with Up/Down buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 px-1">
              <span>Task Order ({scheduledTasks.length} tasks)</span>
              <span>Allocated Hours & Time Period</span>
            </div>

            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {scheduledTasks.map((t, idx) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 p-2.5 bg-white border border-zinc-200 rounded-lg hover:border-zinc-300 transition-all shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-5 text-center text-xs font-bold text-zinc-400">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-20"
                        title="Move Earlier"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === scheduledTasks.length - 1}
                        className="p-0.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-20"
                        title="Move Later"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 truncate">
                        {t.task_name}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {t.work_category} · {t.priority}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={t.hours}
                        onChange={(e) => updateTaskDuration(idx, e.target.value)}
                        className="w-16 h-7 text-xs text-center"
                        title="Change allocated hours"
                      />
                      <span className="text-[11px] text-zinc-400">hrs</span>
                    </div>

                    <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 min-w-[155px] justify-center">
                      <Clock className="w-3 h-3 text-emerald-600" />
                      <span>{formatTimeSlot(t.calculated_start, t.calculated_end)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={saving || scheduledTasks.length === 0}
            className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Apply Schedule to All Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Timeline View (Chronological Schedule Cards)
// ---------------------------------------------------------------------------
function TimelineScheduleView({ tasks, onOpenQuickTime, onMoveTask, onUpdateStatus }) {
  const scheduled = tasks.filter((t) => t.start_time);
  const unscheduled = tasks.filter((t) => !t.start_time);

  return (
    <div className="space-y-4">
      {scheduled.length === 0 && unscheduled.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 bg-white border border-zinc-200 rounded-xl">
          No tasks found for today. Create tasks or click "Schedule Day" to build your timeline!
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Scheduled Timeline */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                Scheduled Timeline ({scheduled.length})
              </h2>
            </div>

            {scheduled.length === 0 ? (
              <div className="p-8 text-center bg-white border border-dashed border-zinc-300 rounded-xl text-zinc-400 text-xs">
                No tasks have scheduled time slots yet. Click <strong>"⚡ Schedule Day"</strong> above to automatically arrange your tasks!
              </div>
            ) : (
              <div className="space-y-2.5">
                {scheduled.map((t, idx) => (
                  <div
                    key={t.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-zinc-200 rounded-xl hover:shadow-sm transition-all border-l-4 border-l-emerald-500"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Shuffle arrows */}
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <button
                          type="button"
                          onClick={() => onMoveTask(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-800 disabled:opacity-20"
                          title="Move Earlier"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveTask(idx, 1)}
                          disabled={idx === scheduled.length - 1}
                          className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-800 disabled:opacity-20"
                          title="Move Later"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenQuickTime(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 transition-colors"
                            title="Click to adjust time"
                          >
                            <Clock className="w-3 h-3 text-emerald-700" />
                            {formatTimeSlot(t.start_time, t.end_time)}
                          </button>
                          <Badge className={PRIORITY_STYLES[t.priority]}>{t.priority}</Badge>
                          <span className="text-[11px] text-zinc-400 font-medium">{t.work_category}</span>
                        </div>

                        <p className="font-semibold text-zinc-900 text-sm leading-snug">
                          {t.task_name}
                        </p>
                        {t.brief && (
                          <p className="text-xs text-zinc-500 line-clamp-2 max-w-lg">{t.brief}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <Select value={t.status} onValueChange={(v) => onUpdateStatus(t, v)}>
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onOpenQuickTime(t)}
                        className="h-8 text-xs text-zinc-500 hover:text-zinc-800"
                        title="Adjust timing"
                      >
                        Adjust
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unscheduled Tasks Tray */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 px-1">
              Unscheduled Tasks ({unscheduled.length})
            </h2>
            {unscheduled.length === 0 ? (
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-center text-xs text-zinc-400">
                All active tasks have scheduled times!
              </div>
            ) : (
              <div className="space-y-2">
                {unscheduled.map((t) => (
                  <div key={t.id} className="p-3 bg-white border border-zinc-200 rounded-lg hover:border-zinc-300 transition-all flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 truncate">{t.task_name}</p>
                      <p className="text-[10px] text-zinc-400">{t.committed_time || t.manager_deadline || 1} hrs · {t.priority}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenQuickTime(t)}
                      className="h-7 text-xs px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50 rounded-full shrink-0"
                    >
                      <Clock className="w-3 h-3 mr-1" /> Set Time
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskForm Dialog
// ---------------------------------------------------------------------------
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
    ? ["date", "task_name", "work_category", "priority", "start_time", "end_time", "committed_time", "status", "delay_reason", "review_notes", "output_link", "brief"]
    : ["date", "task_name", "work_category", "priority", "start_time", "end_time", "manager_deadline", "committed_time", "status", "delay_reason", "output_link", "review_notes", "brief"];

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
      case "start_time":
        return (
          <Field key={key} label="Start Time (Schedule)">
            <Input
              type="time"
              value={form.start_time || ""}
              onChange={(e) => {
                const s = e.target.value;
                set("start_time", s);
                const hrs = Number(form.committed_time || form.manager_deadline);
                if (s && hrs > 0 && !form.end_time) {
                  set("end_time", addHoursToTime(s, hrs));
                }
              }}
              className="text-xs font-mono"
            />
          </Field>
        );
      case "end_time":
        return (
          <Field key={key} label="End Time (Schedule)">
            <Input
              type="time"
              value={form.end_time || ""}
              onChange={(e) => {
                const en = e.target.value;
                set("end_time", en);
                if (form.start_time && en) {
                  const diff = calculateHoursDifference(form.start_time, en);
                  if (diff && !form.committed_time) {
                    set("committed_time", String(diff));
                  }
                }
              }}
              className="text-xs font-mono"
            />
          </Field>
        );
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
        {form.start_time && form.end_time && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-semibold flex items-center justify-between">
            <span>Allocated Schedule: {formatTimeSlot(form.start_time, form.end_time)}</span>
            <span>{calculateHoursDifference(form.start_time, form.end_time)} hrs</span>
          </div>
        )}
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

// ---------------------------------------------------------------------------
// Main Tasks Component
// ---------------------------------------------------------------------------
export default function Tasks() {
  const { isFounder } = useAuth();
  const [tab, setTab] = useState(isFounder ? "founder" : "designer");
  const founderMode = tab === "founder";
  const [viewMode, setViewMode] = useState("active"); // "active" | "saved"
  const [activeSubView, setActiveSubView] = useState("table"); // "table" | "timeline"
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [cloningSelected, setCloningSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quickTimeOpen, setQuickTimeOpen] = useState(false);
  const [quickTimeTask, setQuickTimeTask] = useState(null);
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);
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

  // Move task up or down and swap timings
  const handleMoveTask = async (index, delta) => {
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= tasks.length) return;

    const taskA = { ...tasks[index] };
    const taskB = { ...tasks[newIdx] };

    // Swap time slots if both have scheduled times
    if (taskA.start_time && taskB.start_time) {
      const tempStart = taskA.start_time;
      const tempEnd = taskA.end_time;
      taskA.start_time = taskB.start_time;
      taskA.end_time = taskB.end_time;
      taskB.start_time = tempStart;
      taskB.end_time = tempEnd;
    }

    const updated = [...tasks];
    updated[index] = taskB;
    updated[newIdx] = taskA;
    setTasks(updated);

    try {
      const items = updated.map((t, idx) => ({
        id: t.id,
        sort_order: idx,
        start_time: t.start_time || "",
        end_time: t.end_time || "",
      }));
      await api.post("/tasks/reorder", { items });
      toast.success("Task schedule shuffled!");
    } catch (e) {
      toast.error("Failed to update task order");
      load();
    }
  };

  const openQuickTime = (task) => {
    setQuickTimeTask(task);
    setQuickTimeOpen(true);
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

  // ---- Cell Renderers ----
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

  const cellSchedule = (t, idx) => (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {t.start_time ? (
        <button
          type="button"
          onClick={() => openQuickTime(t)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          title="Click to adjust time slot"
        >
          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{formatTimeSlot(t.start_time, t.end_time)}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openQuickTime(t)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 border border-dashed border-zinc-300"
          title="Click to set time schedule"
        >
          <Clock className="w-3 h-3 text-zinc-400" />
          <span>Set Time</span>
        </button>
      )}

      {/* Quick Move Up/Down buttons for active tasks */}
      {viewMode === "active" && (
        <div className="flex flex-col -my-1 ml-0.5">
          <button
            type="button"
            onClick={() => handleMoveTask(idx, -1)}
            disabled={idx === 0}
            className="p-0.5 text-zinc-400 hover:text-zinc-800 disabled:opacity-20"
            title="Move earlier / Shuffle up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleMoveTask(idx, 1)}
            disabled={idx === tasks.length - 1}
            className="p-0.5 text-zinc-400 hover:text-zinc-800 disabled:opacity-20"
            title="Move later / Shuffle down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  const cellCategory = (t) => <span className="text-xs whitespace-nowrap">{t.work_category}</span>;
  const cellBrief = (t) => <p className="text-xs text-zinc-600 line-clamp-2 max-w-[220px]">{t.brief || "—"}</p>;
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
  const cellDelay = (t) => t.delay_reason ? <p className="text-xs text-red-600 line-clamp-2 max-w-[160px]">{t.delay_reason}</p> : <span className="text-zinc-300">—</span>;
  const cellReview = (t) => t.review_notes ? <p className="text-xs text-zinc-700 line-clamp-2 max-w-[200px]">{t.review_notes}</p> : <span className="text-zinc-300">—</span>;
  const cellOutput = (t) => t.output_link
    ? <a href={t.output_link} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 text-xs" data-testid={`output-link-${t.id}`}><ExternalLink className="w-4 h-4" /></a>
    : <span className="text-zinc-300">—</span>;

  const columns = founderMode
    ? [
        { label: "Date", cell: cellDate, cls: "w-24" },
        { label: "Task Name", cell: cellName, cls: "min-w-[180px]" },
        { label: "Schedule (Time Slot)", cell: cellSchedule, cls: "min-w-[175px]" },
        { label: "Category", cell: cellCategory },
        { label: "Priority", cell: cellPriority },
        { label: "Est. Time", cell: cellCommitted, cls: "whitespace-nowrap" },
        { label: "Status", cell: cellStatus, cls: "min-w-[145px]" },
        { label: "Brief", cell: cellBrief, cls: "min-w-[180px]" },
        { label: "Delay Reason", cell: cellDelay, cls: "min-w-[150px]" },
        { label: "Review / Next Action", cell: cellReview, cls: "min-w-[180px]" },
        { label: "Output", cell: cellOutput },
      ]
    : [
        { label: "Date", cell: cellDate, cls: "w-24" },
        { label: "Task Name", cell: cellName, cls: "min-w-[180px]" },
        { label: "Schedule (Time Slot)", cell: cellSchedule, cls: "min-w-[175px]" },
        { label: "Work Type", cell: cellCategory },
        { label: "Priority", cell: cellPriority },
        { label: "Manager Deadline", cell: cellDeadline, cls: "whitespace-nowrap" },
        { label: "Committed Time", cell: cellCommitted, cls: "whitespace-nowrap" },
        { label: "Status", cell: cellStatus, cls: "min-w-[145px]" },
        { label: "Brief", cell: cellBrief, cls: "min-w-[180px]" },
        { label: "Delay Reason", cell: cellDelay, cls: "min-w-[150px]" },
        { label: "Output Link", cell: cellOutput },
        { label: "Review / Changes", cell: cellReview, cls: "min-w-[180px]" },
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
          {/* Auto-Schedule Day Button (Active View) */}
          {viewMode === "active" && tasks.length > 0 && (
            <Button
              onClick={() => setAutoScheduleOpen(true)}
              variant="outline"
              className="rounded-full border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-semibold text-xs h-9 shadow-xs"
              data-testid="auto-schedule-button"
              title="Automatically arrange and chain tasks into a time schedule"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              Schedule Day
            </Button>
          )}

          {/* Prominent Save Button in Active View */}
          {viewMode === "active" && tasks.length > 0 && (
            <Button
              onClick={handleSaveAll}
              disabled={savingAll}
              className="rounded-full bg-emerald-600 hover:bg-emerald-700 font-semibold text-white shadow-sm transition-all text-xs h-9"
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Subview Toggle in Active Mode (Table vs Timeline) */}
          {viewMode === "active" && (
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
              <button
                type="button"
                onClick={() => setActiveSubView("table")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1 transition-all ${
                  activeSubView === "table" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setActiveSubView("timeline")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1 transition-all ${
                  activeSubView === "timeline" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Timeline Schedule
              </button>
            </div>
          )}

          {/* View Mode Toggle: Active vs Saved */}
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
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

      {/* Active Mode: Timeline View vs Table View */}
      {viewMode === "active" && activeSubView === "timeline" ? (
        <TimelineScheduleView
          tasks={tasks}
          onOpenQuickTime={openQuickTime}
          onMoveTask={handleMoveTask}
          onUpdateStatus={updateStatus}
        />
      ) : (
        /* Tasks Table */
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
                  tasks.map((t, idx) => (
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
                        <TableCell key={c.label} className={c.cls}>{c.cell(t, idx)}</TableCell>
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
      )}

      {/* Edit/Create Dialog */}
      <TaskForm open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={load} mode={tab} />

      {/* Quick Time Adjustment Dialog */}
      <QuickTimeModal
        open={quickTimeOpen}
        onOpenChange={setQuickTimeOpen}
        task={quickTimeTask}
        onSaved={load}
      />

      {/* Auto-Schedule & Shuffle Modal */}
      <AutoScheduleModal
        open={autoScheduleOpen}
        onOpenChange={setAutoScheduleOpen}
        tasks={tasks}
        onSaved={load}
      />
    </div>
  );
}
