(function(global){
  function uid(prefix){
    return prefix + "-" + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
  }

  global.AppUtilsIds = {
    uid
  };
})(window);
