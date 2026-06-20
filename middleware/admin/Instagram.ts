import axios, { type AxiosInstance } from "axios";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const now = (): number => Date.now();

class HttpError extends Error {
  status?: number;
  code?: number | string;
  subcode?: number;
}

interface PollConfig {
  minIntervalMs: number;
  maxIntervalMs: number;
  maxAttempts: number;
  totalTimeoutMs: number;
}

interface InstagramOptions {
  accessToken?: string;
  igUserId?: string;
  graphVersion?: string;
  requestTimeoutMs?: number;
  poll?: Partial<PollConfig>;
}

interface ProgressInfo {
  attempt: number;
  status_code?: string;
  status?: string;
}

type OnProgress = (info: ProgressInfo) => void;

export class Instagram {
  private accessToken?: string;
  private igUserId?: string;
  private graph: string;
  private graphVideo: string;
  private http: AxiosInstance;
  private pollCfg: PollConfig;

  constructor(options: InstagramOptions = {}) {
    const {
      accessToken = process.env.FB_ACCESS_TOKEN,
      igUserId = process.env.IG_USER_ID,
      graphVersion = "v23.0",
      requestTimeoutMs = 30_000,
      poll = {},
    } = options;
    const {
      minIntervalMs = 3000,
      maxIntervalMs = 15000,
      maxAttempts = 120, // ~ 3–30 min selon backoff
      totalTimeoutMs = 10 * 60 * 1000, // 10 min max
    } = poll;

    this.accessToken = accessToken;
    this.igUserId = igUserId;
    this.graph = `https://graph.facebook.com/${graphVersion}`;
    this.graphVideo = `https://graph-video.facebook.com/${graphVersion}`;
    this.http = axios.create({ timeout: requestTimeoutMs });

    this.pollCfg = { minIntervalMs, maxIntervalMs, maxAttempts, totalTimeoutMs };
  }

  // --- helpers --------------------------------------------------------------

  private _isRetryableStatus(status: number | undefined): boolean {
    // 5xx, 429 Too Many Requests
    return status !== undefined && (status >= 500 || status === 429);
  }

  private _isRetryableFacebookCode(code: number | undefined): boolean {
    // Meta throttling : 613, 4 (application request limit reached), etc.
    return code === 613 || code === 4;
  }

  private _jittered(nextMs: number): number {
    // random 80-120% pour éviter le thundering herd
    const jitter = 0.8 + Math.random() * 0.4;
    return Math.max(1000, Math.floor(nextMs * jitter));
  }

  private async _requestWithRetry<T>(
    fn: () => Promise<T>,
    { tries = 4, baseDelayMs = 1000 }: { tries?: number; baseDelayMs?: number } = {},
  ): Promise<T> {
    let attempt = 0;
    let delay = baseDelayMs;
    let lastErr: unknown;
    while (attempt < tries) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const code = axios.isAxiosError(err) ? err.response?.data?.error?.code : undefined;

        if (!this._isRetryableStatus(status) && !this._isRetryableFacebookCode(code)) {
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
  async createReelContainer({
    description,
    videoUrl,
  }: {
    description: string;
    videoUrl: string;
  }): Promise<string> {
    if (!description || !videoUrl) throw new Error("description et videoUrl sont requis");

    const doCall = () =>
      this.http.post(`${this.graphVideo}/${this.igUserId}/media`, null, {
        params: {
          caption: description,
          media_type: "REELS",
          video_url: videoUrl,
          access_token: this.accessToken,
        },
      });

    try {
      const { data } = await this._requestWithRetry(doCall, { tries: 3, baseDelayMs: 1200 });
      if (!data?.id) {
        const e = new HttpError("Container creation returned no id");
        e.status = 502;
        throw e;
      }
      return data.id; // container_id
    } catch (error) {
      const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
      console.error("IG /media error:", {
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
        data: payload,
      });
      const e = new HttpError(
        payload?.error?.message ||
          (error instanceof Error ? error.message : "Failed to create IG container"),
      );
      e.status = (axios.isAxiosError(error) ? error.response?.status : undefined) ?? 500;
      e.code = payload?.error?.code;
      e.subcode = payload?.error?.error_subcode;
      throw e;
    }
  }

  // 2) Poll du status jusqu'à FINISHED
  async waitContainerFinished({
    containerId,
    onProgress,
  }: {
    containerId: string;
    onProgress?: OnProgress;
  }): Promise<unknown> {
    const start = now();
    const { minIntervalMs, maxIntervalMs, maxAttempts, totalTimeoutMs } = this.pollCfg;

    let attempt = 0;
    let interval = minIntervalMs;

    while (true) {
      if (attempt >= maxAttempts) {
        const e = new HttpError(`Max attempts reached (${maxAttempts}) waiting for FINISHED`);
        e.status = 504;
        throw e;
      }
      if (now() - start > totalTimeoutMs) {
        const e = new HttpError(`Total timeout exceeded (${Math.round(totalTimeoutMs / 1000)}s)`);
        e.status = 504;
        throw e;
      }

      try {
        const { data } = await this._requestWithRetry(
          () =>
            this.http.get(`${this.graph}/${containerId}`, {
              params: { access_token: this.accessToken, fields: "status_code,status" },
            }),
          { tries: 2, baseDelayMs: 800 },
        );

        const code: string | undefined = data?.status_code; // IN_PROGRESS | FINISHED | ERROR | EXPIRED
        const statusText: string | undefined = data?.status;
        if (onProgress) onProgress({ attempt, status_code: code, status: statusText });

        if (code === "FINISHED") return data;

        if (code === "ERROR" || code === "EXPIRED") {
          const e = new HttpError(`Container ${code}: ${statusText || ""}`.trim());
          e.status = 400;
          e.code = code;
          throw e;
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
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : (error as HttpError).status;
        if (this._isRetryableStatus(status)) {
          await sleep(this._jittered(interval));
          interval = Math.min(Math.floor(interval * 1.5), maxIntervalMs);
          attempt += 1;
          continue;
        }
        // sinon on remonte l'erreur
        const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
        const msg =
          payload?.error?.message ||
          (error instanceof Error ? error.message : "Failed while polling container");
        const e = new HttpError(msg);
        e.status = status || 500;
        e.code = (error as HttpError).code || payload?.error?.code;
        e.subcode = payload?.error?.error_subcode;
        throw e;
      }
    }
  }

  // 3) Publication
  async publishContainer({ containerId }: { containerId: string }): Promise<string> {
    const doCall = () =>
      this.http.post(`${this.graph}/${this.igUserId}/media_publish`, null, {
        params: { creation_id: containerId, access_token: this.accessToken },
      });

    try {
      const { data } = await this._requestWithRetry(doCall, { tries: 3, baseDelayMs: 1200 });
      if (!data?.id) {
        const e = new HttpError("Publish returned no media id");
        e.status = 502;
        throw e;
      }
      return data.id; // media_id
    } catch (error) {
      const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
      console.error("IG /media_publish error:", {
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
        data: payload,
      });
      const e = new HttpError(
        payload?.error?.message ||
          (error instanceof Error ? error.message : "Failed to publish IG media"),
      );
      e.status = (axios.isAxiosError(error) ? error.response?.status : undefined) ?? 500;
      e.code = payload?.error?.code;
      e.subcode = payload?.error?.error_subcode;
      throw e;
    }
  }

  // 4) (optionnel) Récupérer le permalink pour confirmer que c'est en ligne
  async getMediaPermalink(mediaId: string): Promise<unknown> {
    const { data } = await this.http.get(`${this.graph}/${mediaId}`, {
      params: { access_token: this.accessToken, fields: "id,permalink,media_type" },
    });
    return data;
  }

  // 5) Méthode "tout-en-un"
  async publishReel(
    description: string,
    videoUrl: string,
    { onProgress }: { onProgress?: OnProgress } = {},
  ): Promise<{
    message: string;
    media_id: string;
    container_id: string;
    permalink?: string;
  }> {
    const containerId = await this.createReelContainer({ description, videoUrl });
    await this.waitContainerFinished({ containerId, onProgress });
    const mediaId = await this.publishContainer({ containerId });
    // Optionnel : vérifier le permalink
    let permalink: string | undefined;
    try {
      const media = (await this.getMediaPermalink(mediaId)) as { permalink?: string };
      permalink = media?.permalink;
    } catch {
      /* ignore */
    }
    return {
      message: "Reel published on IG",
      media_id: mediaId,
      container_id: containerId,
      permalink,
    };
  }
}
