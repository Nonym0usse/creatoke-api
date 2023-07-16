const Joi = require("joi");

const connectionSchema = Joi.object({
    title: Joi.string().required(),
    image: Joi.string().required(),
    url: Joi.string(),
    description: Joi.string().required(),
    lyrics: Joi.string(),
    spotifyUrl: Joi.string(),
    creatoke: Joi.string(),
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
    price: Joi.number().required(),
    youtubeUrl: Joi.string(),
    category: Joi.string().required(),
    created_at: Joi.date().default(Date.now).required(),
    author: Joi.string().required(),
    category_id: Joi.string().required()
});

module.exports = connectionSchema;