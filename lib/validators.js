const Joi = require('joi');

const campaignSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  orderThreshold: Joi.number().optional(),
  rewardType: Joi.string().valid('percent', 'fixed').optional(),
  rewardValue: Joi.number().optional(),
  description: Joi.string().allow('').optional(),
  pointsPerLira: Joi.number().optional(),
  redeemPoints: Joi.number().optional(),
  redeemValue: Joi.number().optional(),
  spendThreshold: Joi.number().optional(),
  discountPercent: Joi.number().optional()
}).unknown(true);

const couponSchema = Joi.object({
  code: Joi.string().required(),
  discount: Joi.number().min(0).required(),
  type: Joi.string().valid('percent', 'fixed').required(),
  description: Joi.string().allow('').optional()
});

const restaurantSchema = Joi.object({
  name: Joi.string().allow('').optional(),
  logo: Joi.string().allow('').optional(),
  banner: Joi.string().allow('').optional(),
  bannerObjectFit: Joi.string().valid('cover', 'contain', 'fill').allow('').optional(),
  bannerObjectPosition: Joi.string().allow('').optional(),
  address: Joi.string().allow('').optional(),
  phone: Joi.string().allow('').optional(),
  hours: Joi.string().allow('').optional(),
  hoursOpen: Joi.string().allow('').optional(),
  hoursClose: Joi.string().allow('').optional(),
  minOrderAmount: Joi.number().min(0).optional(),
  estimatedMinutes: Joi.number().min(0).optional(),
  estimatedMinutesGelAl: Joi.number().min(0).optional(),
  estimatedMinutesPaket: Joi.number().min(0).optional(),
  isOpen: Joi.boolean().optional(),
  campaigns: Joi.object({
    orderCount: campaignSchema.optional(),
    points: campaignSchema.optional(),
    totalSpent: campaignSchema.optional(),
    firstOrder: campaignSchema.optional()
  }).optional(),
  coupons: Joi.array().items(couponSchema).optional()
}).unknown(true);

const extraSchema = Joi.object({
  name: Joi.string().required(),
  price: Joi.number().min(0).required()
});

const productSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  price: Joi.number().min(0).required(),
  image: Joi.string().allow('').optional(),
  contents: Joi.string().allow('').optional(),
  description: Joi.string().allow('').optional(),
  extras: Joi.array().items(extraSchema).optional(),
  restaurantOnly: Joi.boolean().optional()
});

const categorySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  icon: Joi.string().allow('').optional(),
  products: Joi.array().items(productSchema).required()
});

const menuSchema = Joi.object({
  restaurant: Joi.object({
    name: Joi.string().allow('').optional(),
    logo: Joi.string().allow('').optional()
  }).optional(),
  categories: Joi.array().items(categorySchema).required()
});

function validateRestaurant(body) {
  const { error, value } = restaurantSchema.validate(body, { stripUnknown: true });
  return { error: error ? error.details.map(d => d.message).join('; ') : null, value };
}

function validateMenu(body) {
  const { error, value } = menuSchema.validate(body, { stripUnknown: true });
  return { error: error ? error.details.map(d => d.message).join('; ') : null, value };
}

module.exports = { validateRestaurant, validateMenu };
