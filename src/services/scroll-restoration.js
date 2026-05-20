(function(){
  function scrollTopSoon(){
    requestAnimationFrame(() => {
      window.scrollTo({ top:0, left:0, behavior:"auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }

  document.addEventListener("click", event => {
    const navButton = event.target.closest("#tabs [data-view], #views [data-view], #views [data-dashboard-nav]");
    if(!navButton) return;
    scrollTopSoon();
  }, true);

  window.addEventListener("hashchange", scrollTopSoon);
})();
