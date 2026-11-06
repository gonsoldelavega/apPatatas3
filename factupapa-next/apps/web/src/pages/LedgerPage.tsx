import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Plus, Scale, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useIsOwner } from "../auth/roles";
import { ledgerApi, type LedgerKind, type Side } from "../api/workspace";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { formatMoney, todayLocal } from "../utils/format";
import { describeBalance, formatShortDate, KIND_LABELS, monthRange } from "../workspace/helpers";

export function LedgerPage() {
  const queryClient = useQueryClient();
  const owner = useIsOwner();
  const [month, setMonth] = useState("");
  const period = month ? monthRange(month) : {};
  const summary = useQuery({ queryKey: ["ledger-summary", month], queryFn: () => ledgerApi.summary(period) });
  const entries = useQuery({ queryKey: ["ledger-entries", month], queryFn: () => ledgerApi.entries(period) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ledger-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
  };

  const [kind, setKind] = useState<LedgerKind>("expense");
  const [side, setSide] = useState<Side>(owner ? "side_a" : "side_b");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [date, setDate] = useState(todayLocal());
  const add = useMutation({
    mutationFn: () => ledgerApi.create({ kind, side, amount: amount.trim().replace(",", "."), concept: concept.trim(), entryDate: date }),
    onSuccess: async () => {
      setAmount("");
      setConcept("");
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => ledgerApi.remove(id), onSuccess: refresh });
  const settle = useMutation({ mutationFn: () => ledgerApi.settle(), onSuccess: refresh });
  const [namesA, setNamesA] = useState<string | null>(null);
  const [namesB, setNamesB] = useState<string | null>(null);
  const saveNames = useMutation({
    mutationFn: () =>
      ledgerApi.saveNames({
        sideAName: (namesA ?? data?.sideNames.side_a ?? "").trim(),
        sideBName: (namesB ?? data?.sideNames.side_b ?? "").trim(),
      }),
    onSuccess: refresh,
  });

  const data = summary.data;
  const names = data?.sideNames;
  const balance = data ? describeBalance(data) : null;
  const validAmount = /^\d{1,12}([.,]\d{1,2})?$/.test(amount.trim()) && Number(amount.replace(",", ".")) > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (validAmount && concept.trim()) add.mutate();
  };
  const kindHelp =
    kind === "expense"
      ? "Lo ha pagado este núcleo: el otro le debe la mitad."
      : kind === "income"
        ? "Lo ha cobrado este núcleo: debe la mitad al otro."
        : "Este núcleo entrega dinero al otro para saldar lo que debe.";
  const sideLabelFor = (value: Side) => names?.[value] ?? (value === "side_a" ? "Núcleo A" : "Núcleo B");

  return (
    <div className="page workspace-page ledger-page">
      <header className="page-heading">
        <div>
          <h1>Cuentas</h1>
          <p className="form-hint">Gastos e ingresos del negocio a medias (50 %). Aquí se ve quién debe a quién.</p>
        </div>
      </header>

      <section className={`ledger-hero${balance?.tone === "owed" ? " ledger-hero--owed" : ""}`} aria-live="polite">
        <Scale aria-hidden="true" />
        {summary.isLoading || !balance ? (
          <strong>Calculando…</strong>
        ) : balance.tone === "even" ? (
          <>
            <strong>{balance.headline}</strong>
            <p>{balance.detail}</p>
          </>
        ) : (
          <>
            <small>Pendiente de saldar</small>
            <strong>{balance.headline}</strong>
            <p>{balance.detail}</p>
          </>
        )}
        {data && balance?.tone === "owed" && (
          <Button
            variant="secondary"
            icon={<HandCoins />}
            busy={settle.isPending}
            onClick={() => {
              if (window.confirm(`¿Registrar que ${data.balance.debtorName} ha pagado ${formatMoney(data.balance.amount)} a ${data.balance.creditorName} y dejar las cuentas a cero?`)) settle.mutate();
            }}
          >
            Saldar cuentas
          </Button>
        )}
      </section>

      {data && (
        <section className="ledger-sides" aria-label="Resumen por núcleo">
          {(["side_a", "side_b"] as const).map((key) => (
            <article key={key} className="detail-card ledger-side">
              <h2>{sideLabelFor(key)}</h2>
              <dl>
                <div>
                  <dt>Ha pagado</dt>
                  <dd>{formatMoney(data.totals[key].expenses)}</dd>
                </div>
                <div>
                  <dt>Ha cobrado</dt>
                  <dd>{formatMoney(data.totals[key].income)}</dd>
                </div>
                {Number(data.totals[key].settlements) > 0 && (
                  <div>
                    <dt>Ha entregado al otro</dt>
                    <dd>{formatMoney(data.totals[key].settlements)}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </section>
      )}

      <form className="detail-card workspace-form" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Nuevo apunte</p>
            <h2>¿Qué ha pasado?</h2>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Tipo de apunte">
          {(["expense", "income", "settlement"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>
              {KIND_LABELS[value]}
            </button>
          ))}
        </div>
        <SelectField label={kind === "expense" ? "Quién lo ha pagado" : kind === "income" ? "Quién lo ha cobrado" : "Quién paga"} value={side} onChange={(event) => setSide(event.target.value as Side)}>
          <option value="side_a">{sideLabelFor("side_a")}</option>
          <option value="side_b">{sideLabelFor("side_b")}</option>
        </SelectField>
        <p className="form-hint">{kindHelp}</p>
        <div className="workspace-form__row">
          <Field label="Importe (€)" inputMode="decimal" placeholder="35" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <Field label="Fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <Field label="Concepto" placeholder="Ej.: Material para el negocio" value={concept} onChange={(event) => setConcept(event.target.value)} />
        <Button type="submit" icon={<Plus />} busy={add.isPending} disabled={!validAmount || !concept.trim()}>
          Añadir apunte
        </Button>
        {add.isError && (
          <p className="action-feedback action-feedback--error" role="alert">
            No se pudo guardar el apunte.
          </p>
        )}
        {settle.isError && (
          <p className="action-feedback action-feedback--error" role="alert">
            No hay nada que saldar o no se pudo registrar.
          </p>
        )}
      </form>

      <section className="detail-card">
        <div className="section-heading ledger-list-head">
          <h2>Apuntes</h2>
          <Field label="Mes" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        {month && data && (
          <p className="form-hint">
            Este mes: gastos {formatMoney(data.result.expenses)} · ingresos {formatMoney(data.result.income)}. El balance de arriba es siempre el acumulado.
          </p>
        )}
        {entries.isLoading ? (
          <p className="form-hint">Cargando apuntes…</p>
        ) : (entries.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="Todavía no hay apuntes" description="Añade el primer gasto o ingreso con el formulario de arriba." />
        ) : (
          <ul className="ledger-entries">
            {entries.data?.items.map((entry) => (
              <li key={entry.id} className={`ledger-entry ledger-entry--${entry.kind}`}>
                <div>
                  <strong>{entry.concept}</strong>
                  <small>
                    {formatShortDate(entry.entryDate)} · {KIND_LABELS[entry.kind]} · {sideLabelFor(entry.side)} · {entry.createdByName}
                  </small>
                </div>
                <span className="ledger-entry__amount">{entry.kind === "expense" ? "−" : entry.kind === "income" ? "+" : "⇄"} {formatMoney(entry.amount)}</span>
                {entry.canEdit && (
                  <button
                    type="button"
                    className="task-delete"
                    aria-label={`Borrar apunte: ${entry.concept}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`¿Borrar el apunte «${entry.concept}» de ${formatMoney(entry.amount)}?`)) remove.mutate(entry.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {owner && data && (
        <details className="detail-card ledger-names">
          <summary>Nombres de los núcleos</summary>
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              if ((namesA ?? data.sideNames.side_a).trim() && (namesB ?? data.sideNames.side_b).trim()) saveNames.mutate();
            }}
          >
            <Field label="Núcleo A" value={namesA ?? data.sideNames.side_a} onChange={(event) => setNamesA(event.target.value)} />
            <Field label="Núcleo B" value={namesB ?? data.sideNames.side_b} onChange={(event) => setNamesB(event.target.value)} />
            <Button type="submit" busy={saveNames.isPending}>
              Guardar nombres
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
