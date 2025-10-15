const axios = require('axios');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();

class Instagram {
  constructor({
    accessToken = process.env.FB_ACCESS_TOKEN,
    igUserId = process.env.IG_USER_ID,
    graphVersion = 'v23.0',
    requestTimeoutMs = 30_000,
    // limites par défaut
    poll: {
      minIntervalMs = 3000,
      maxIntervalMs = 15000,
      maxAttempts = 120,          // ~ 3–30 min selon backoff
      totalTimeoutMs = 10 * 60 * 1000, // 10 min max
    } = {},
  } = {}) {
    this.accessToken = accessToken;
    this.igUserId = igUserId;
    this.graph = `https://graph.facebook.com/${graphVersion}`;
    this.graphVideo = `https://graph-video.facebook.com/${graphVersion}`;
    this.http = axios.create({ timeout: requestTimeoutMs });

    this.pollCfg = { minIntervalMs, maxIntervalMs, maxAttempts, totalTimeoutMs };
  }

  // --- helpers --------------------------------------------------------------

  _isRetryableStatus(status) {
    // 5xx, 429 Too Many Requests
    return (status >= 500) || status === 429;
  }

  _isRetryableFacebookCode(code, subcode) {
    // Meta throttling : 613, 4 (application request limit reached), etc.
    return code === 613 || code === 4;
  }

  _jittered(nextMs) {
    // random 80-120% pour éviter le thundering herd
    const jitter = 0.8 + Math.random() * 0.4;
    return Math.max(1000, Math.floor(nextMs * jitter));
  }

  async _requestWithRetry(fn, { tries = 4, baseDelayMs = 1000 } = {}) {
    let attempt = 0, delay = baseDelayMs, lastErr;
    while (attempt < tries) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const status = err?.response?.status;
        const code = err?.response?.data?.error?.code;
        const sub = err?.response?.data?.error?.error_subcode;

        if (!this._isRetryableStatus(status) && !this._isRetryableFacebookCode(code, sub)) {
          throw err; // non-retryable
        }

        // backoff + jitter
        await sleep(this._jittered(delay));
        delay = Math.min(delay * 2, 8000);
        attempt += 1;
      }
    }
    throw lastErr;
  }

  // --- API ------------------------------------------------------------------

  // 1) Création du container
  async createReelContainer({ description, videoUrl }) {
    if (!description || !videoUrl) throw new Error('description et videoUrl sont requis');

    const doCall = () => this.http.post(
      `${this.graphVideo}/${this.igUserId}/media`,
      null,
      {
        params: {
          caption: description,
          media_type: 'REELS',
          video_url: videoUrl,
          access_token: this.accessToken,
        },
      }
    );

    try {
      const { data } = await this._requestWithRetry(doCall, { tries: 3, baseDelayMs: 1200 });
      if (!data?.id) {
        const e = new Error('Container creation returned no id');
        e.status = 502; throw e;
      }
      return data.id; // container_id
    } catch (error) {
      const payload = error?.response?.data;
      console.error('IG /media error:', {
        status: error?.response?.status,
        data: payload,
      });
      const e = new Error(payload?.error?.message || error.message || 'Failed to create IG container');
      e.status = error?.response?.status || 500;
      e.code = payload?.error?.code;
      e.subcode = payload?.error?.error_subcode;
      throw e;
    }
  }

  // 2) Poll du status jusqu'à FINISHED
  /**
   * @param {object} p
   * @param {string} p.containerId
   * @param {(info: {attempt:number, status_code?:string, status?:string})=>void} [p.onProgress]
   */
  async waitContainerFinished({ containerId, onProgress } = {}) {
    const start = now();
    const { minIntervalMs, maxIntervalMs, maxAttempts, totalTimeoutMs } = this.pollCfg;

    let attempt = 0;
    let interval = minIntervalMs;

    while (true) {
      if (attempt >= maxAttempts) {
        const e = new Error(`Max attempts reached (${maxAttempts}) waiting for FINISHED`);
        e.status = 504; throw e;
      }
      if (now() - start > totalTimeoutMs) {
        const e = new Error(`Total timeout exceeded (${Math.round(totalTimeoutMs/1000)}s)`);
        e.status = 504; throw e;
      }

      try {
        const { data } = await this._requestWithRetry(
          () => this.http.get(`${this.graph}/${containerId}`, {
            params: { access_token: this.accessToken, fields: 'status_code,status' },
          }),
          { tries: 2, baseDelayMs: 800 }
        );

        const code = data?.status_code; // IN_PROGRESS | FINISHED | ERROR | EXPIRED
        const statusText = data?.status;
        if (onProgress) onProgress({ attempt, status_code: code, status: statusText });

        if (code === 'FINISHED') return data;

        if (code === 'ERROR' || code === 'EXPIRED') {
          const e = new Error(`Container ${code}: ${statusText || ''}`.trim());
          e.status = 400; e.code = code; throw e;
        }

        // si le champ est manquant, on attend un peu puis on re-tente
        if (!code) {
          await sleep(this._jittered(interval));
          interval = Math.min(Math.floor(interval * 1.5), maxIntervalMs);
          attempt += 1;
          continue;
        }

        // IN_PROGRESS : backoff exponentiel + jitter
        await sleep(this._jittered(interval));
        interval = Math.min(Math.floor(interval * 1.5), maxIntervalMs);
        attempt += 1;
      } catch (error) {
        // si l'API est KO momentanément, on attend et on repart
        const status = error?.response?.status || error.status;
        if (this._isRetryableStatus(status)) {
          await sleep(this._jittered(interval));
          interval = Math.min(Math.floor(interval * 1.5), maxIntervalMs);
          attempt += 1;
          continue;
        }
        // sinon on remonte l'erreur
        const msg = error?.response?.data?.error?.message || error.message || 'Failed while polling container';
        const e = new Error(msg);
        e.status = status || 500;
        e.code = error?.code || error?.response?.data?.error?.code;
        e.subcode = error?.response?.data?.error?.error_subcode;
        throw e;
      }
    }
  }

  // 3) Publication
  async publishContainer({ containerId }) {
    const doCall = () => this.http.post(
      `${this.graph}/${this.igUserId}/media_publish`,
      null,
      { params: { creation_id: containerId, access_token: this.accessToken } }
    );

    try {
      const { data } = await this._requestWithRetry(doCall, { tries: 3, baseDelayMs: 1200 });
      if (!data?.id) {
        const e = new Error('Publish returned no media id');
        e.status = 502; throw e;
      }
      return data.id; // media_id
    } catch (error) {
      const payload = error?.response?.data;
      console.error('IG /media_publish error:', {
        status: error?.response?.status,
        data: payload,
      });
      const e = new Error(payload?.error?.message || error.message || 'Failed to publish IG media');
      e.status = error?.response?.status || 500;
      e.code = payload?.error?.code;
      e.subcode = payload?.error?.error_subcode;
      throw e;
    }
  }

  // 4) (optionnel) Récupérer le permalink pour confirmer que c’est en ligne
  async getMediaPermalink(mediaId) {
    const { data } = await this.http.get(`${this.graph}/${mediaId}`, {
      params: { access_token: this.accessToken, fields: 'id,permalink,media_type' },
    });
    return data;
  }

  // 5) Méthode “tout-en-un”
  async publishReel(description, videoUrl, { onProgress } = {}) {
    const containerId = await this.createReelContainer({ description, videoUrl });
    await this.waitContainerFinished({ containerId, onProgress });
    const mediaId = await this.publishContainer({ containerId });
    // Optionnel : vérifier le permalink
    let permalink;
    try {
      const media = await this.getMediaPermalink(mediaId);
      permalink = media?.permalink;
    } catch {}
    return { message: 'Reel published on IG', media_id: mediaId, container_id: containerId, permalink };
  }
}

module.exports = { Instagram };