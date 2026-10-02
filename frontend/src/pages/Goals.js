import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "../components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Target } from "lucide-react";
import {
  GOAL_TYPES, CATEGORIES, OWNERS, FREQUENCIES, GOAL_STATUS, CATEGORY_ACCENT,
} from "../lib/constants";

const emptyGoal = () => ({
  goal_type: "Daily",
  category: "Pitching",
  goal_name: "",
  target_number: 0,
  unit: "leads",
  owner: "Founder",
  founder_responsibility: "",
  designer_responsibility: "",
  frequency: "Daily",
  status: "Active",
});

function GoalForm({ open, onOpenChange, initial, onSaved }) {
  const [form, setForm] = useState(initial || emptyGoal());
  const [saving, setSaving] = useState(false);
  const isEdit = !!(initial && initial.id);

  useEffect(() => { setForm(initial || emptyGoal()); }, [initial, open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.goal_name.trim()) { toast.error("Goal name is required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, target_number: Number(form.target_number) || 0 };
      if (isEdit) {
        await api.put(`/goals/${form.id}`, payload);
        toast.success("Goal updated — linked tasks synced");
      } else {
        await api.post("/goals", payload);
        toast.success("Goal created");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, children }) => (
    <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>
  );
  const Sel = ({ k, options }) => (
    <Select value={form[k]} onValueChange={(v) => set(k, v)}>
      <SelectTrigger data-testid={`goal-${k}-select`}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="goal-dialog">
        <DialogHeader><DialogTitle className="font-display">{isEdit ? "Edit Goal" : "New Goal"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Field label="Goal Name"><Input value={form.goal_name} onChange={(e) => set("goal_name", e.target.value)} placeholder="e.g. Doctor Pitching" data-testid="goal-name-input" /></Field></div>
          <Field label="Goal Type"><Sel k="goal_type" options={GOAL_TYPES} /></Field>
          <Field label="Category"><Sel k="category" options={CATEGORIES} /></Field>
          <Field label="Target Number"><Input type="number" value={form.target_number} onChange={(e) => set("target_number", e.target.value)} data-testid="goal-target-input" /></Field>
          <Field label="Unit"><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="leads, posts, ₹…" /></Field>
          <Field label="Owner"><Sel k="owner" options={OWNERS} /></Field>
          <Field label="Frequency"><Sel k="frequency" options={FREQUENCIES} /></Field>
          <Field label="Status"><Sel k="status" options={GOAL_STATUS} /></Field>
          <div />
          <div className="sm:col-span-2"><Field label="Founder Responsibility"><Textarea rows={2} value={form.founder_responsibility} onChange={(e) => set("founder_responsibility", e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Designer Responsibility"><Textarea rows={2} value={form.designer_responsibility} onChange={(e) => set("designer_responsibility", e.target.value)} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-none">Cancel</Button>
          <Button onClick={save} disabled={saving} className="rounded-full bg-emerald-600 hover:bg-emerald-700" data-testid="goal-save-button">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const pct = (d, t) => (t > 0 ? Math.round((d / t) * 100) : 0);

export default function Goals() {
  const { isFounder } = useAuth();
  const [goals, setGoals] = useState([]);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, d] = await Promise.all([api.get("/goals"), api.get("/dashboard")]);
      setGoals(g.data);
      setDash(d.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    if (!window.confirm("Delete this goal? Its pending auto-tasks will be removed.")) return;
    try {
      await api.delete(`/goals/${id}`);
      toast.success("Goal deleted");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const byCategory = CATEGORIES.map((c) => ({ category: c, items: goals.filter((g) => g.category === c) }));

  return (
    <div className="p-6 lg:p-8 fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Targets & Goals</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter text-zinc-900">Goals & Allocation</h1>
        </div>
        {isFounder && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="rounded-full bg-emerald-600 hover:bg-emerald-700 font-semibold" data-testid="add-goal-button">
            <Plus className="w-4 h-4 mr-1" /> New Goal
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview" data-testid="tab-overview">Goals Overview</TabsTrigger>
          <TabsTrigger value="list" data-testid="tab-list">Master List & Allocation</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          {loading ? (
            <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" /></div>
          ) : (
            <>
              {dash && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-white border border-zinc-200 rounded-lg p-5" data-testid="overview-daily-progress">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Daily Target Progress</p>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-3xl font-black font-display">{dash.daily_target_progress.done}<span className="text-lg text-zinc-400">/{dash.daily_target_progress.total}</span></span>
                      <span className="text-sm font-bold text-emerald-600">{pct(dash.daily_target_progress.done, dash.daily_target_progress.total)}%</span>
                    </div>
                    <Progress value={pct(dash.daily_target_progress.done, dash.daily_target_progress.total)} className="h-2" />
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-lg p-5" data-testid="overview-monthly-progress">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Monthly Goal Progress</p>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-3xl font-black font-display">{dash.monthly_goal_progress.done}<span className="text-lg text-zinc-400">/{dash.monthly_goal_progress.total}</span></span>
                      <span className="text-sm font-bold text-emerald-600">{pct(dash.monthly_goal_progress.done, dash.monthly_goal_progress.total)}%</span>
                    </div>
                    <Progress value={pct(dash.monthly_goal_progress.done, dash.monthly_goal_progress.total)} className="h-2" />
                  </div>
                </div>
              )}

              {goals.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-lg py-16 text-center text-zinc-400 text-sm">
                  No goals yet. {isFounder ? "Create your first goal to get started." : "Ask the founder to set up goals."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {byCategory.filter((c) => c.items.length > 0).map((c) => (
                    <div key={c.category} className="bg-white border border-zinc-200 rounded-lg overflow-hidden" data-testid={`overview-cat-${c.category}`}>
                      <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2" style={{ borderTop: `3px solid ${CATEGORY_ACCENT[c.category]}` }}>
                        <Target className="w-4 h-4" style={{ color: CATEGORY_ACCENT[c.category] }} />
                        <h3 className="text-sm font-bold text-zinc-800">{c.category}</h3>
                        <span className="ml-auto text-xs text-zinc-400">{c.items.length}</span>
                      </div>
                      <ul className="divide-y divide-zinc-50">
                        {c.items.map((g) => (
                          <li key={g.id} className="px-4 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-zinc-900 truncate">{g.goal_name}</span>
                              <span className="text-sm font-bold shrink-0" style={{ color: CATEGORY_ACCENT[c.category] }}>
                                {g.target_number}{g.unit ? ` ${g.unit}` : ""}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                              <span>{g.owner}</span>·<span>{g.frequency}</span>
                              {g.status === "Paused" && <span className="text-amber-600 font-semibold">· Paused</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* MASTER LIST */}
        <TabsContent value="list">
          <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="ops-table">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="min-w-[160px]">Goal Name</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="min-w-[160px]">Founder Resp.</TableHead>
                    <TableHead className="min-w-[160px]">Designer Resp.</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Status</TableHead>
                    {isFounder && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" /></TableCell></TableRow>
                  ) : goals.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-12 text-zinc-400 text-sm">No goals yet.</TableCell></TableRow>
                  ) : (
                    goals.map((g) => (
                      <TableRow key={g.id} data-testid={`goal-row-${g.id}`}>
                        <TableCell className="text-xs whitespace-nowrap">{g.goal_type}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_ACCENT[g.category] }} />
                            {g.category}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold text-sm text-zinc-900">{g.goal_name}</TableCell>
                        <TableCell className="text-sm font-bold text-emerald-700 whitespace-nowrap">{g.target_number}{g.unit ? ` ${g.unit}` : ""}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{g.owner}</TableCell>
                        <TableCell className="text-xs text-zinc-500 max-w-[200px]">{g.founder_responsibility || "—"}</TableCell>
                        <TableCell className="text-xs text-zinc-500 max-w-[200px]">{g.designer_responsibility || "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{g.frequency}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${g.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{g.status}</span>
                        </TableCell>
                        {isFounder && (
                          <TableCell className="text-right whitespace-nowrap">
                            <button onClick={() => { setEditing(g); setDialogOpen(true); }} className="p-1.5 hover:bg-zinc-100 rounded transition-colors" data-testid={`edit-goal-${g.id}`}>
                              <Pencil className="w-4 h-4 text-zinc-500" />
                            </button>
                            <button onClick={() => remove(g.id)} className="p-1.5 hover:bg-red-50 rounded transition-colors" data-testid={`delete-goal-${g.id}`}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          {!isFounder && <p className="text-xs text-zinc-400 mt-3">Only the founder/manager can add or edit goals.</p>}
        </TabsContent>
      </Tabs>

      <GoalForm open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={load} />
    </div>
  );
}
