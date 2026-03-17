const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isOpen, validateCoupon } = require('../lib/restaurant');

describe('restaurant lib', () => {
  describe('isOpen', () => {
    it('returns true when no hours set', () => {
      assert.strictEqual(isOpen({}), true);
      assert.strictEqual(isOpen({ hoursOpen: '', hoursClose: '' }), true);
    });

    it('returns true when current time is within range', () => {
      const now = new Date();
      const h = now.getHours();
      const open = `${String(Math.max(0, h - 1)).padStart(2, '0')}:00`;
      const close = `${String((h + 2) % 24).padStart(2, '0')}:00`;
      assert.strictEqual(isOpen({ hoursOpen: open, hoursClose: close }), true);
    });

    it('returns false when current time is outside range', () => {
      assert.strictEqual(isOpen({ hoursOpen: '00:00', hoursClose: '01:00' }), false);
    });

    it('uses weeklyHours when provided', () => {
      const now = new Date();
      const day = String(now.getDay());
      const h = now.getHours();
      const open = `${String(Math.max(0, h - 1)).padStart(2, '0')}:00`;
      const close = `${String((h + 2) % 24).padStart(2, '0')}:00`;
      assert.strictEqual(isOpen({ weeklyHours: { [day]: { enabled: true, open, close } } }), true);
    });

    it('specialDays closed overrides normal hours', () => {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      assert.strictEqual(isOpen({
        hoursOpen: '00:00',
        hoursClose: '23:59',
        specialDays: [{ date, closed: true }]
      }), false);
    });
  });

  describe('validateCoupon', () => {
    const restWithCoupons = {
      coupons: [
        { code: 'HOSGELDIN', discount: 10, type: 'percent' },
        { code: '20TL', discount: 20, type: 'fixed' }
      ]
    };
    const getRest = () => restWithCoupons;

    it('returns null for unknown code', () => {
      assert.strictEqual(validateCoupon('UNKNOWN', 100, getRest), null);
    });

    it('applies percent discount', () => {
      const r = validateCoupon('HOSGELDIN', 100, getRest);
      assert.ok(r);
      assert.strictEqual(r.discount, 10);
      assert.strictEqual(r.code, 'HOSGELDIN');
    });

    it('applies fixed discount', () => {
      const r = validateCoupon('20TL', 100, getRest);
      assert.ok(r);
      assert.strictEqual(r.discount, 20);
    });

    it('caps fixed discount at subtotal', () => {
      const r = validateCoupon('20TL', 15, getRest);
      assert.ok(r);
      assert.strictEqual(r.discount, 15);
    });
  });
});
