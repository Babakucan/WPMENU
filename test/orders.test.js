const { describe, it } = require('node:test');
const assert = require('node:assert');
const { orderUserMatch, prefsKey } = require('../lib/orders');

describe('orders lib', () => {
  describe('orderUserMatch', () => {
    it('matches by telegramId', () => {
      assert.strictEqual(orderUserMatch({ telegramId: '123' }, '123', null), true);
      assert.strictEqual(orderUserMatch({ telegramId: '123' }, '456', null), false);
    });
    it('matches by whatsappId', () => {
      assert.strictEqual(orderUserMatch({ whatsappId: 'wa1' }, null, 'wa1'), true);
      assert.strictEqual(orderUserMatch({ whatsappId: 'wa1' }, null, 'wa2'), false);
    });
    it('returns false when no match', () => {
      assert.strictEqual(orderUserMatch({ telegramId: '1' }, '2', '3'), false);
    });
  });

  describe('prefsKey', () => {
    it('returns wa_ prefix for whatsappId', () => {
      assert.strictEqual(prefsKey(null, '123'), 'wa_123');
    });
    it('returns telegramId string when no whatsapp', () => {
      assert.strictEqual(prefsKey('456', null), '456');
    });
    it('returns null when both missing', () => {
      assert.strictEqual(prefsKey(null, null), null);
    });
  });
});
