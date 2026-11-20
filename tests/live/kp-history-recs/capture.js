(function () {
  // Сразу после старта, до первого тика ядра (120 с): предупреждения плагина и записи очереди.
  window.__recsWarns = [];
  window.__recsTicks = 0;
  var warn = console.warn;
  console.warn = function () {
    window.__recsWarns.push([].slice.call(arguments).join(' '));
    return warn.apply(console, arguments);
  };
  Lampa.Storage.listener.follow('change', function (e) {
    if (e.name === 'recomends_scan') window.__recsTicks++;
  });
  return 'ok: capture';
})()
