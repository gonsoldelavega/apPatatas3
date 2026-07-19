try {
  const theme = localStorage.getItem("factupapa-theme");
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}
