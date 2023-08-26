const Joi = require("joi");
const connectionSchema = Joi.object({
    title: Joi.string().required(),
    image: Joi.string().required(),
    description: Joi.string().required(),
    lyrics: Joi.string(),
    spotifyURL: Joi.string(),
    url: Joi.required(),
    creatoke_wav: Joi.optional(),
    chanson_wav: Joi.required(),
    creatoke: Joi.optional(),
    price_base_creatoke: Joi.optional(),
    price_premium_creatoke: Joi.optional(),
    price_base_chanson: Joi.number().optional(),
    price_premium_chanson: Joi.number().optional(),
    youtubeURL: Joi.string().optional(),
    category: Joi.string().required(),
    subcategory: Joi.string().required(),
    created_at: Joi.string(),
    artist: Joi.string().required(),
});

module.exports = connectionSchema;
