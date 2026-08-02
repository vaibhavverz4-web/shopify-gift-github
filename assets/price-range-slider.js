/* ==========================================================================
   Price range slider
   Keeps the two range handles in sync with the number inputs Shopify submits.

   Capture phase matters: the facet form's own listener sits on the <form> and
   fires during bubbling. Running here in capture means the number inputs are
   already updated by the time the form reads them, so no extra event needs
   dispatching and no stale value is ever submitted.
   ========================================================================== */

(function () {
  'use strict';

  var GAP = 1; // minimum distance between the two handles, in currency units

  function els(slider) {
    return {
      min: slider.querySelector('[data-range="min"]'),
      max: slider.querySelector('[data-range="max"]'),
      minInput: slider.querySelector('[data-input="min"]'),
      maxInput: slider.querySelector('[data-input="max"]'),
      minBubble: slider.querySelector('[data-bubble="min"]'),
      maxBubble: slider.querySelector('[data-bubble="max"]'),
      control: slider.querySelector('.price-slider__control')
    };
  }

  function currencySymbol(slider) {
    var field = slider.querySelector('.field-currency');
    return field ? field.textContent.trim() : '';
  }

  function paint(slider) {
    var e = els(slider);
    if (!e.min || !e.max || !e.control) return;

    var ceiling = parseFloat(slider.dataset.rangeMax) || 0;
    if (ceiling <= 0) return;

    var lo = parseFloat(e.min.value) || 0;
    var hi = parseFloat(e.max.value);
    if (isNaN(hi)) hi = ceiling;

    var startPct = (lo / ceiling) * 100;
    var endPct = (hi / ceiling) * 100;

    e.control.style.setProperty('--fill-start', startPct + '%');
    e.control.style.setProperty('--fill-end', endPct + '%');

    var symbol = currencySymbol(slider);
    if (e.minBubble) e.minBubble.textContent = symbol + lo;
    if (e.maxBubble) e.maxBubble.textContent = symbol + hi;
  }

  /* Handles cannot cross, and the "max" handle only writes a value when it is
     below the ceiling — an empty max means "no upper bound", which is what
     Shopify expects. */
  function sync(slider, source) {
    var e = els(slider);
    if (!e.min || !e.max) return;

    var ceiling = parseFloat(slider.dataset.rangeMax) || 0;
    var lo = parseFloat(e.min.value) || 0;
    var hi = parseFloat(e.max.value);
    if (isNaN(hi)) hi = ceiling;

    if (lo > hi - GAP) {
      if (source === 'min') {
        lo = Math.max(0, hi - GAP);
        e.min.value = lo;
      } else {
        hi = Math.min(ceiling, lo + GAP);
        e.max.value = hi;
      }
    }

    if (e.minInput) e.minInput.value = lo > 0 ? lo : '';
    if (e.maxInput) e.maxInput.value = hi < ceiling ? hi : '';

    paint(slider);
  }

  /* Typing in the number boxes moves the handles back */
  function syncFromFields(slider) {
    var e = els(slider);
    if (!e.min || !e.max) return;

    var ceiling = parseFloat(slider.dataset.rangeMax) || 0;
    var lo = parseFloat(e.minInput && e.minInput.value);
    var hi = parseFloat(e.maxInput && e.maxInput.value);

    e.min.value = isNaN(lo) ? 0 : lo;
    e.max.value = isNaN(hi) ? ceiling : hi;

    paint(slider);
  }

  document.addEventListener(
    'input',
    function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      var slider = target.closest('[data-price-slider]');
      if (!slider) return;

      if (target.matches('.price-slider__range')) {
        sync(slider, target.dataset.range);
      } else if (target.matches('[data-input="min"], [data-input="max"]')) {
        syncFromFields(slider);
      }
    },
    true // capture
  );

  function initAll() {
    document.querySelectorAll('[data-price-slider]').forEach(paint);
  }

  document.addEventListener('DOMContentLoaded', initAll);
  if (document.readyState !== 'loading') initAll();

  /* The facet form swaps its own HTML out after each filter change, so the
     sliders that come back need repainting. */
  var observer = new MutationObserver(function () {
    initAll();
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.facets-container, #main-collection-filters').forEach(function (node) {
      observer.observe(node, { childList: true, subtree: true });
    });
  });
})();


 /* Two full-width range inputs overlap, so the top one swallows every click.
     Before the press lands, raise whichever handle is nearer the pointer. */
  document.addEventListener(
    'pointerdown',
    function (event) {
      var control = event.target.closest && event.target.closest('.price-slider__control');
      if (!control) return;

      var slider = control.closest('[data-price-slider]');
      if (!slider) return;

      var e = els(slider);
      if (!e.min || !e.max) return;

      var ceiling = parseFloat(slider.dataset.rangeMax) || 0;
      if (ceiling <= 0) return;

      var box = control.getBoundingClientRect();
      var pointerValue = ((event.clientX - box.left) / box.width) * ceiling;

      var lo = parseFloat(e.min.value) || 0;
      var hi = parseFloat(e.max.value);
      if (isNaN(hi)) hi = ceiling;

      var nearer = Math.abs(pointerValue - lo) <= Math.abs(pointerValue - hi) ? e.min : e.max;

      e.min.classList.remove('is-active');
      e.max.classList.remove('is-active');
      nearer.classList.add('is-active');
    },
    true
  );