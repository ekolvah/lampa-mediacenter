// Общие помощники живой проверки; cdp.py выполняет каждый шаг как выражение,
// поэтому шаги склеиваются с этим файлом в hide-cards.sh (см. там же).
var HC = {
  plugin: function () {
    var p = window.torrent_quality_badge_plugin;
    if (!p || typeof p.applyVerdict !== 'function') throw new Error('на приставке не сборка ветки: нет torrent_quality_badge_plugin.applyVerdict');
    return p;
  },
  sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
  // Опрашивать cond каждые ms, не больше tries раз; истина — дождались.
  until: async function (cond, tries, ms) {
    for (var i = 0; i < tries; i++) {
      if (cond()) return true;
      await HC.sleep(ms);
    }
    return !!cond();
  },
  // Дождаться активного компонента (до 10 с).
  activeIs: function (component) {
    return HC.until(function () { return Lampa.Activity.active().component === component; }, 40, 250);
  },
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
  // Открытая сетка категории (category_full), иначе null.
  grid: function () {
    var a = Lampa.Activity.active();
    return a.component === 'category_full' ? a.activity.component : null;
  },
  // Владелец карточек под проверкой: открытая сетка, иначе ряд под фокусом.
  owner: function () { return HC.grid() || HC.owned(); },
  // Все владельцы на экране: сетка или ряды Главной.
  owners: function () { var g = HC.grid(); return g ? [g] : HC.rows(); },
  title: function (owner) { return owner === HC.grid() ? 'сетка' : owner.data.title; },
  // Карточки владельца: в сетке все items, в ряду — без «Ещё» (её data нет в results).
  cards: function (owner) {
    if (owner === HC.grid()) return owner.items.slice();
    return owner.items.filter(function (it) { return owner.data.results.indexOf(it.data) >= 0; });
  },
  // Карточка под фокусом владельца, иначе первая.
  focusedCard: function (owner) {
    var cards = HC.cards(owner);
    return cards.find(function (it) { return it.render(true) === owner.last; }) || cards[0];
  },
  // Видимая часть сетки неполна — мерой самого плагина.
  short: function (grid) {
    return HC.plugin().gridShortage(grid.items.length, grid.active, grid.params.items.cols);
  },
  // Нажатие «ОК» пульта: тот же hover:enter, что шлёт навигатор (Utils.trigger).
  enter: function (el) {
    var ev = document.createEvent('Event');
    ev.initEvent('hover:enter', false, true);
    el.dispatchEvent(ev);
  },
  // Открыть сетку по «Ещё» первого ряда Главной, где она есть, и дождаться её фокуса.
  openGrid: async function () {
    var more = null;
    HC.rows().some(function (line) { more = line.render(true).querySelector('.card-more'); return !!more; });
    HC.check(more, 'на Главной нет кнопки «Ещё»');
    HC.enter(more);
    await HC.until(function () {
      var g = HC.grid();
      return g && g.items.length && Lampa.Controller.enabled().name === 'content';
    }, 60, 250);
    var grid = HC.grid();
    HC.check(grid, '«Ещё» открыло не сетку category_full, а ' + Lampa.Activity.active().component);
    await HC.sleep(1500);
    return grid;
  },
  focused: function () { return document.querySelector('.focus'); },
  check: function (ok, msg) { if (!ok) throw new Error(msg); },
  // Скрыть карточку штатным путём плагина и дождаться микрозадачи с добором.
  hide: async function (owner, item) {
    HC.plugin().applyVerdict(owner, item, true);
    await HC.sleep(80);
  }
};
