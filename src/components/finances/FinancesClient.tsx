"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, DollarSign } from "lucide-react";
import { Button, Badge, EmptyState, StatCard, CollapsibleSection, CollapsibleGroup } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { ReceiptScanner } from "@/components/finances/ReceiptScanner";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { filterBySearchQuery } from "@/lib/search/text-match";
import { usePageSearch } from "@/hooks/usePageSearch";

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  receiptUrl: string | null;
}

const EXPENSE_CATEGORIES = [
  "Food & Supplies",
  "Utilities",
  "Maintenance",
  "Labor",
  "Marketing",
  "Equipment",
  "Insurance",
  "Other",
];

export function FinancesClient({
  initialExpenses,
  weeklyRevenue,
}: {
  initialExpenses: Expense[];
  weeklyRevenue: number;
}) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const { query } = usePageSearch();
  const visibleExpenses = useMemo(
    () =>
      filterBySearchQuery(expenses, query, (expense) => [
        expense.description,
        expense.category,
        formatDate(expense.date),
      ]),
    [expenses, query]
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: "Food & Supplies",
    date: new Date().toISOString().split("T")[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const profit = weeklyRevenue - totalExpenses;

  const openCreate = () => {
    setEditing(null);
    setForm({ description: "", amount: "", category: "Food & Supplies", date: new Date().toISOString().split("T")[0] });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setForm({
      description: expense.description,
      amount: String(expense.amount),
      category: expense.category,
      date: expense.date.split("T")[0],
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount) {
      setError("Description and amount are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        description: form.description,
        amount: parseFloat(form.amount),
        category: form.category,
        date: form.date,
      };
      if (editing) {
        const updated = await apiPatch<Expense>(`/api/expenses/${editing.id}`, payload);
        setExpenses((prev) => prev.map((e) => (e.id === editing.id ? updated : e)));
      } else {
        const created = await apiPost<Expense>("/api/expenses", payload);
        setExpenses((prev) => [created, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    await apiDelete(`/api/expenses/${id}`);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const handleReceiptExpense = (expense: Expense) => {
    setExpenses((prev) => [expense, ...prev]);
  };

  const byCategory = expenses.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <>
      <CollapsibleGroup defaultExpanded="all">
        <CollapsibleSection id="summary" title="Financial summary" defaultOpen>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Weekly Revenue" value={formatCurrency(weeklyRevenue)} />
            <StatCard label="Monthly Expenses" value={formatCurrency(totalExpenses)} />
            <StatCard
              label="Net"
              value={formatCurrency(profit)}
              className={profit < 0 ? "border-red-200 bg-red-50" : ""}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="receipts" title="Scan receipts & reports" className="mt-4" defaultOpen>
          <ReceiptScanner onExpenseCreated={handleReceiptExpense} />
        </CollapsibleSection>

        <CollapsibleSection
          id="expenses"
          title="Expenses"
          className="mt-4"
          defaultOpen
          headerActions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          }
        >
          {Object.keys(byCategory).length > 0 && (
            <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">Breakdown</h3>
              <div className="mt-3 space-y-2">
                {Object.entries(byCategory).map(([category, amount]) => (
                  <div key={category} className="flex justify-between text-sm">
                    <span className="text-slate-600">{category}</span>
                    <span className="font-medium">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibleExpenses.length === 0 ? (
            <EmptyState
              icon={<DollarSign className="h-12 w-12" />}
              title="No expenses recorded"
              description="Add expenses manually or scan a receipt."
              action={<Button onClick={openCreate}>Add Expense</Button>}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">Date</th>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">Description</th>
                    <th className="px-6 py-3 text-left font-medium text-slate-500">Category</th>
                    <th className="px-6 py-3 text-right font-medium text-slate-500">Amount</th>
                    <th className="px-6 py-3 text-right font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="px-6 py-4 text-slate-600">{formatDate(expense.date)}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{expense.description}</td>
                      <td className="px-6 py-4">
                        <Badge className="bg-slate-100 text-slate-600">{expense.category}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right font-medium">{formatCurrency(expense.amount)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(expense)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(expense.id)}>
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      </CollapsibleGroup>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Expense" : "Add Expense"}>
        <div className="space-y-4">
          <FormField label="Description">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Amount">
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </FormField>
            <FormField label="Date">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
