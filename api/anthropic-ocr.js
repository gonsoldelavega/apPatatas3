function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Anthropic-Api-Key");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function parseDataUrl(dataUrl = "") {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

function safeJsonParse(text = "") {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = String(text).match(/```json\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {}
    }
    const objectMatch = String(text).match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
}

export default async function handler(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "method_not_allowed" });

  const apiKey = request.headers["x-anthropic-api-key"] || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) return response.status(400).json({ ok: false, error: "missing_anthropic_key" });

  const image = parseDataUrl(request.body?.imageDataUrl || "");
  if (!image) return response.status(400).json({ ok: false, error: "invalid_image" });

  const suppliers = Array.isArray(request.body?.suppliers) ? request.body.suppliers.slice(0, 200) : [];
  const existingOcrText = String(request.body?.ocrText || "").slice(0, 12000);
  const model = process.env.ANTHROPIC_OCR_MODEL || "claude-3-5-sonnet-latest";

  const prompt = [
    "Analiza una imagen de ticket o factura de proveedor en Espana para una app de facturacion.",
    "Debes devolver SOLO JSON valido, sin markdown ni texto extra.",
    "Objetivo:",
    "1. Reconstruir el texto del documento lo mejor posible.",
    "2. Extraer estructura util para negocio: tipo, titulo, fecha, proveedor, nif, subtotal/base, iva, total, numero de factura.",
    "3. Si detectas un proveedor de la lista, devuelve su supplierId.",
    "4. Si no estas seguro de un campo, usa cadena vacia o null.",
    "5. Mantente conservador: no inventes importes ni fechas.",
    "",
    "Lista de proveedores conocidos:",
    JSON.stringify(suppliers),
    "",
    "OCR local previo disponible para ayudarte:",
    existingOcrText || "(vacio)",
    "",
    "Devuelve exactamente este esquema JSON:",
    JSON.stringify({
      text: "texto completo limpio del documento",
      summary: {
        documentType: "ticket|supplierInvoice|deliveryProof|receipt|other|",
        title: "",
        supplierId: "",
        supplierName: "",
        nif: "",
        invoiceNumber: "",
        date: "",
        subtotal: null,
        iva: null,
        total: null,
        notes: ""
      }
    })
  ].join("\n");

  let anthropicResponse;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1400,
        temperature: 0,
        system: "Eres un extractor documental estricto. Responde solo con JSON valido.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mediaType,
                  data: image.data
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      })
    });
  } catch (error) {
    return response.status(502).json({ ok: false, error: "anthropic_network_error", message: error?.message || String(error) });
  }

  const responseText = await anthropicResponse.text();
  if (!anthropicResponse.ok) {
    return response.status(anthropicResponse.status).json({
      ok: false,
      error: "anthropic_api_error",
      status: anthropicResponse.status,
      body: responseText.slice(0, 2000)
    });
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(responseText);
  } catch {
    return response.status(502).json({ ok: false, error: "anthropic_invalid_response", body: responseText.slice(0, 2000) });
  }

  const outputText = Array.isArray(parsedResponse?.content)
    ? parsedResponse.content.filter(item => item?.type === "text").map(item => item.text || "").join("\n")
    : "";
  const result = safeJsonParse(outputText);
  if (!result) {
    return response.status(502).json({ ok: false, error: "anthropic_invalid_json", body: outputText.slice(0, 2000) });
  }

  return response.status(200).json({
    ok: true,
    provider: "anthropic",
    model,
    text: String(result?.text || ""),
    summary: result?.summary && typeof result.summary === "object" ? result.summary : {},
    raw: {
      id: parsedResponse?.id || "",
      stop_reason: parsedResponse?.stop_reason || ""
    }
  });
}
