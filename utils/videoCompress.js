const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function videoCompress(inputPath, outputPath, options = {}) {
    const { crf = 26, preset = "fast" } = options;

    return new Promise((resolve, reject) => {
        if (!fs.existsSync(inputPath)) {
            return reject(new Error("❌ Fichier source introuvable : " + inputPath));
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
                "-metadata:s:v rotate=0" // ✅ ignore rotation
            ])
            .on("start", (cmd) => console.log("🚀 FFmpeg:", cmd))
            .on("progress", (p) => process.stdout.write(`⏳ ${p.percent?.toFixed(1)}%   \r`))
            .on("end", () => {
                console.log(`\n✅ Compression terminée : ${outputPath}`);
                resolve(outputPath);
            })
            .on("error", (err) => {
                console.error("\n❌ Erreur FFmpeg :", err.message);
                reject(err);
            })
            .save(outputPath);
    });
}

// ✅ Export de la fonction
module.exports = { videoCompress };