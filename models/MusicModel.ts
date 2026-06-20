import validator from "validator";

export interface MusicInput {
  title?: string;
  description_fr?: string;
  description_en?: string;
  price?: string;
  lyrics_fr?: string;
  author?: string;
  full_creatoke?: string;
  isOnline?: string;
  isHighLighted?: string;
  music_extract?: string;
  full_music?: string;
  youtube_url?: string;
  picture?: string;
  spotify?: string;
}

export type ValidationErrors = Partial<Record<keyof MusicInput, string>>;

export class MusicModel {
  title?: string;
  description_fr?: string;
  description_en?: string;
  price?: string;
  lyrics_fr?: string;
  author?: string;
  full_creatoke?: string;
  isOnline?: string;
  isHighLighted?: string;
  music_extract?: string;
  full_music?: string;
  youtube_url?: string;
  picture?: string;
  spotify?: string;

  constructor(input: MusicInput) {
    this.title = input.title;
    this.description_fr = input.description_fr;
    this.description_en = input.description_en;
    this.price = input.price;
    this.lyrics_fr = input.lyrics_fr;
    this.author = input.author;
    this.full_creatoke = input.full_creatoke;
    this.isOnline = input.isOnline;
    this.isHighLighted = input.isHighLighted;
    this.music_extract = input.music_extract;
    this.full_music = input.full_music;
    this.youtube_url = input.youtube_url;
    this.picture = input.picture;
    this.spotify = input.spotify;
  }

  validate(): ValidationErrors | null {
    const errors: ValidationErrors = {};

    if (!this.title || !validator.isLength(this.title, { min: 1, max: 255 })) {
      errors.title = "Title must be between 1 and 255 characters long";
    }

    if (!this.description_fr || !validator.isLength(this.description_fr, { min: 1, max: 2048 })) {
      errors.description_fr = "Description must be between 1 and 2048 characters long";
    }

    if (!this.description_en || !validator.isLength(this.description_en, { min: 1, max: 2048 })) {
      errors.description_en = "English description must be between 1 and 2048 characters long";
    }

    if (!this.price || !validator.isFloat(this.price)) {
      errors.price = "Price must be float number";
    }

    if (!this.lyrics_fr || !validator.isLength(this.lyrics_fr, { min: 1 })) {
      errors.lyrics_fr = "Lyrics must be min 1 characters long";
    }

    if (!this.author || !validator.isLength(this.author, { min: 1 })) {
      errors.author = "Author must be at least 1 character long";
    }

    if (!this.full_creatoke || !validator.isLength(this.full_creatoke, { min: 1 })) {
      errors.full_creatoke = "Full creatoke must be at least 1 character long";
    }

    if (!this.isOnline || !validator.isBoolean(this.isOnline)) {
      errors.isOnline = "IsOnline must be a boolean";
    }

    if (!this.isHighLighted || !validator.isBoolean(this.isHighLighted)) {
      errors.isHighLighted = "IsHighlighted must be a boolean";
    }

    if (!this.music_extract || !validator.isLength(this.music_extract, { min: 1 })) {
      errors.music_extract = "Music extract must be at least 1 character long";
    }

    if (!this.full_music || !validator.isLength(this.full_music, { min: 1 })) {
      errors.full_music = "full_music must be at least 1 character long";
    }

    if (!this.youtube_url || !validator.isLength(this.youtube_url, { min: 1 })) {
      errors.youtube_url = "youtube_url must be at least 1 character long";
    }

    if (!this.picture || !validator.isLength(this.picture, { min: 1 })) {
      errors.picture = "Picture must be at least 1 character long";
    }

    if (!this.spotify || !validator.isLength(this.spotify, { min: 1 })) {
      errors.spotify = "Spotify must be at least 1 character long";
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }
}
