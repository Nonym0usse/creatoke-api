const axios = require('axios');

class Instagram {
    constructor({
        accessToken = process.env.FB_ACCESS_TOKEN,              // ⚠️ utilise bien le PAGE ACCESS TOKEN
        igUserId = process.env.IG_USER_ID,
        graphVersion = 'v23.0',
    } = {}) {
        this.accessToken = accessToken;
        this.igUserId = igUserId;
        this.graph = `https://graph.facebook.com/${graphVersion}`;
        this.graphVideo = `https://graph-video.facebook.com/${graphVersion}`;
        this.http = axios.create({ timeout: 30_000 });
    }

    // 1) Création du container
    async createReelContainer({ description, videoUrl }) {
        if (!description || !videoUrl) {
            throw new Error('description et videoUrl sont requis');
        }

        try {
            const { data } = await this.http.post(
                `${this.graphVideo}/${this.igUserId}/media`,
                null,
                {
                    params: {
                        caption: description,
                        media_type: 'REELS',
                        video_url: videoUrl,
                        access_token: this.accessToken, // PAGE ACCESS TOKEN de la page liée à IG
                        // ❌ surtout pas de "published" ici
                    },
                }
            );
            return data.id; // container_id
        } catch (error) {
            const payload = error?.response?.data;
            console.error('IG /media error:', {
                status: error?.response?.status,
                data: payload,
            });
            const e = new Error(
                payload?.error?.message || error.message || 'Failed to create IG container'
            );
            e.status = error?.response?.status || 500;
            e.code = payload?.error?.code;
            e.subcode = payload?.error?.error_subcode;
            throw e;
        }
    }

    // 2) Poll du status jusqu'à FINISHED
    async waitContainerFinished({ containerId, intervalMs = 5000, timeoutMs = 5 * 60 * 1000 }) {
        const start = Date.now();
        while (true) {
            try {
                const { data } = await this.http.get(
                    `${this.graphBase}/${containerId}`,
                    {
                        params: {
                            access_token: this.accessToken,
                            fields: 'status_code,status',
                        },
                    }
                );

                const code = data?.status_code; // IN_PROGRESS | FINISHED | ERROR | EXPIRED
                if (code === 'FINISHED') return data;

                if (code === 'ERROR' || code === 'EXPIRED') {
                    const e = new Error(`Container not publishable: ${data?.status || code}`);
                    e.code = code; e.status = 400; throw e;
                }

                if (Date.now() - start > timeoutMs) {
                    const e = new Error(`Timeout waiting for container to finish (last: ${code || 'unknown'})`);
                    e.status = 504; throw e;
                }

                await new Promise(r => setTimeout(r, intervalMs));
            } catch (error) {
                // remonte les erreurs réseau proprement
                const msg = error?.response?.data?.error?.message || error.message || 'Failed while polling container';
                const status = error?.status || error?.response?.status || 500;
                const e = new Error(msg); e.status = status; throw e;
            }
        }
    }

    // 3) Publication
    async publishContainer({ containerId }) {
        try {
            const { data } = await this.http.post(
                `${this.graphBase}/${this.igUserId}/media_publish`,
                null,
                {
                    params: {
                        creation_id: containerId,
                        access_token: this.accessToken,
                    },
                }
            );
            return data.id; // media_id
        } catch (error) {
            const msg = error?.response?.data?.error?.message || error.message || 'Failed to publish IG media';
            const status = error?.response?.status || 500;
            const e = new Error(msg); e.status = status; throw e;
        }
    }

    // Méthode “tout-en-un”
    async publishReel(description, videoUrl) {
        const containerId = await this.createReelContainer({ description, videoUrl });
        await this.waitContainerFinished({ containerId });
        const mediaId = await this.publishContainer({ containerId });
        return { message: 'Reel published on IG', media_id: mediaId, container_id: containerId };
    }
}

module.exports = { Instagram };