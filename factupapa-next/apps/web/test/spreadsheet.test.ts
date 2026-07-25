import { describe, expect, it } from "vitest";
import { spreadsheetRowsToCsv } from "../src/imports/spreadsheet";

describe("conversión segura de Excel", () => {
  it("preserva cabeceras, fechas y celdas con comas", () => {
    expect(
      spreadsheetRowsToCsv([
        ["Nombre", "Fecha", "Notas"],
        ["Bar López", new Date("2026-07-25T00:00:00.000Z"), "Uno, dos"],
        [null, null, null],
      ]),
    ).toBe(
      'Nombre,Fecha,Notas\nBar López,2026-07-25,"Uno, dos"',
    );
  });

  it("trata las fórmulas recibidas como texto y no las ejecuta", () => {
    expect(spreadsheetRowsToCsv([["Nombre"], ["=1+1"]])).toBe(
      "Nombre\n=1+1",
    );
  });
});
