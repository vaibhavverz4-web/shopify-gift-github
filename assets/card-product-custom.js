/*
 * Product card actions — add to cart, quick view
 *
 * Powers the icons added to snippets/card-product.liquid, so they work in every
 * section that renders that card: featured collection, related products,
 * collage, search, collection grid, sliders.
 *
 * Everything is delegated off `document`, so cards added later by a slider,
 * section render or AJAX filtering work with no re-initialisation.
 *
 * Wishlist is not handled here — the iWish app binds to its own .iWishAddColl
 * link, which snippets/wishlist-app-links.liquid renders inside the card.
 */

(function () {
  'use strict';

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /* ------------------------------------------------------------------ cart */

  /**
   * Adds to cart through the theme's own cart component, so the drawer or
   * notification opens exactly as it does from a product page.
   */
  function addToCart(variantId, quantity) {
    var cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
    var formData = new FormData();

    formData.append('id', variantId);
    formData.append('quantity', quantity || 1);

    if (cart && typeof cart.getSectionsToRender === 'function') {
      formData.append(
        'sections',
        cart.getSectionsToRender().map(function (section) {
          return section.id;
        })
      );
      formData.append('sections_url', window.location.pathname);
      if (typeof cart.setActiveElement === 'function') cart.setActiveElement(document.activeElement);
    }

    return fetch(window.routes.cart_add_url + '.js', {
      method: 'POST',
      headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (parsed) {
        if (parsed.status) throw new Error(parsed.description || parsed.message);

        if (cart && typeof cart.renderContents === 'function') {
          cart.renderContents(parsed);

          // The drawer marks itself empty with `is-empty` on the <cart-drawer>
          // element (snippets/cart-drawer.liquid), but cart-drawer.js looks for
          // that class on .drawer__inner and so never removes it. Left in place
          // it collapses the item list on the first add to an empty cart.
          cart.classList.remove('is-empty');
          var drawerItems = cart.querySelector('cart-drawer-items');
          if (drawerItems) drawerItems.classList.remove('is-empty');
        } else {
          window.location.href = window.routes.cart_url;
        }

        if (window.publish && window.PUB_SUB_EVENTS) {
          window.publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'card-product' });
        }

        return parsed;
      });
  }

  /* ------------------------------------------------------------ quick view */

  var quickView = {
    lastFocused: null,

    open: function (productUrl) {
      var modal = $('[data-quick-view-modal]');
      if (!modal || !productUrl) return;

      this.lastFocused = document.activeElement;

      var body = $('[data-quick-view-body]', modal);
      body.innerHTML =
        '<div class="quick-view__loading"><div class="loading-overlay__spinner">' +
        '<svg aria-hidden="true" focusable="false" class="spinner" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">' +
        '<circle class="path" fill="none" stroke-width="6" cx="33" cy="33" r="30"></circle></svg></div></div>';

      modal.removeAttribute('hidden');
      document.body.classList.add('overflow-hidden');
      $('.quick-view__dialog', modal).focus();

      fetch(productUrl.split('?')[0] + '?section_id=quick-view')
        .then(function (response) {
          if (!response.ok) throw new Error('Quick view request failed');
          return response.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var content = doc.querySelector('[data-quick-view-content]');
          body.innerHTML = content ? content.outerHTML : '';
        })
        .catch(function (error) {
          console.error(error);
          window.location.href = productUrl;
        });
    },

    close: function () {
      var modal = $('[data-quick-view-modal]');
      if (!modal || modal.hasAttribute('hidden')) return;

      modal.setAttribute('hidden', '');
      document.body.classList.remove('overflow-hidden');
      if (this.lastFocused) this.lastFocused.focus();
    }
  };

  /** Matches the chosen options to a variant and updates the modal. */
  function updateVariant(scope) {
    if (!scope) return;

    var dataEl = $('[data-quick-view-variants]', scope);
    if (!dataEl) return;

    var variants;
    try {
      variants = JSON.parse(dataEl.textContent);
    } catch (error) {
      return;
    }

    var chosen = $$('[data-quick-view-option]', scope)
      .filter(function (input) {
        return input.type !== 'radio' || input.checked;
      })
      .map(function (input) {
        return input.value;
      });

    var match = variants.find(function (variant) {
      return chosen.every(function (value, index) {
        return variant.options[index] === value;
      });
    });

    var idInput = $('[data-quick-view-variant-id]', scope);
    var submit = $('[data-quick-view-submit]', scope);
    var submitText = $('[data-quick-view-submit-text]', scope);
    var priceEl = $('[data-quick-view-price]', scope);
    var notify = $('[data-quick-view-notify]', scope);
    var image = $('[data-quick-view-image]', scope);

    if (!match) {
      if (submit) submit.disabled = true;
      if (submitText) submitText.textContent = window.variantStrings.unavailable;
      return;
    }

    if (idInput) idInput.value = match.id;
    if (submit) submit.disabled = !match.available;
    if (submitText) {
      submitText.textContent = match.available
        ? window.variantStrings.addToCart
        : window.variantStrings.soldOut;
    }
    if (notify) notify.hidden = match.available;
    if (priceEl && match.price != null) priceEl.textContent = formatMoney(match.price);
    if (image && match.featured_image && match.featured_image.src) {
      image.src = match.featured_image.src;
      image.removeAttribute('srcset');
    }

    $$('.quick-view__swatch', scope).forEach(function (label) {
      var input = label.querySelector('input');
      label.classList.toggle('is-active', !!(input && input.checked));
    });
  }

  function formatMoney(cents) {
    var format = (window.Shopify && window.Shopify.money_format) || '${{amount}}';
    var value = (cents / 100).toFixed(2);

    if (format.indexOf('amount_no_decimals') > -1) value = Math.round(cents / 100).toString();

    return format.replace(/\{\{\s*\w+\s*\}\}/, value);
  }

  /* ---------------------------------------------------------------- events */

  document.addEventListener('click', function (event) {
    var target = event.target;

    var addButton = target.closest('[data-shop-add-to-cart]');
    if (addButton) {
      event.preventDefault();
      addButton.classList.add('is-busy');
      addToCart(addButton.dataset.variantId, 1)
        .catch(function (error) {
          console.error(error);
          window.location.href = addButton.closest('.card-wrapper').querySelector('a[href]').href;
        })
        .finally(function () {
          addButton.classList.remove('is-busy');
        });
      return;
    }

    var quickViewButton = target.closest('[data-shop-quick-view]');
    if (quickViewButton) {
      event.preventDefault();
      quickView.open(quickViewButton.dataset.productUrl);
      return;
    }

    if (target.closest('[data-quick-view-close]')) {
      quickView.close();
      return;
    }

    var thumb = target.closest('[data-quick-view-thumb]');
    if (thumb) {
      var scope = thumb.closest('[data-quick-view-content]');
      var mainImage = $('[data-quick-view-image]', scope);
      if (mainImage) {
        mainImage.src = thumb.dataset.full;
        mainImage.removeAttribute('srcset');
      }
      $$('[data-quick-view-thumb]', scope).forEach(function (el) {
        el.classList.toggle('is-active', el === thumb);
      });
      return;
    }

    var stepper = target.closest('[data-quantity-change]');
    if (stepper) {
      var input = $('input[name="quantity"]', stepper.parentElement);
      if (input) {
        var next = parseInt(input.value, 10) + parseInt(stepper.dataset.quantityChange, 10);
        input.value = Math.max(1, isNaN(next) ? 1 : next);
      }
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target.hasAttribute('data-quick-view-option')) {
      updateVariant(event.target.closest('[data-quick-view-content]'));
    }
  });

  document.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-quick-view-form]');
    if (!form) return;

    event.preventDefault();

    var submit = $('[data-quick-view-submit]', form);
    var errorEl = $('[data-quick-view-error]', form);
    var variantId = $('[data-quick-view-variant-id]', form).value;
    var quantity = parseInt($('input[name="quantity"]', form).value, 10) || 1;

    if (errorEl) errorEl.hidden = true;
    if (submit) submit.classList.add('loading');

    addToCart(variantId, quantity)
      .then(function () {
        quickView.close();
      })
      .catch(function (error) {
        if (errorEl) {
          errorEl.textContent = error.message || window.cartStrings.error;
          errorEl.hidden = false;
        }
      })
      .finally(function () {
        if (submit) submit.classList.remove('loading');
      });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') quickView.close();
  });

  window.CardProductActions = { addToCart: addToCart, quickView: quickView };
})();
