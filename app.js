import express from "express";
import cors from "cors";
import createError from "http-errors";
import fs from "fs";
import path from "path";
import execa from "execa";
import readline from "readline";
import { nanoid } from "nanoid/async";
import { checkFileExists, getDownloadProgress } from "./functions.js";

const app = express();
const isProduction = app.get("env") === "production";
// to fix 'ReferenceError: __dirname is not defined in ES module scope'
const __dirname = path.resolve();

if (isProduction) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.set("port", process.env.PORT || 4000);

app.use(express.json());

app.use(express.static("tmp"));

// url of your client
const ALLOWED_ORIGINS = [
  "http://localhost:8080" /* "https://example-prod-app.com */,
];

app.use(
  cors({
    credentials: true, // include Access-Control-Allow-Credentials: true. remember set xhr.withCredentials = true;
    origin(origin, callback) {
      // allow requests with no origin
      // (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not " +
          "allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

const tmpPath = path.join(__dirname, "/tmp");

app.get("/download", async (req, res) => {
  let { start, end, title, id } = req.query;

  res.setHeader("Content-disposition", `attachment; filename=${title}.wav`);
  res.setHeader("Content-type", "audio/wav");

  const ffmpeg = execa("ffmpeg", [
    "-i",
    path.join(tmpPath, `${id}.wav`),
    "-ss",
    start,
    "-to",
    end,
    "-f",
    "wav",
    "pipe:1",
  ]);

  ffmpeg.stdout.pipe(res);

  await ffmpeg;
  // error logging
  ffmpeg.stderr.setEncoding("utf8");
  ffmpeg.stderr.on("data", (data) => {
    console.log(data);
  });
});

app.get("/waveform", async (req, res) => {
  const { url } = req.query;
  const tempId = await nanoid(5);

  let downloadAudioProcess;
  let getMediaInfoProcess;
  let trackID = "";
  let tempFilePath = "";
  let filePath = "";

  req.on("aborted", function () {
    console.log("aborte");
    getMediaInfoProcess && getMediaInfoProcess.cancel();
    downloadAudioProcess && downloadAudioProcess.cancel();
  });

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Transfer-Encoding": "chunked",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
  });

  getMediaInfoProcess = execa("yt-dlp", [
    url,
    "--get-title",
    "--get-thumbnail",
    "--get-duration",
    "--get-id",
  ]);

  try {
    const { stdout: mediaInfo } = await getMediaInfoProcess;
    console.log("mediaInfo:", mediaInfo);

    const [title, id, thumbnail, duration] = mediaInfo
      .split(/\r|\n/g)
      .filter(Boolean);

    trackID = id;
    tempFilePath = path.join(__dirname, "tmp", `${trackID}_${tempId}.wav`);
    filePath = path.join(__dirname, "tmp", `${trackID}.wav`);

    res.write(JSON.stringify({ title, thumbnail, duration, id }));
  } catch (err) {
    console.log("err in getMediaInfoProcess:", err);
  }

  const isFileExists = await checkFileExists(filePath);

  try {
    if (!isFileExists) {
      // TODO: maybe try -f bestaudio
      downloadAudioProcess = execa("yt-dlp", [
        url,
        // "--audio-quality",
        // "0",
        "--extract-audio",
        "--audio-format",
        "wav",
        "--output",
        path.join(tmpPath, `${trackID}_${tempId}.%(ext)s`),
      ]);

      const rl = readline.createInterface(downloadAudioProcess.stdout);

      rl.on("line", (input) => {
        const progress = getDownloadProgress(input);
        progress && res.write(JSON.stringify(progress));
      });

      await downloadAudioProcess;

      await fs.promises.rename(tempFilePath, filePath);
    }
  } catch (err) {
    if (!err.isCanceled && !err.killed) {
      // TODO: ask client to try again
    }
    // TODO: youtube-dl error will be here. handle them for client. ask for retry
    console.log("err in downloadAudioProcess", err);
    // Get the files as an array
    const files = await fs.promises.readdir(tmpPath, { withFileTypes: true });

    // Loop them all with the new for...of
    for (const file of files) {
      if (file.name.indexOf(`${trackID}_${tempId}`) === 0) {
        fs.unlink(path.join(tmpPath, file.name), function (err) {
          if (err) console.log("err in deleting temp files", err);
        });
      }
    }
  }

  res.write(
    JSON.stringify({
      status: "Generating waveform",
      ...(isFileExists ? { percent: "99" } : {}), // keep it in quotes cuz we in FE we split by `"}`
    })
  );

  const waveformProcess = execa("audiowaveform", [
    "-i",
    filePath,
    "-o",
    "-", // output to stdout
    "--bits",
    8, // try 16
    "--pixels-per-second",
    20, // try 25
    "--output-format",
    "json",
  ]);

  waveformProcess.stdout.pipe(res);

  try {
    await waveformProcess;
  } catch (err) {
    console.log("err in waveformProcess", err);
  }
});

// central custom error handler
// NOTE: DON"T REMOVE THE 'next'!!!!!
app.use(function (err, req, res, next) {
  console.log("err:", err);
  const error = createError(500, "Something went wrong. Alerted developer");

  res.status(error.status).json(error);
});

process.on("unhandledRejection", (reason, p) => {
  console.log("reason:", reason);
  // Error not caught in promises(ie. forgot the 'catch' block) will get swallowed and disappear.
  // I just caught an unhandled promise rejection,
  // since we already have fallback handler for unhandled errors (see below),
  // let throw and let him handle that
  throw reason;
});

// mainly to catch those from third-party lib. for own code, catch it in try/catch
process.on("uncaughtException", function (err) {
  console.log("err:", err);
  process.exit(1);
});

export default app;
