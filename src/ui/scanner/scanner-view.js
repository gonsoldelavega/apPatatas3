(function(global){
  let scannerRoot = null;
  let scannerController = null;

  function ensureRoot(){
    if(scannerRoot) return scannerRoot;
    scannerRoot = document.createElement("div");
    scannerRoot.id = "scannerRoot";
    document.body.appendChild(scannerRoot);
    return scannerRoot;
  }

  function sessionSnapshot(state){
    return {
      id: state.id,
      createdAt: state.createdAt,
      pages: state.pages.map(page => ({
        id: page.id,
        createdAt: page.createdAt,
        source: page.source,
        corners: page.corners,
        variants: page.variants,
        selectedFilter: page.selectedFilter,
        ocr: page.ocr,
        meta: page.meta
      }))
    };
  }

  function openScannerFlow(options = {}){
    if(scannerController) scannerController.close();
    const store = global.AppScannerStore.createScannerStore({
      createSession: global.AppDomainScannerSession.createScanSession,
      createPage: global.AppDomainScannerPage.createScanPage
    });
    const root = ensureRoot();
    root.className = "scanner-shell show";

    const deps = {
      camera: global.AppCameraService,
      detector: global.AppVisionDocumentDetector,
      processing: global.AppVisionScanProcessing,
      ocr: global.AppOcrService,
      pdf: global.AppPdfExportService,
      store,
      options
    };

    let mounted = null;

    function shouldConfirmExit(){
      const state = store.getState();
      return Boolean(state.pages.length || state.capture);
    }

    function requestClose(){
      if(shouldConfirmExit() && !window.confirm("Se perderá el escaneo actual si sales ahora. ¿Quieres cerrar el escáner?")){
        return;
      }
      close();
    }

    function close(){
      mounted?.teardown?.();
      mounted = null;
      root.className = "scanner-shell";
      root.innerHTML = "";
      scannerController = null;
      options.onCancel?.();
    }

    async function commitPage(capture, pageData){
      if(capture.replacePageId){
        store.updatePage(capture.replacePageId, page => {
          page.source = pageData.source;
          page.corners = pageData.corners;
          page.variants = pageData.variants;
          page.selectedFilter = pageData.selectedFilter;
          page.meta = pageData.meta;
        });
        store.setActivePage(capture.replacePageId);
        store.setCapture(null);
        store.setStep("preview");
        return;
      }
      store.addPage(pageData);
    }

    async function exportPdf(){
      const state = store.getState();
      if(!state.pages.length) return;
      const blob = await deps.pdf.exportPagesToPdf(state.pages);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `scan-${new Date().toISOString().slice(0,10)}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    function render(state){
      mounted?.teardown?.();
      mounted = null;
      if(state.step === "camera"){
        root.innerHTML = global.AppUIScannerCamera.renderScannerCamera(state);
        mounted = global.AppUIScannerCamera.mountScannerCamera(root, {
          state,
          camera: deps.camera,
          detector: deps.detector,
          onClose: requestClose,
          onToggleAuto: () => store.update(current => { current.options.autoCapture = !current.options.autoCapture; }),
          onError: error => options.onError?.(error),
          onCapture: capture => {
            const replacePageId = store.getState().capture?.replacePageId || "";
            store.setCapture({
              sourceDataUrl: capture.sourceCanvas.toDataURL("image/jpeg", 0.95),
              corners: capture.corners,
              detected: capture.detected,
              confidence: capture.confidence,
              replacePageId
            });
            store.setStep("crop");
          }
        });
        return;
      }

      if(state.step === "crop" && state.capture){
        root.innerHTML = global.AppUIScannerCropEditor.renderScannerCropEditor(state.capture);
        mounted = global.AppUIScannerCropEditor.mountScannerCropEditor(root, {
          capture: state.capture,
          onRetake: () => {
            store.setCapture(null);
            store.setStep("camera");
          },
          onBackPreview: () => {
            if(state.pages.length){
              store.setStep("preview");
            }else{
              store.setCapture(null);
              store.setStep("camera");
            }
          },
          onClose: requestClose,
          onApply: async corners => {
            const pageData = await deps.processing.createPageFromCapture(state.capture, {
              corners,
              selectedFilter: store.getState().options.selectedFilter || "document"
            });
            await commitPage(state.capture, pageData);
          },
          onUseFullImage: async () => {
            const pageData = await deps.processing.createPageFromFullImage(state.capture, {
              selectedFilter: store.getState().options.selectedFilter || "document"
            });
            await commitPage(state.capture, pageData);
          }
        });
        return;
      }

      root.innerHTML = global.AppUIScannerPreview.renderScannerPreview(state);
        mounted = global.AppUIScannerPreview.mountScannerPreview(root, {
        onClose: requestClose,
        onSelectPage: pageId => store.setActivePage(pageId),
        onFilter: filter => {
          const activePageId = store.getState().activePageId;
          store.updatePage(activePageId, page => {
            page.selectedFilter = filter;
          });
          store.update(current => {
            current.options.selectedFilter = filter;
          });
        },
        onAddPage: () => store.setStep("camera"),
        onRetakePage: () => {
          const activePage = store.getState().pages.find(page => page.id === store.getState().activePageId);
          if(!activePage) return;
          store.setCapture({ replacePageId: activePage.id });
          store.setStep("camera");
        },
        onUseScan: () => {
          const snapshot = sessionSnapshot(store.getState());
          mounted?.teardown?.();
          root.className = "scanner-shell";
          root.innerHTML = "";
          scannerController = null;
          options.onComplete?.(snapshot);
        },
        onRemovePage: () => {
          const activePageId = store.getState().activePageId;
          if(!activePageId) return;
          store.removePage(activePageId);
          if(!store.getState().pages.length) store.setStep("camera");
        },
        onReorder: offset => {
          const current = store.getState();
          const index = current.pages.findIndex(page => page.id === current.activePageId);
          if(index === -1) return;
          store.reorderPages(index, index + offset);
        },
        onEditCorners: () => {
          const activePage = store.getState().pages.find(page => page.id === store.getState().activePageId);
          if(!activePage) return;
          store.setCapture({
            sourceDataUrl: activePage.source,
            corners: activePage.corners,
            detected: activePage.meta?.processingMode === "perspective",
            confidence: activePage.meta?.confidence || 0,
            replacePageId: activePage.id
          });
          store.setStep("crop");
        },
        onRunOcr: async () => {
          const current = store.getState();
          const activePage = current.pages.find(page => page.id === current.activePageId);
          if(!activePage) return;
          const filter = activePage.selectedFilter || "document";
          const result = await deps.ocr.recognizeImage(activePage.variants?.[filter] || activePage.source);
          store.updatePage(activePage.id, page => {
            page.ocr = result;
          });
        },
        onExportPdf: exportPdf
      });
    }

    store.subscribe(render);
    scannerController = { close };
    return scannerController;
  }

  global.AppUIScannerView = {
    openScannerFlow,
    closeScannerFlow(){
      scannerController?.close();
    }
  };
})(window);
