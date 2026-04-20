function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

function normalizeResult(result = {}) {
  return {
    numero_factura: result.numero_factura ?? null,
    fecha: result.fecha ?? null,
    proveedor_nombre: result.proveedor_nombre ?? null,
    proveedor_nif: result.proveedor_nif ?? null,
    cliente_nombre: result.cliente_nombre ?? null,
    cliente_nif: result.cliente_nif ?? null,
    lineas: Array.isArray(result.lineas)
      ? result.lineas.map(line => ({
          descripcion: line?.descripcion ?? null,
          cantidad: line?.cantidad ?? null,
          precio_unitario: line?.precio_unitario ?? null,
          base: line?.base ?? null,
          iva_pct: line?.iva_pct ?? null,
          total: line?.total ?? null
        }))
      : [],
    base_total: result.base_total ?? null,
    iva_total: result.iva_total ?? null,
    total_factura: result.total_factura ?? null
  };
}

export default async function handler(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "method_not_allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    return response.status(500).json({ ok: false, error: "missing_anthropic_api_key" });
  }

  const image = parseDataUrl(request.body?.imageDataUrl || "");
  if (!image) {
    return response.status(400).json({ ok: false, error: "invalid_image" });
  }

  const prompt = [
    "Eres un experto en extracción de datos de facturas españolas.",
    "Analiza esta imagen de factura y extrae en JSON:",
    "{",
    '  "numero_factura": string | null,',
    '  "fecha": "YYYY-MM-DD" | null,',
    '  "proveedor_nombre": string | null,',
    '  "proveedor_nif": string | null,',
    '  "cliente_nombre": string | null,',
    '  "cliente_nif": string | null,',
    '  "lineas": [{"descripcion": string | null, "cantidad": number | null, "precio_unitario": number | null, "base": number | null, "iva_pct": number | null, "total": number | null}],',
    '  "base_total": number | null,',
    '  "iva_total": number | null,',
    '  "total_factura": number | null',
    "}",
    "Si no puedes leer algún campo, ponlo como null.",
    "Responde SOLO con JSON válido, sin texto extra."
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1800,
        temperature: 0,
        system: "Responde solo con JSON válido.",
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
    return response.status(502).json({
      ok: false,
      error: error?.message || "anthropic_network_error"
    });
  }

  const responseText = await anthropicResponse.text();
  if (!anthropicResponse.ok) {
    return response.status(anthropicResponse.status).json({
      ok: false,
      error: responseText.slice(0, 2000) || "anthropic_api_error"
    });
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    return response.status(502).json({
      ok: false,
      error: "anthropic_invalid_response"
    });
  }

  const outputText = Array.isArray(payload?.content)
    ? payload.content.filter(item => item?.type === "text").map(item => item.text || "").join("\n")
    : "";

  const parsed = safeJsonParse(outputText);
  if (!parsed) {
    return response.status(502).json({
      ok: false,
      error: "anthropic_invalid_json"
    });
  }

  return response.status(200).json({
    ok: true,
    result: normalizeResult(parsed)
  });
}
