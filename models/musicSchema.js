const Joi = require("joi");

const connectionSchema = Joi.object({
    title: Joi.string().required(),
    image: Joi.string().required(),
    description: Joi.string().required(),
    lyrics: Joi.string(),
    spotifyURL: Joi.string(),
    url: Joi.required(),
    full_music: Joi.required(),
    wav: Joi.required(),
    price_base: Joi.number(),
    price_premium: Joi.number(),
    youtubeURL: Joi.string(),
    category: Joi.string().required(),
    created_at: Joi.string(),
    artist: Joi.string().required(),
});

module.exports = connectionSchema;
