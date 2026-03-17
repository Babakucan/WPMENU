/**
 * Menü uygulaması — /api/menu ve /api/restaurant ile entegre.
 * Alpine.js menuApp() bileşeni.
 */
(function () {
  'use strict';

  var CART_STORAGE_PREFIX = 'wpmenu_cart_v1_';

  function normalizeProducts(categories) {
    if (!Array.isArray(categories)) return [];
    return categories.map(function (cat) {
      var products = (cat.products || []).map(function (p, pi) {
        var contents = (p.contents || '').trim();
        var ingredientIds = contents ? contents.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
        var extras = Array.isArray(p.extras) ? p.extras : [];
        var extraIds = extras.map(function (_, i) { return i; });
        return {
          id: p.id || 'p-' + pi,
          name: p.name || '',
          description: p.description || '',
          price: Number(p.price) || 0,
          image: (p.image || '').trim() || null,
          ingredientIds: ingredientIds,
          extraIds: extraIds,
          extras: extras,
          categoryId: cat.id,
          isActive: p.isActive !== false,
          outOfStock: !!p.outOfStock,
          stockNote: (p.stockNote || '').trim()
        };
      });
      return { id: cat.id, name: cat.name || '', products: products };
    });
  }

  function menuApp() {
    return {
      restaurant: { name: '', logo: '', tableNumber: '—', phone: '' },
      categories: [],
      loading: true,
      activeCategory: null,
      cart: [],
      addToCartBounce: false,
      modalOpen: false,
      modalProduct: null,
      modalRemoves: [],
      modalExtras: {},
      checkoutStep: 'cart',
      orderMode: 'in',
      orderModeSelected: false,
      customer: { name: '', phone: '', address: '', saveAddress: true },
      paymentMethod: 'kapida_nakit',
      channel: '',
      whatsappId: '',
      telegramId: '',
      savedAddresses: [],
      activeOrderAddId: '',
      reorderId: '',
      favoriteId: '',

      init: function () {
      var self = this;
      var startedAt = Date.now();
      try {
        var params = new URLSearchParams(window.location.search || '');
        self.channel = (params.get('channel') || '').trim();
        self.activeOrderAddId = (params.get('add') || '').trim();
        self.reorderId = (params.get('reorder') || '').trim();
        self.favoriteId = (params.get('fav') || '').trim();
        var uid = (params.get('userId') || params.get('wa') || '').trim();
        var tg = (params.get('tg') || '').trim();
        self.whatsappId = uid ? uid.replace(/\D/g, '') : '';
        self.telegramId = tg ? tg.replace(/\D/g, '') : '';
      } catch (e) {
        self.channel = '';
        self.whatsappId = '';
        self.telegramId = '';
      }
        Promise.all([
          fetch('/api/restaurant').then(function (r) { return r.json(); }),
          fetch('/api/menu').then(function (r) { return r.json(); })
        ]).then(function (results) {
          var rest = results[0] || {};
          var menu = results[1] || {};
          self.restaurant = {
            name: rest.name || 'Menü',
            logo: (rest.logo || '').trim() || null,
            tableNumber: rest.tableNumber != null ? String(rest.tableNumber) : '—',
            phone: (rest.phone || '').trim()
          };
          var rawCategories = (menu.categories && menu.categories.length) ? menu.categories : [];
          self.categories = normalizeProducts(rawCategories);
          if (self.categories.length && !self.activeCategory) self.activeCategory = self.categories[0].id;

          // Skeleton'ların en az 250ms görünmesi için
          var elapsed = Date.now() - startedAt;
          var MIN_SKELETON_MS = 250;
          var delay = Math.max(0, MIN_SKELETON_MS - elapsed);
          setTimeout(function () {
            self.loading = false;
          }, delay);

          // Kayıtlı adresleri yükle (varsa)
          var idQuery = '';
          if (self.whatsappId) idQuery = 'whatsappId=' + encodeURIComponent(self.whatsappId);
          else if (self.telegramId) idQuery = 'telegramId=' + encodeURIComponent(self.telegramId);
          if (idQuery) {
            fetch('/api/user/prefs?' + idQuery)
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (prefs) {
                if (!prefs) return;
                var addrs = Array.isArray(prefs.addresses) ? prefs.addresses : [];
                // "Masa", "Restoran", "Gel Al" gibi gel-al / masa notlarını adres listesinden gizle
                var filtered = addrs.filter(function (a) {
                  if (!a) return false;
                  var v = String(a).toLowerCase();
                  return !(v.startsWith('masa') || v.includes('restoran') || v.includes('gel al'));
                });
                self.savedAddresses = filtered;
                if (!self.customer.address && filtered.length) {
                  self.customer.address = filtered[filtered.length - 1];
                }
              })
              .catch(function () {});
          }

          self.restoreCart();
          if (self.favoriteId) self.loadFavoriteForReorder(self.favoriteId);
          else if (self.reorderId) self.loadOrderForReorder(self.reorderId);
        }).catch(function () {
          self.restaurant = { name: 'Menü', logo: null, tableNumber: '—', phone: '' };
          self.categories = [];
          self.loading = false;
        });
      },

      getStorageKey: function () {
        if (this.whatsappId) return CART_STORAGE_PREFIX + 'wa_' + this.whatsappId;
        if (this.telegramId) return CART_STORAGE_PREFIX + 'tg_' + this.telegramId;
        return CART_STORAGE_PREFIX + 'guest';
      },

      saveCartState: function () {
        try {
          var payload = {
            cart: this.toStructuredItems(),
            orderMode: this.orderMode,
            customer: this.customer
          };
          localStorage.setItem(this.getStorageKey(), JSON.stringify(payload));
        } catch (_) {}
      },

      restoreCart: function () {
        try {
          var raw = localStorage.getItem(this.getStorageKey());
          if (!raw) return;
          var parsed = JSON.parse(raw);
          this.cart = this.structuredToCart((parsed && parsed.cart) || []);
          if (parsed && parsed.orderMode) this.orderMode = parsed.orderMode;
          if (parsed && parsed.customer && typeof parsed.customer === 'object') {
            this.customer = {
              name: parsed.customer.name || '',
              phone: parsed.customer.phone || '',
              address: parsed.customer.address || '',
              saveAddress: parsed.customer.saveAddress !== false
            };
          }
        } catch (_) {}
      },

      clearCartState: function () {
        try { localStorage.removeItem(this.getStorageKey()); } catch (_) {}
      },

      setActiveCategory: function (id) {
        this.activeCategory = id;
        var el = document.getElementById('cat-' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },

      filteredProducts: function (catId) {
        var cat = this.categories.find(function (c) { return c.id === catId; });
        return cat ? cat.products : [];
      },

      getIngredientName: function (ingId) {
        return ingId || '';
      },

      getExtra: function (product, exId) {
        if (!product || !product.extras) return null;
        var i = parseInt(exId, 10);
        if (isNaN(i) || i < 0 || i >= product.extras.length) return null;
        var ex = product.extras[i];
        return ex ? { name: ex.name || '', price: Number(ex.price) || 0 } : null;
      },

      openModal: function (product) {
        this.modalProduct = product;
        this.modalRemoves = [];
        this.modalExtras = {};
        if (product && product.extraIds) product.extraIds.forEach(function (id) { this.modalExtras[id] = false; }.bind(this));
        this.modalOpen = true;
      },

      closeModal: function () {
        this.modalOpen = false;
        this.modalProduct = null;
        this.modalRemoves = [];
        this.modalExtras = {};
      },

      toggleRemove: function (ingId) {
        var i = this.modalRemoves.indexOf(ingId);
        if (i >= 0) this.modalRemoves.splice(i, 1);
        else this.modalRemoves.push(ingId);
      },

      addToCartQuick: function (product) {
        if (!product || !product.isActive || product.outOfStock) return;
        this.cart.push({
          product: product,
          qty: 1,
          removes: [],
          extras: []
        });
        this.saveCartState();
        this.addToCartBounce = true;
        var self = this;
        setTimeout(function () { self.addToCartBounce = false; }, 400);
      },

      addToCartFromModal: function () {
        var p = this.modalProduct;
        if (!p || !p.isActive || p.outOfStock) return;
        var extras = [];
        if (p.extraIds && p.extras) {
          p.extraIds.forEach(function (exId) {
            if (this.modalExtras[exId]) {
              var ex = this.getExtra(p, exId);
              if (ex) extras.push(ex);
            }
          }.bind(this));
        }
        this.cart.push({
          product: p,
          qty: 1,
          removes: this.modalRemoves.slice(),
          extras: extras
        });
        this.saveCartState();
        this.addToCartBounce = true;
        var self = this;
        setTimeout(function () { self.addToCartBounce = false; }, 400);
        this.closeModal();
      },

      cartCount: function () {
        return this.cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
      },

      changeQty: function (index, delta) {
        if (index < 0 || index >= this.cart.length || !delta) return;
        var item = this.cart[index];
        var next = (item.qty || 1) + delta;
        if (next <= 0) {
          this.cart.splice(index, 1);
        } else {
          item.qty = next;
        }
        this.saveCartState();
      },

      cartTotal: function () {
        return this.cart.reduce(function (s, i) {
          var base = (i.product.price || 0) * (i.qty || 1);
          var ext = (i.extras || []).reduce(function (e, x) { return e + (x.price || 0) * (i.qty || 1); }, 0);
          return s + base + ext;
        }, 0);
      },

      startCheckout: function () {
        this.orderModeSelected = false;
        this.checkoutStep = 'mode';
      },

      setOrderMode: function (mode) {
        this.orderMode = mode;
        this.orderModeSelected = true;
        if (mode === 'in') this.checkoutStep = 'summary';
        else this.checkoutStep = 'form';
        this.saveCartState();
      },

      submitCustomerForm: function () {
        this.checkoutStep = 'summary';
        this.saveCartState();
      },

      backToCart: function () {
        this.checkoutStep = 'cart';
        this.orderModeSelected = false;
      },

      backToMode: function () {
        this.checkoutStep = 'mode';
      },

      openCartView: function () {
        this.checkoutStep = 'sepet';
      },
      openCartSummary: function () {
        this.checkoutStep = 'summary';
      },

      selectSavedAddress: function (addr) {
        this.customer.address = addr || '';
        this.saveCartState();
      },

      deleteSavedAddress: function (addr) {
        if (!addr) return;
        var updated = this.savedAddresses.filter(function (a) { return a !== addr; });
        this.savedAddresses = updated;
        if (this.customer.address === addr) {
          this.customer.address = updated.length ? updated[updated.length - 1] : '';
        }
        var payload = { addresses: updated };
        if (this.whatsappId) payload.whatsappId = String(this.whatsappId);
        else if (this.telegramId) payload.telegramId = String(this.telegramId);
        else return;
        fetch('/api/user/prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function () {});
      },

      toStructuredItems: function () {
        return this.cart.map(function (item) {
          return {
            productId: item.product && item.product.id ? String(item.product.id) : '',
            qty: Math.max(1, Number(item.qty) || 1),
            removes: Array.isArray(item.removes) ? item.removes.slice() : [],
            extras: Array.isArray(item.extras) ? item.extras.map(function (ex) {
              return { name: ex.name || '', price: Number(ex.price) || 0 };
            }) : []
          };
        }).filter(function (item) { return item.productId; });
      },

      structuredToCart: function (itemsStructured) {
        if (!Array.isArray(itemsStructured) || !itemsStructured.length) return [];
        var allProducts = [];
        this.categories.forEach(function (cat) {
          (cat.products || []).forEach(function (p) { allProducts.push(p); });
        });
        var byId = {};
        allProducts.forEach(function (p) { byId[String(p.id)] = p; });
        var out = [];
        itemsStructured.forEach(function (s) {
          var p = byId[String((s && s.productId) || '')];
          if (!p) return;
          out.push({
            product: p,
            qty: Math.max(1, Number((s && s.qty) || 1) || 1),
            removes: Array.isArray(s && s.removes) ? s.removes.map(function (x) { return String(x || ''); }) : [],
            extras: Array.isArray(s && s.extras) ? s.extras.map(function (x) {
              return { name: String((x && x.name) || ''), price: Number((x && x.price) || 0) || 0 };
            }) : []
          });
        });
        return out;
      },

      loadOrderForReorder: function (orderId) {
        var self = this;
        var id = parseInt(orderId, 10);
        if (!id) return;
        var q = self.whatsappId ? ('whatsappId=' + encodeURIComponent(self.whatsappId)) : (self.telegramId ? ('telegramId=' + encodeURIComponent(self.telegramId)) : '');
        if (!q) return;
        fetch('/api/orders/' + id + '/reorder-data?' + q)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.ok) return;
            var cart = self.structuredToCart(d.itemsStructured || []);
            if (cart.length) {
              self.cart = cart;
              self.saveCartState();
            }
          }).catch(function () {});
      },

      loadFavoriteForReorder: function (favId) {
        var self = this;
        var id = parseInt(favId, 10);
        if (!id) return;
        var q = self.whatsappId ? ('whatsappId=' + encodeURIComponent(self.whatsappId)) : (self.telegramId ? ('telegramId=' + encodeURIComponent(self.telegramId)) : '');
        if (!q) return;
        fetch('/api/favorites/' + id + '/reorder-data?' + q)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.ok) return;
            var cart = self.structuredToCart(d.itemsStructured || []);
            if (cart.length) {
              self.cart = cart;
              self.saveCartState();
            }
          }).catch(function () {});
      },

      sendWhatsApp: function () {
      var lines = ['*Yeni sipariş*', ''];
      if (this.orderMode === 'in') {
        lines.push('Teslimat: Restorandan Al (Gel Al)');
      } else {
        lines.push('Ad: ' + (this.customer.name || '—'));
        lines.push('Telefon: ' + (this.customer.phone || '—'));
        lines.push('Adres: ' + (this.customer.address || '—'));
      }
      lines.push('');
      var itemsSummary = [];
      this.cart.forEach(function (item) {
        var name = (item.qty || 1) + 'x ' + (item.product.name || '');
        if (item.removes && item.removes.length) name += ' (- ' + item.removes.join(', ') + ')';
        if (item.extras && item.extras.length) name += ' (+ ' + item.extras.map(function (e) { return e.name; }).join(', ') + ')';
        var price = (item.product.price || 0) * (item.qty || 1) + (item.extras || []).reduce(function (s, e) { return s + (e.price || 0) * (item.qty || 1); }, 0);
        lines.push(name + ' — ' + price + '₺');
        itemsSummary.push(name + ' — ' + price + '₺');
      });
      lines.push('');
      lines.push('*Toplam: ' + this.cartTotal() + '₺*');

      // Bot kimliği varsa siparişi doğrudan API'ye ilet
      if (this.whatsappId || this.telegramId) {
        var payload = {
          whatsappId: this.whatsappId ? String(this.whatsappId) : null,
          telegramId: this.telegramId ? String(this.telegramId) : null,
          items: itemsSummary.join(', '),
          itemsStructured: this.toStructuredItems(),
          total: this.cartTotal(),
          address: this.orderMode === 'in' ? '' : (this.customer.address || ''),
          notes: '',
          orderType: this.orderMode === 'in' ? 'gel_al' : 'paket',
          paymentMethod: this.paymentMethod || 'kapida_nakit',
          saveAddress: this.orderMode !== 'in' && this.customer.saveAddress !== false
        };
        var self = this;
        var addId = parseInt(this.activeOrderAddId || '', 10);
        var url = addId ? ('/api/orders/' + addId + '/add') : '/api/order';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (res && res.ok) {
            alert(addId ? 'Ürünler aktif siparişe eklendi.' : 'Siparişiniz alındı. Onay mesajı gönderilecek.');
            self.cart = [];
            self.checkoutStep = 'cart';
            self.clearCartState();
          } else {
            alert('Sipariş gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
          }
        }).catch(function () {
          alert('Sipariş gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
        });
        return;
      }

      // Diğer durumlarda, klasik wa.me linki ile devam et
      var text = encodeURIComponent(lines.join('\n'));
      var phone = (this.restaurant.phone || '').replace(/\D/g, '');
      if (!phone) phone = '905550000000';
      if (phone.length === 10 && phone[0] === '5') phone = '90' + phone;
      if (phone.length > 0 && phone[0] !== '9') phone = '90' + phone;
      window.open('https://wa.me/' + phone + '?text=' + text, '_blank');
      }
    };
  }

  window.menuApp = menuApp;
})();
