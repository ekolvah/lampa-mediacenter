// Общее шагов season-badge: карточки экрана с данными ядра (card_data) и их метки.
var SB = {
  cards: function () {
    return Array.prototype.slice.call(document.querySelectorAll('.card')).filter(function (el) { return el.card_data; });
  },
  badge: function (el) {
    var b = el.querySelector('.card__season');
    return b ? b.textContent : null;
  },
  series: function (d) {
    return d.source === 'KP' ? d.type === 'tv' : (d.source === 'tmdb' || d.source === 'cub') && !!d.original_name;
  },
  // Метки на фильмах: «id метка».
  moviesWithBadge: function () {
    return SB.cards().filter(function (el) { return !SB.series(el.card_data) && SB.badge(el); })
      .map(function (el) { return el.card_data.id + ' ' + SB.badge(el); });
  }
};
