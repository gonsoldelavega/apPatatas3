import { BriefcaseBusiness, ChevronLeft, ChevronRight, CircleAlert, FileCheck2, Landmark } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { taxApi } from "../api/services";
import { formatMoney } from "../utils/format";

const euro = (value: number) => formatMoney(value.toFixed(2));
export function GestoriaPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const profile = useQuery({ queryKey: ["tax-profile"], queryFn: taxApi.profile });
  const forecast = useQuery({ queryKey: ["tax-forecast", year, quarter], queryFn: () => taxApi.forecast(year, quarter) });
  const data = forecast.data;
  const label = useMemo(() => `${quarter}T ${year}`, [quarter, year]);
  const shift = (delta: number) => { const next = quarter + delta; if (next < 1) { setQuarter(4); setYear(year - 1); } else if (next > 4) { setQuarter(1); setYear(year + 1); } else setQuarter(next); };
  return <div className="page gestoria-page">
    <header className="page-heading"><div><p className="eyebrow">Fiscalidad</p><h1>Gestoría</h1></div><BriefcaseBusiness aria-hidden="true" /></header>
    <div className="tax-period-picker" aria-label="Cambiar trimestre"><button type="button" aria-label="Trimestre anterior" onClick={() => shift(-1)}><ChevronLeft /></button><strong>{label}</strong><button type="button" aria-label="Trimestre siguiente" onClick={() => shift(1)}><ChevronRight /></button></div>
    <section className="tax-hero" aria-labelledby="tax-forecast-title"><p className="eyebrow">Previsión del trimestre</p><h2 id="tax-forecast-title">A reservar</h2><strong className="tax-hero__amount">{data ? euro(data.reserve) : "—"}</strong><p className="tax-hero__note">Estimación de FactuPapa · no es una declaración presentada.</p><div className="tax-hero__breakdown"><span>IVA estimado <b>{data ? euro(data.vat.balance) : "—"}</b></span><span>IRPF estimado <b>{data?.irpf.applicable ? euro(data.irpf.result) : "No aplica"}</b></span></div></section>
    {data?.incomplete && <div className="tax-warning" role="status"><CircleAlert /><div><strong>Estimación incompleta</strong><p>Faltan datos contabilizados para una previsión completa.</p></div></div>}
    <section className="tax-card" aria-labelledby="tax-quality-title"><div className="section-heading"><h2 id="tax-quality-title">Estado de los datos</h2><FileCheck2 /></div><ul className="tax-quality-list"><li><span>✓</span>{data?.quality.salesCount ?? 0} facturas de venta contabilizadas</li><li><span>✓</span>{data?.quality.purchaseCount ?? 0} compras confirmadas</li>{(data?.quality.warnings ?? []).map((warning) => <li className="warning" key={warning}><span>⚠</span>{warning}</li>)}</ul></section>
    <section className="tax-card"><div className="section-heading"><h2>Desglose fiscal</h2><Landmark /></div><div className="tax-detail-grid"><div><small>IVA repercutido</small><strong>{data ? euro(data.vat.salesTax) : "—"}</strong></div><div><small>IVA deducible</small><strong>{data ? euro(data.vat.deductibleTax) : "—"}</strong></div><div><small>Saldo estimado</small><strong>{data ? euro(data.vat.balance) : "—"}</strong></div><div><small>Ingresos acumulados</small><strong>{data ? euro(data.irpf.accumulatedIncome) : "—"}</strong></div><div><small>Gastos deducibles acumulados</small><strong>{data ? euro(data.irpf.accumulatedExpenses) : "—"}</strong></div><div><small>Modelo 130</small><strong>{data?.irpf.applicable ? euro(data.irpf.result) : "No aplica"}</strong></div></div></section>
    <section className="tax-card"><h2>Próximos vencimientos</h2><p className="tax-due-date">20 {quarter === 3 ? "octubre" : quarter === 4 ? "enero" : quarter === 1 ? "abril" : "julio"} · {label}</p><small>Fecha orientativa configurable para la presentación trimestral. La domiciliación puede tener un plazo distinto.</small></section>
    <section className="tax-card tax-profile"><h2>Perfil fiscal</h2><p>Régimen actual: <strong>{profile.data?.incomeTaxRegime === "direct" ? "Estimación directa · Modelo 130" : profile.data?.incomeTaxRegime === "objective" ? "Módulos · no se calcula Modelo 130" : "No aplica"}</strong></p><small>Configura el perfil con tu gestoría antes de usar estas cifras para decisiones fiscales.</small></section>
  </div>;
}
