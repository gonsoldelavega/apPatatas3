import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Contact, Product } from "../api/types";
import {
  contactsApi,
  invoicesApi,
  pricingApi,
  productsApi,
  salesPreferencesApi,
} from "../api/services";
import { annualInvoiceSeries, formatMoney, todayLocal } from "../utils/format";
import {
  parseInvoiceVoiceCommand,
  voiceMatchKey,
  type VoiceUnitHint,
} from "./commandParser";

type RecognitionResultEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};
type RecognitionErrorEvent = { error?: string };
type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => RecognitionInstance;

type PreviewLine = {
  product: Product;
  quantity: number;
  unitHint: VoiceUnitHint;
  unitPrice: string;
  taxRate: string;
  total: number;
};
type InvoicePreview = {
  contact: Contact;
  lines: PreviewLine[];
  total: number;
};

function recognitionConstructor(): RecognitionConstructor | null {
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null;
}

function rankMatch(label: string, query: string): number {
  const candidate = voiceMatchKey(label);
  const target = voiceMatchKey(query);
  if (candidate === target) return 0;
  if (candidate.startsWith(target) || target.startsWith(candidate)) return 1;
  if (candidate.includes(target) || target.includes(candidate)) return 2;
  return 99;
}

function pickContact(items: Contact[], query: string): Contact {
  const candidates = items
    .filter((contact) => contact.type !== "supplier")
    .map((contact) => ({
      contact,
      score: Math.min(
        rankMatch(contact.tradeName ?? "", query),
        rankMatch(contact.legalName, query),
      ),
    }))
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score);
  if (!candidates.length) throw new Error(`No encuentro el cliente «${query}».`);
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    throw new Error(`Hay varios clientes que encajan con «${query}». Especifica un poco más.`);
  }
  return candidates[0].contact;
}

function pickProduct(items: Product[], query: string): Product {
  const candidates = items
    .map((product) => ({ product, score: rankMatch(product.name, query) }))
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score);
  if (!candidates.length) throw new Error(`No encuentro el producto «${query}».`);
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    throw new Error(`Hay varios productos que encajan con «${query}». Especifica un poco más.`);
  }
  return candidates[0].product;
}

function validateUnit(product: Product, hint: VoiceUnitHint) {
  if (!hint) return;
  if (hint === "kg" && product.unit !== "kg") {
    throw new Error(`${product.name} no está configurado en kg. Revisa la orden antes de crearla.`);
  }
  if (hint === "unit" && product.unit === "kg") {
    throw new Error(`${product.name} está configurado en kg, no en unidades.`);
  }
}

export function VoiceAssistant() {
  const navigate = useNavigate();
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [command, setCommand] = useState("");
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speechSupported = useMemo(() => Boolean(recognitionConstructor()), []);

  const startListening = () => {
    setError(null);
    setPreview(null);
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setError("Este navegador no ofrece reconocimiento de voz. Puedes escribir la orden; Pipecat se conectará al nuevo VPS.");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setCommand(transcript);
    };
    recognition.onerror = () => {
      setError("No pude entender el audio. Puedes repetirlo o escribir la orden.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const prepareInvoice = async () => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const parsed = parseInvoiceVoiceCommand(command);
      const contactPage = await contactsApi.list({ isActive: true, pageSize: 100 });
      const contact = pickContact(contactPage.items, parsed.customerQuery);
      const [effectivePrices, productPage] = await Promise.all([
        pricingApi.list(contact.id, { pageSize: 100 }),
        productsApi.list({ isActive: true, pageSize: 100 }),
      ]);
      const lines: PreviewLine[] = [];

      for (const requested of parsed.lines) {
        const product = pickProduct(productPage.items, requested.productQuery);
        validateUnit(product, requested.unitHint);
        const effective = effectivePrices.items.find((item) => item.id === product.id);
        const unitPrice = effective?.effectivePrice ?? product.salePrice;
        const taxRate = effective?.taxRate ?? product.taxRate;
        const total = requested.quantity * Number(unitPrice) * (1 + Number(taxRate) / 100);
        lines.push({
          product,
          quantity: requested.quantity,
          unitHint: requested.unitHint,
          unitPrice,
          taxRate,
          total,
        });
      }

      setPreview({
        contact,
        lines,
        total: lines.reduce((sum, line) => sum + line.total, 0),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pude preparar esa factura.");
    } finally {
      setBusy(false);
    }
  };

  const createDraft = async () => {
    if (!preview) return;
    setCreating(true);
    setError(null);
    try {
      const issueDate = todayLocal();
      const preferences = await salesPreferencesApi.get();
      const prefix = preferences.numberingMode === "live" ? preferences.invoicePrefix : "TEST";
      const series = annualInvoiceSeries(prefix, issueDate);
      const numberPreview = await invoicesApi.numberPreview(series, issueDate);
      const created = await invoicesApi.create({
        contactId: preview.contact.id,
        series,
        number: numberPreview.number,
        issueDate,
        applyContactDefaults: true,
      });
      for (const line of preview.lines) {
        await invoicesApi.addLine(created.id, {
          productId: line.product.id,
          quantity: String(line.quantity),
          unitPrice: line.unitPrice,
          deliveryDate: issueDate,
        });
      }
      setOpen(false);
      setCommand("");
      setPreview(null);
      navigate(`/ventas/facturas/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el borrador.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`voice-orb${listening ? " voice-orb--listening" : ""}`}
        aria-label="Abrir asistente de voz"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Mic aria-hidden="true" />
        <span className="voice-orb__pulse" aria-hidden="true" />
      </button>
      {open && (
        <section className="voice-panel" aria-label="Asistente de FactuPapa">
          <header className="voice-panel__header">
            <div>
              <p className="eyebrow">Asistente</p>
              <h2>Habla con FactuPapa</h2>
            </div>
            <button type="button" className="voice-panel__close" aria-label="Cerrar" onClick={() => setOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="voice-panel__safety">La voz prepara la factura. Tú confirmas antes de crear el borrador y nunca se emite automáticamente.</p>
          <div className="voice-panel__composer">
            <textarea
              rows={3}
              value={command}
              onChange={(event) => {
                setCommand(event.target.value);
                setPreview(null);
                setError(null);
              }}
              placeholder="Ej.: Haz una factura para Bar Pepito con 100 kilos de patata y 10 lechugas"
              aria-label="Orden para el asistente"
            />
            <div className="voice-panel__actions">
              <button
                type="button"
                className={`voice-listen${listening ? " voice-listen--active" : ""}`}
                onClick={listening ? stopListening : startListening}
              >
                {listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
                {listening ? "Parar" : speechSupported ? "Hablar" : "Voz no disponible"}
              </button>
              <button type="button" className="voice-prepare" disabled={!command.trim() || busy} onClick={prepareInvoice}>
                <Sparkles aria-hidden="true" />
                {busy ? "Preparando…" : "Preparar factura"}
              </button>
            </div>
          </div>
          <small className="voice-panel__engine">Modo provisional sin coste de API: reconocimiento del navegador. Pipecat/voz local se conectará al nuevo VPS.</small>
          {error && <p className="voice-panel__error" role="alert">{error}</p>}
          {preview && (
            <div className="voice-preview">
              <div className="voice-preview__title">
                <div><small>Cliente</small><strong>{preview.contact.tradeName || preview.contact.legalName}</strong></div>
                <strong>{formatMoney(String(preview.total))}</strong>
              </div>
              <div className="voice-preview__lines">
                {preview.lines.map((line) => (
                  <p key={`${line.product.id}-${line.quantity}`}>
                    <span>{line.quantity} {line.product.unit === "kg" ? "kg" : "ud"} · {line.product.name}</span>
                    <strong>{formatMoney(String(line.total))}</strong>
                  </p>
                ))}
              </div>
              <button type="button" className="voice-confirm" disabled={creating} onClick={createDraft}>
                {creating ? "Creando borrador…" : "Confirmar y crear borrador"}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
