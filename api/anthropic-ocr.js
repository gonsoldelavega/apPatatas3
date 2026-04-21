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

  let body = request.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.anthropic_api_key || "";
  if (!apiKey) {
    return response.status(500).json({ ok: false, error: "missing_anthropic_api_key" });
  }

  const image = parseDataUrl(body?.imageDataUrl || "");
  if (!image) {
    return response.status(400).json({ ok: false, error: "invalid_image" });
  }

  const prompt = `Eres un experto en extracción de datos de facturas españolas de distribuidores de frutas y verduras.

Analiza esta imagen de factura y extrae los datos en JSON.

PROVEEDORES HABITUALES:
- FRUTAS Y PATATAS GAYCA S.A. (NIF: A04037677): columnas Unds=cantidad, Precio=precio unitario, Importe=total línea
- J. EXPÓSITO CAZORLA E HIJOS S.L. (NIF: B04854154): columnas Tot.Unds=cantidad, Precio=precio unitario, Total=total línea

INSTRUCCIONES:
- numero_factura: el número de factura (ej: FV006-00000709, 26002777)
- fecha: fecha en formato YYYY-MM-DD
- proveedor_nombre: nombre completo del proveedor emisor
- proveedor_nif: NIF del proveedor
- cliente_nombre: nombre del cliente receptor
- cliente_nif: NIF del cliente
- lineas: array con cada producto de la factura
  - descripcion: nombre del producto
  - cantidad: número de unidades o kilos
  - precio_unitario: precio por unidad/kilo
  - base: importe sin IVA de esa línea
  - iva_pct: porcentaje de IVA (normalmente 4 para alimentación)
  - total: importe total de esa línea con IVA
- base_total: suma de bases imponibles
- iva_total: suma de cuotas de IVA
- total_factura: importe total a pagar

Responde SOLO con JSON válido, sin texto extra, sin markdown.`;

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
        model: "claude-sonnet-4-5",
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
