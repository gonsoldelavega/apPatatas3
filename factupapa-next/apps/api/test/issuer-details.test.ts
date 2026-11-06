import assert from "node:assert/strict";
import { test } from "node:test";
import { address, issuerContactLine } from "../src/invoices/pdf.js";

test("la dirección sale en orden postal aunque la base de datos reordene las claves", () => {
  // jsonb guarda las claves por longitud: city, street, postalCode.
  const fromDatabase = { city: "Cortijos de Marín", street: "Calle Antoñete s/n", postalCode: "04741" };
  assert.equal(address(fromDatabase), "Calle Antoñete s/n, 04741, Cortijos de Marín");
});

test("la dirección admite país y claves desconocidas al final, y omite vacíos", () => {
  assert.equal(
    address({ country: "ES", city: "Roquetas de Mar", street: "Calle Mayor 1", postalCode: "04740", nota: "Local 2" }),
    "Calle Mayor 1, 04740, Roquetas de Mar, ES, Local 2",
  );
  assert.equal(address({ street: "", city: "Almería" }), "Almería");
  assert.equal(address({}), "");
});

test("línea de contacto del emisor: correo y web", () => {
  assert.equal(issuerContactLine({ email: "contacto@origenpatatas.com", website: "origenpatatas.com" }), "contacto@origenpatatas.com · origenpatatas.com");
  assert.equal(issuerContactLine({ email: "contacto@origenpatatas.com", website: null }), "contacto@origenpatatas.com");
  assert.equal(issuerContactLine({ email: null, website: "origenpatatas.com" }), "origenpatatas.com");
  assert.equal(issuerContactLine({}), "");
});
