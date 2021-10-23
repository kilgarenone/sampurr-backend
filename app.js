import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
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
  "http://localhost:8008" /* "https://example-prod-app.com */,
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
  const { start, end, title, id } = req.query;

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

  try {
    await ffmpeg;
  } catch (error) {
    // TODO: log error
  }
});

const SOMETHING_WENT_WRONG_ERROR_TEMPLATE = (msg) =>
  `<p>Something went wrong</p><p class="error-desc">${msg}</p>`;
const FILE_TOO_BIG_ERROR_TEMPLATE = `<p>Wow it's so big</p><p class="error-desc">Try an upload that's less than 10 minutes long</p>`;

// health check
app.get("/sup", (req, res) => {
  res.send("sup");
});

app.get("/waveform", async (req, res) => {
  const { url } = req.query;
  const tempId = await nanoid(5);

  let downloadAudioProcess;
  let getMediaInfoProcess;
  let waveformProcess;
  let trackID = "";
  let tempFilePath = "";
  let filePath = "";

  req.on("aborted", function () {
    getMediaInfoProcess && getMediaInfoProcess.cancel();
    downloadAudioProcess && downloadAudioProcess.cancel();
    waveformProcess && waveformProcess.cancel();
  });

  res.writeHead(200, {
    "Content-Type": "application/json",
    "X-Accel-Buffering": "no", // this is the key for streaming response with NginX!!
    "Cache-Control": "no-cache",
    "Content-Encoding": "none",
    Connection: "keep-alive",
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

    const [title, id, thumbnail, duration] = mediaInfo
      .split(/\r|\n/g)
      .filter(Boolean);

    // restrict media duration to less than 10 minutes
    const durationArr = duration.split(":");

    if (durationArr.length > 2 || durationArr[0] >= 10) {
      return res.end(
        JSON.stringify({ errorMessage: FILE_TOO_BIG_ERROR_TEMPLATE })
      );
    }

    trackID = id;
    tempFilePath = path.join(__dirname, "tmp", `${trackID}_${tempId}.wav`);
    filePath = path.join(__dirname, "tmp", `${trackID}.wav`);

    res.write(JSON.stringify({ title, thumbnail, duration, id }));
  } catch (err) {
    if (!err.isCanceled) {
      return res.end(
        JSON.stringify({
          errorMessage: SOMETHING_WENT_WRONG_ERROR_TEMPLATE(err.stderr),
        })
      );
    }
    return res.end();
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

      await fs.rename(tempFilePath, filePath);
    }
  } catch (err) {
    if (!err.isCanceled) {
      return res.end(
        JSON.stringify({
          errorMessage: SOMETHING_WENT_WRONG_ERROR_TEMPLATE(err.stderr),
        })
      );
    }

    const files = await fs.readdir(tmpPath);

    const filesToBeDeleted = files.map(async (file) => {
      if (file.indexOf(`${trackID}_${tempId}`) > -1) {
        return fs.unlink(path.join(tmpPath, file));
      }
      return;
    });

    await Promise.all(filesToBeDeleted);

    return res.end();
  }

  res.write(
    JSON.stringify({
      status: "Generating waveform",
      ...(isFileExists ? { percent: "95" } : {}), // keep it in quotes cuz we in FE we split by `"}`
    })
  );

  waveformProcess = execa("audiowaveform", [
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
    if (!err.isCanceled) {
      return res.end(
        JSON.stringify({
          errorMessage: SOMETHING_WENT_WRONG_ERROR_TEMPLATE(err.stderr),
        })
      );
    }

    res.end();
  }
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
