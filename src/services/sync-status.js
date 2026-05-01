(function(global){
  const STATUS_ID = "syncStatusFloating";

  function ensureNode(){
    let node = document.getElementById(STATUS_ID);
    if(node) return node;
    node = document.createElement("div");
    node.id = STATUS_ID;
    node.setAttribute("aria-live", "polite");
    node.style.position = "fixed";
    node.style.right = "14px";
    node.style.bottom = "14px";
    node.style.zIndex = "9999";
    node.style.padding = "10px 12px";
    node.style.borderRadius = "999px";
    node.style.fontSize = "12px";
    node.style.fontWeight = "700";
    node.style.letterSpacing = "0.03em";
    node.style.boxShadow = "0 10px 24px rgba(0,0,0,.12)";
    node.style.border = "1px solid transparent";
    node.style.transition = "all .2s ease";
    node.style.display = "none";
    document.body.appendChild(node);
    return node;
  }

  function paint(text, styles){
    const node = ensureNode();
    node.textContent = text;
    node.style.display = "block";
    node.style.background = styles.background;
    node.style.color = styles.color;
    node.style.borderColor = styles.borderColor;
  }

  function setSaving(){
    paint("Guardando...", {
      background:"rgba(186,125,61,.14)",
      color:"#8A5422",
      borderColor:"rgba(186,125,61,.28)"
    });
  }

  function setSynced(){
    paint("Sincronizado", {
      background:"rgba(61,122,90,.12)",
      color:"#2E6A4D",
      borderColor:"rgba(61,122,90,.26)"
    });
    global.clearTimeout(setSynced._timer);
    setSynced._timer = global.setTimeout(() => {
      const node = document.getElementById(STATUS_ID);
      if(node) node.style.display = "none";
    }, 2200);
  }

  function setError(){
    paint("Error de sync", {
      background:"rgba(184,72,49,.12)",
      color:"#9D3E2C",
      borderColor:"rgba(184,72,49,.26)"
    });
  }

  global.AppSyncStatus = {
    setSaving,
    setSynced,
    setError
  };
})(window);
