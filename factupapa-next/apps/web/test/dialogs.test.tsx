import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { askConfirm, askText, DialogHost, showNotice } from "../src/ui/dialogs";

describe("diálogos propios", () => {
  it("confirmar resuelve true y cancelar false", async () => {
    render(<DialogHost />);
    let result: Promise<boolean> | undefined;
    act(() => {
      result = askConfirm("¿Borrar la nota?", { danger: true });
    });
    expect(await screen.findByText("¿Borrar la nota?")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    expect(await result).toBe(true);

    act(() => {
      result = askConfirm("¿Otra vez?");
    });
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await result).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("pide texto y lo devuelve; cancelar devuelve null", async () => {
    render(<DialogHost />);
    let result: Promise<string | null> | undefined;
    act(() => {
      result = askText("Mensaje", "Hola");
    });
    const input = (await screen.findByDisplayValue("Hola")) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "¡Bienvenida, Irene!");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await result).toBe("¡Bienvenida, Irene!");

    act(() => {
      result = askText("Mensaje");
    });
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await result).toBeNull();
  });

  it("un aviso solo tiene «Entendido»", async () => {
    render(<DialogHost />);
    let done = false;
    act(() => {
      void showNotice("No se puede").then(() => {
        done = true;
      });
    });
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Entendido" }));
    await Promise.resolve();
    expect(done).toBe(true);
  });
});
