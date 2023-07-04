const validator = require("validator");
class MusicModel {

    constructor(
        {
            title,
            description_fr,
            description_en,
            price,
            lyrics_fr,
            author,
            full_creatoke,
            isOnline,
            isHighLighted,
            music_extract,
            full_music,
            youtube_url,
            picture,
            spotify
        }) {
        this.title = title;
        this.description_fr = description_fr;
        this.description_en = description_en
        this.price = price;
        this.lyrics_fr = lyrics_fr;
        this.author = author;
        this.full_creatoke = full_creatoke;
        this.isOnline = isOnline;
        this.isHighLighted = isHighLighted;
        this.music_extract = music_extract;
        this.full_music = full_music;
        this.youtube_url = youtube_url;
        this.picture = picture;
        this.spotify = spotify;
    }

    validate() {
        const errors = {};


        if (!this.title || !validator.isLength(this.title, { min: 1, max: 255 })) {
            errors.title = 'Title must be between 1 and 255 characters long';
        }

        if (!this.description_fr || !validator.isLength(this.description_fr, { min: 1, max: 2048 })) {
            errors.description_fr = 'Description must be between 1 and 2048 characters long';
        }

        if (!this.description_en || !validator.isLength(this.description_en, { min: 1, max: 2048 })) {
            errors.description_en = 'English description must be between 1 and 2048 characters long';
        }

        if (!this.price || !validator.isFloat(this.price)) {
            errors.price = 'Price must be float number';
        }

        if (!this.lyrics_fr || !validator.isLength(this.lyrics_fr, { min: 1})) {
            errors.lyrics_fr = 'Lyrics must be min 1 characters long';
        }

        if (!this.author || !validator.isLength(this.author, { min: 1 })) {
            errors.author = 'Duration must be a number greater than 0';
        }

        if (!this.full_creatoke || !validator.isLength(this.full_creatoke, { min: 1 })) {
            errors.full_creatoke = 'Full creatoke must be a number greater than 0';
        }

        if (!this.isOnline || !validator.isBoolean(this.isOnline)) {
            errors.isOnline = 'IsOnline must be a boolean';
        }

        if (!this.isHighLighted || !validator.isBoolean(this.isHighLighted)) {
            errors.isHighLighted = 'IsHighlighted must be a boolean';
        }

        if (!this.music_extract || !validator.isLength(this.music_extract, { min: 1 })) {
            errors.music_extract = 'Music extract must be a number greater than 0';
        }

        if (!this.full_music || !validator.isLength(this.full_music, { min: 1 })) {
            errors.full_music = 'full_music must be a number greater than 0';
        }

        if (!this.youtube_url || !validator.isLength(this.youtube_url, { min: 1 })) {
            errors.youtube_url = 'youtube_url must be a number greater than 0';
        }

        if (!this.picture || !validator.isLength(this.picture, { min: 1 })) {
            errors.picture = 'Duration must be a number greater than 0';
        }

        if (!this.spotify || !validator.isLength(this.spotify, { min: 1 })) {
            errors.spotify = 'Duration must be a number greater than 0';
        }

        return Object.keys(errors).length > 0 ? errors : null;
    }
}

module.exports = { MusicModel };
