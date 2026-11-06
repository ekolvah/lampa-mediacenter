(async function () {
  // Пересобрать Главную без перезагрузки страницы (кэш плагина тёплый).
  var a = Lampa.Activity.active();
  HC.check(a.component === 'main', 'ожидалась Главная, активна ' + a.component);
  Lampa.Activity.replace({ url: a.url, title: a.title, component: a.component, source: a.source, page: 1 });
  for (var i = 0; i < 60; i++) {
    await HC.sleep(250);
    var c = Lampa.Activity.active().activity.component;
    if (c && c.items && c.items.length >= 5 && Lampa.Controller.enabled().name === 'items_line') break;
  }
  await HC.sleep(1500);
  HC.check(HC.rows().length >= 5, 'Главная не собралась');
  return 'ok: ' + HC.rows().length + ' рядов';
})()
