// Общие помощники живой проверки; cdp.py выполняет каждый шаг как выражение,
// поэтому шаги склеиваются с этим файлом в hide-cards.sh (см. там же).
var HC = {
  plugin: function () {
    var p = window.torrent_quality_badge_plugin;
    if (!p || typeof p.applyVerdict !== 'function') throw new Error('на приставке не сборка ветки: нет torrent_quality_badge_plugin.applyVerdict');
    return p;
  },
  sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
  rows: function () {
    var a = Lampa.Activity.active();
    if (a.component !== 'main') throw new Error('ожидалась Главная, активна ' + a.component);
    return a.activity.component.items;
  },
  owned: function () {
    var line = HC.rows().find(function (l) { return Lampa.Controller.own(l); });
    if (!line) throw new Error('ни один ряд не владеет контроллером: ' + Lampa.Controller.enabled().name);
    return line;
  },
  cards: function (line) {
    return line.items.filter(function (it) { return line.data.results.indexOf(it.data) >= 0; });
  },
  focused: function () { return document.querySelector('.focus'); },
  check: function (ok, msg) { if (!ok) throw new Error(msg); },
  // Скрыть карточку штатным путём плагина и дождаться микрозадачи с добором.
  hide: async function (line, item) {
    HC.plugin().applyVerdict(line, item, true);
    await HC.sleep(80);
  }
};
