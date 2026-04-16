(function(global){
  function createScannerStore(deps = {}){
    const createSession = deps.createSession || global.AppDomainScannerSession.createScanSession;
    const createPage = deps.createPage || global.AppDomainScannerPage.createScanPage;
    let state = createSession();
    const listeners = new Set();

    function emit(){
      listeners.forEach(listener => listener(state));
    }

    function setState(next){
      state = next;
      emit();
      return state;
    }

    function update(producer){
      const draft = structuredClone(state);
      producer(draft);
      return setState(draft);
    }

    function reset(input = {}){
      return setState(createSession(input));
    }

    function addPage(pageInput){
      const page = createPage(pageInput);
      update(current => {
        current.pages.push(page);
        current.activePageId = page.id;
        current.step = "preview";
        current.capture = null;
      });
      return page;
    }

    function updatePage(pageId, producer){
      update(current => {
        const index = current.pages.findIndex(page => page.id === pageId);
        if(index === -1) return;
        producer(current.pages[index]);
      });
    }

    function removePage(pageId){
      update(current => {
        current.pages = current.pages.filter(page => page.id !== pageId);
        current.activePageId = current.pages[0]?.id || "";
      });
    }

    function reorderPages(fromIndex, toIndex){
      if(fromIndex === toIndex) return;
      update(current => {
        if(fromIndex < 0 || toIndex < 0 || fromIndex >= current.pages.length || toIndex >= current.pages.length) return;
        const [page] = current.pages.splice(fromIndex, 1);
        current.pages.splice(toIndex, 0, page);
      });
    }

    function setActivePage(pageId){
      update(current => {
        current.activePageId = pageId;
      });
    }

    function setStep(step){
      update(current => {
        current.step = step;
      });
    }

    function setCapture(capture){
      update(current => {
        current.capture = capture;
      });
    }

    function subscribe(listener){
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }

    return {
      getState: () => state,
      subscribe,
      reset,
      update,
      addPage,
      updatePage,
      removePage,
      reorderPages,
      setActivePage,
      setStep,
      setCapture
    };
  }

  global.AppScannerStore = {
    createScannerStore
  };
})(window);
