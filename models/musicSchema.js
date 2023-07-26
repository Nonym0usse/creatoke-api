const Joi = require("joi");

const connectionSchema = Joi.object({
    title: Joi.string().required(),
    image: Joi.string().required(),
    description: Joi.string().required(),
    lyrics: Joi.string(),
    spotifyURL: Joi.string(),
    full_creatoke: Joi.string().when('category', [
        {
            is: 'chanson',
            then: Joi.string().required(),
            otherwise: Joi.string().optional()
        }
    ]),
    extract_music: Joi.string().when('category', {
        is: 'chanson',
        then: Joi.string().required(),
        otherwise: Joi.string().optional()
    }),
    full_music: Joi.string().when('category', [
        {
            is: 'chanson',
            then: Joi.string().required(),
        },
        {
            is: 'instrumentaux',
            then: Joi.string().required(),
        },
        {
            is: 'youtubeurs',
            then: Joi.string().required(),
        },
    ]),
    price_base: Joi.number(),
    price_base_plus: Joi.number(),
    price_pro: Joi.number(),
    youtubeURL: Joi.string(),
    category: Joi.string().required(),
    created_at: Joi.string(),
    artist: Joi.string().required(),
});

module.exports = connectionSchema;
