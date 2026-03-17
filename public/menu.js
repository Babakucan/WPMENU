/**
 * Menü uygulaması — /api/menu ve /api/restaurant ile entegre.
 * Alpine.js menuApp() bileşeni.
 */
(function () {
  'use strict';

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
          categoryId: cat.id
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

      init: function () {
      var self = this;
      var startedAt = Date.now();
      try {
        var params = new URLSearchParams(window.location.search || '');
        self.channel = (params.get('channel') || '').trim();
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
        }).catch(function () {
          self.restaurant = { name: 'Menü', logo: null, tableNumber: '—', phone: '' };
          self.categories = [];
          self.loading = false;
        });
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
        this.cart.push({
          product: product,
          qty: 1,
          removes: [],
          extras: []
        });
        this.addToCartBounce = true;
        var self = this;
        setTimeout(function () { self.addToCartBounce = false; }, 400);
      },

      addToCartFromModal: function () {
        var p = this.modalProduct;
        if (!p) return;
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
      },

      submitCustomerForm: function () {
        this.checkoutStep = 'summary';
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

      // Eğer WhatsApp botundan gelen bir kullanıcıysak, siparişi doğrudan sunucuya ilet
      if (this.channel === 'whatsapp' && this.whatsappId) {
        var payload = {
          whatsappId: String(this.whatsappId),
          telegramId: null,
          items: itemsSummary.join(', '),
          total: this.cartTotal(),
          address: this.orderMode === 'in' ? '' : (this.customer.address || ''),
          notes: '',
          orderType: this.orderMode === 'in' ? 'gel_al' : 'paket',
          paymentMethod: this.paymentMethod || 'kapida_nakit',
          saveAddress: this.orderMode !== 'in' && this.customer.saveAddress !== false
        };
        var self = this;
        fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (res && res.ok) {
            alert('Siparişiniz alındı. WhatsApp üzerinden onay gönderilecek.');
            self.cart = [];
            self.checkoutStep = 'cart';
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
