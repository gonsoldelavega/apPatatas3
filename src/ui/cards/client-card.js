(function(global){
  function renderClientCard(client, deps){
    return `<article class="card card-tight">
      <div class="list-row-top">
        <div>
          <h3 class="list-row-title">${deps.esc(client.name)}</h3>
          <p class="list-row-sub">${deps.esc(client.phone || "Sin tel\u00e9fono")} \u00b7 ${deps.esc(client.email || "Sin email")}</p>
        </div>
        <span class="chip ${deps.n(client.debtManual) > 0 ? "warn" : "good"}">${deps.money(client.debtManual || 0)}</span>
      </div>
      <div class="inline-summary">
        <span class="chip">${deps.esc(client.address || "Sin direcci\u00f3n")}</span>
        <span class="chip">${deps.esc(deps.templateName(client.templateId || "base"))}</span>
        ${client.taxId ? `<span class="chip">NIF/CIF: ${deps.esc(client.taxId)}</span>` : ""}
        ${client.paymentTermsDefault ? `<span class="chip warn">Cl\u00e1usula legal</span>` : ""}
        ${client.notes ? `<span class="chip">${deps.esc(client.notes)}</span>` : ""}
      </div>
      <div class="card-actions">
        <button data-action="edit-client" data-id="${client.id}">Editar</button>
        <button data-action="new-invoice-for-client" data-id="${client.id}">Facturar</button>
        <button class="danger" data-action="delete-client" data-id="${client.id}">Eliminar</button>
      </div>
    </article>`;
  }

  global.AppUICardClient = { renderClientCard };
})(window);
