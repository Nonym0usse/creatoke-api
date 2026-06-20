import fs from "node:fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface CompressOptions {
  crf?: number;
  preset?: string;
}

export async function videoCompress(
  inputPath: string,
  outputPath: string,
  options: CompressOptions = {},
): Promise<string> {
  const { crf = 26, preset = "fast" } = options;

  return new Promise<string>((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      reject(new Error("❌ Fichier source introuvable : " + inputPath));
      return;
    }

    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        `-preset ${preset}`,
        `-crf ${crf}`,
        "-b:a 128k",
        "-movflags +faststart",
        "-map_metadata -1",
        "-vf scale='min(1920,iw)':-2,setsar=1,format=yuv420p", // ✅ stable et compatible
        "-metadata:s:v rotate=0", // ✅ ignore rotation
      ])
      .on("start", (cmd: string) => console.log("🚀 FFmpeg:", cmd))
      .on("progress", (p: { percent?: number }) =>
        process.stdout.write(`⏳ ${p.percent?.toFixed(1)}%   \r`),
      )
      .on("end", () => {
        console.log(`\n✅ Compression terminée : ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err: Error) => {
        console.error("\n❌ Erreur FFmpeg :", err.message);
        reject(err);
      })
      .save(outputPath);
  });
}
