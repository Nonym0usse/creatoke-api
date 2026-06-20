import axios from "axios";

interface BlueskyAuthResponse {
  accessJwt: string;
  refreshJwt?: string;
  did?: string;
}

export class Bluesky {
  async loginOnBlueSky(): Promise<string> {
    try {
      const loginData = {
        identifier: process.env.BLUESKY_EMAIL,
        password: process.env.BLUESKY_PASSWORD,
      };
      const blueSkyAuth = await axios.post<BlueskyAuthResponse>(
        process.env.BLUESKY_AUTH as string,
        loginData,
        { timeout: 5 * 60 * 1000 },
      );
      return blueSkyAuth.data.accessJwt;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message || "Bluesky login failed");
      }
      throw new Error(error instanceof Error ? error.message : "Bluesky login failed");
    }
  }
}
